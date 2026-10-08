import fs from 'node:fs';
import path from 'node:path';
import { JWT } from 'google-auth-library';
import { isEmailInOrganization } from './firestore';

export interface GoogleUserVerificationResult {
  exists: boolean;
  verified: boolean;
  email: string;
  name?: string;
  error?: string;
}

interface CachedResult {
  result: GoogleUserVerificationResult;
  expiresAt: number;
}

// 10 minute memory cache for verified users
const verificationCache = new Map<string, CachedResult>();
const CACHE_TTL_MS = 10 * 60 * 1000;

let cachedKeyJson: { client_email: string; private_key: string; client_id?: string } | null = null;

function loadServiceAccountKey(): { client_email: string; private_key: string; client_id?: string } | null {
  if (cachedKeyJson) return cachedKeyJson;

  // 1. Direct environment variable containing JSON or Base64 JSON
  const inlineCandidates = [
    process.env.GOOGLE_WORKSPACE_CREDENTIALS_JSON,
    process.env.GMAIL_SERVICE_ACCOUNT_JSON,
  ];

  for (const raw of inlineCandidates) {
    if (raw && raw.trim()) {
      try {
        const text = raw.trim();
        const parsed = JSON.parse(text.startsWith('{') ? text : Buffer.from(text, 'base64').toString('utf-8'));
        if (parsed.client_email && parsed.private_key) {
          cachedKeyJson = parsed;
          return cachedKeyJson;
        }
      } catch (e) {
        console.warn('[GoogleWorkspace] Failed to parse inline service account JSON:', e);
      }
    }
  }

  if (process.env.GOOGLE_WORKSPACE_CREDENTIALS_BASE64) {
    try {
      const decoded = Buffer.from(process.env.GOOGLE_WORKSPACE_CREDENTIALS_BASE64.trim(), 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      if (parsed.client_email && parsed.private_key) {
        cachedKeyJson = parsed;
        return cachedKeyJson;
      }
    } catch (e) {
      console.warn('[GoogleWorkspace] Failed to parse base64 service account key:', e);
    }
  }

  // 2. File path candidates
  const candidatePaths = [
    process.env.GOOGLE_WORKSPACE_CREDENTIALS_PATH,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(process.cwd(), 'service-account.json'),
    path.resolve(process.cwd(), '../service-account.json'),
    path.resolve(process.cwd(), '../gchat-integration/python_backend/rgpt-gchat-test-2a9e713c2642.json'),
    path.resolve(process.cwd(), '../../gchat-integration/python_backend/rgpt-gchat-test-2a9e713c2642.json'),
    '/Users/matt/Documents/gchat-integration/python_backend/rgpt-gchat-test-2a9e713c2642.json',
  ].filter(Boolean) as string[];

  for (const candidate of candidatePaths) {
    try {
      if (fs.existsSync(candidate)) {
        const content = fs.readFileSync(candidate, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed.client_email && parsed.private_key) {
          cachedKeyJson = parsed;
          return cachedKeyJson;
        }
      }
    } catch (e) {
      console.warn(`[GoogleWorkspace] Failed to read key file at ${candidate}:`, e);
    }
  }

  return null;
}

/**
 * Derives a human-readable name from an email address (e.g. candyd.sarion@foodgroup.ph -> Candyd Sarion)
 */
export function formatNameFromEmail(email: string): string {
  const localPart = email.split('@')[0] || '';
  return localPart
    .split(/[._-]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Authoritatively verifies whether an email address exists in the Google Workspace domain
 * by minting a Domain-Wide Delegation token impersonating the subject.
 */
export async function verifyGoogleWorkspaceUser(
  email: string
): Promise<GoogleUserVerificationResult> {
  const normalized = (email || '').trim().toLowerCase();

  if (!normalized) {
    return {
      exists: false,
      verified: true,
      email: '',
      error: 'Email address is required',
    };
  }

  // 1. Organization domain check
  if (!isEmailInOrganization(normalized)) {
    return {
      exists: false,
      verified: true,
      email: normalized,
      error: 'Email does not belong to authorized organization domain(s)',
    };
  }

  // 2. Cache check
  const now = Date.now();
  const cached = verificationCache.get(normalized);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  // 3. Load DWD Service Account key
  const key = loadServiceAccountKey();
  if (!key) {
    console.error('[GoogleWorkspace] No service account key found for DWD verification');
    return {
      exists: false,
      verified: false,
      email: normalized,
      error: 'Google Workspace verification service credentials not configured',
    };
  }

  try {
    const jwt = new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: normalized,
    });

    const tokenResponse = await jwt.getAccessToken();

    if (tokenResponse && tokenResponse.token) {
      const result: GoogleUserVerificationResult = {
        exists: true,
        verified: true,
        email: normalized,
        name: formatNameFromEmail(normalized),
      };
      verificationCache.set(normalized, {
        result,
        expiresAt: now + CACHE_TTL_MS,
      });
      return result;
    }

    const fallback: GoogleUserVerificationResult = {
      exists: false,
      verified: true,
      email: normalized,
      error: 'Google did not return an access token for this account',
    };
    return fallback;
  } catch (error: any) {
    const message = error?.message || String(error);

    // Google returns "invalid_grant: Invalid email or User ID" when the account does not exist
    if (message.includes('invalid_grant')) {
      const result: GoogleUserVerificationResult = {
        exists: false,
        verified: true,
        email: normalized,
        error: 'User does not exist in Google Workspace organization',
      };
      // Cache non-existent results for 2 minutes to reduce duplicate lookups
      verificationCache.set(normalized, {
        result,
        expiresAt: now + 2 * 60 * 1000,
      });
      return result;
    }

    if (message.includes('unauthorized_client')) {
      const result: GoogleUserVerificationResult = {
        exists: false,
        verified: true,
        email: normalized,
        error: 'Client is unauthorized to impersonate this domain',
      };
      return result;
    }

    console.error('[GoogleWorkspace] Error validating user:', message);
    return {
      exists: false,
      verified: false,
      email: normalized,
      error: 'Unable to communicate with Google Workspace verification service',
    };
  }
}
