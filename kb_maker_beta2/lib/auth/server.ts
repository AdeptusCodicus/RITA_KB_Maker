import { headers } from 'next/headers';
import {
  getUserDoc,
  upsertUserDoc,
  getTeamDoc,
  isSuperadminEmail,
  isEmailInOrganization,
} from '@/lib/firestore';
import type { AuthSession, UserRole } from '@/types/auth';

/**
 * Extracts the authenticated email from Google Cloud IAP headers or development fallback.
 */
export async function getAuthenticatedEmailFromHeaders(
  reqHeaders?: Headers
): Promise<string | null> {
  const h = reqHeaders || (await headers());

  // 1. Google Cloud Identity-Aware Proxy (IAP) header
  const iapEmail = h.get('x-goog-authenticated-user-email');
  if (iapEmail) {
    // Format is typically accounts.google.com:username@domain.com
    const cleanEmail = iapEmail.replace(/^accounts\.google\.com:/i, '').trim().toLowerCase();
    if (cleanEmail) return cleanEmail;
  }

  // 2. Client-provided dev switcher cookie / header (for local testing outside IAP)
  const devHeader = h.get('x-dev-user-email');
  if (devHeader && process.env.NODE_ENV !== 'production') {
    return devHeader.trim().toLowerCase();
  }

  const cookieHeader = h.get('cookie');
  if (cookieHeader && process.env.NODE_ENV !== 'production') {
    const match = cookieHeader.match(/kb_dev_email=([^;]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]).trim().toLowerCase();
    }
  }

  // 3. Fallback from environment (DEV_AUTH_EMAIL) in local dev
  if (process.env.DEV_AUTH_EMAIL) {
    return process.env.DEV_AUTH_EMAIL.trim().toLowerCase();
  }

  return null;
}

/**
 * Resolves the full AuthSession for the current user.
 */
export async function getServerSession(reqHeaders?: Headers): Promise<AuthSession> {
  const email = await getAuthenticatedEmailFromHeaders(reqHeaders);

  if (!email) {
    return {
      authenticated: false,
      email: null,
      name: null,
      isSuperadmin: false,
      teamId: null,
      teamName: null,
      role: 'unassigned',
      status: 'unauthenticated',
    };
  }

  // Check superadmin status from environment
  const isSuperadmin = isSuperadminEmail(email);

  // Look up user document from Firestore
  let userDoc = await getUserDoc(email);

  // If user doesn't exist yet, auto-provision initial user record
  if (!userDoc) {
    userDoc = await upsertUserDoc(email, {
      name: email.split('@')[0],
      teamId: null,
      teamRole: null,
      status: 'active',
      lastLoginAt: new Date().toISOString(),
    });
  } else {
    // Update lastLoginAt
    await upsertUserDoc(email, {
      lastLoginAt: new Date().toISOString(),
    });
  }

  // If superadmin, grant superadmin role regardless of team assignment
  if (isSuperadmin) {
    let teamName: string | null = null;
    if (userDoc.teamId) {
      const team = await getTeamDoc(userDoc.teamId);
      teamName = team ? team.name : null;
    }

    return {
      authenticated: true,
      email,
      name: userDoc.name || email.split('@')[0],
      avatarUrl: userDoc.avatarUrl,
      isSuperadmin: true,
      teamId: userDoc.teamId,
      teamName,
      role: 'superadmin',
      status: 'active',
    };
  }

  // Non-superadmin: check team membership
  if (!userDoc.teamId) {
    return {
      authenticated: true,
      email,
      name: userDoc.name || email.split('@')[0],
      avatarUrl: userDoc.avatarUrl,
      isSuperadmin: false,
      teamId: null,
      teamName: null,
      role: 'unassigned',
      status: 'unassigned',
    };
  }

  // Resolve team
  const team = await getTeamDoc(userDoc.teamId);
  if (!team) {
    return {
      authenticated: true,
      email,
      name: userDoc.name || email.split('@')[0],
      avatarUrl: userDoc.avatarUrl,
      isSuperadmin: false,
      teamId: null,
      teamName: null,
      role: 'unassigned',
      status: 'unassigned',
    };
  }

  // Determine role in the team
  const isAdmin =
    team.adminEmails.includes(email) || userDoc.teamRole === 'admin';
  const resolvedRole: UserRole = isAdmin
    ? 'admin'
    : userDoc.teamRole === 'editor'
    ? 'editor'
    : 'viewer';

  return {
    authenticated: true,
    email,
    name: userDoc.name || email.split('@')[0],
    avatarUrl: userDoc.avatarUrl,
    isSuperadmin: false,
    teamId: team.id,
    teamName: team.name,
    role: resolvedRole,
    status: 'active',
  };
}

/**
 * Route protection helper for API routes.
 */
export async function requireAuth(
  reqHeaders?: Headers,
  allowedRoles?: UserRole[]
): Promise<{ errorResponse?: Response; session: AuthSession }> {
  const session = await getServerSession(reqHeaders);

  if (!session.authenticated) {
    return {
      session,
      errorResponse: new Response(
        JSON.stringify({ error: 'Authentication required. Please sign in.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  if (session.status === 'unassigned' && allowedRoles && !allowedRoles.includes('unassigned')) {
    return {
      session,
      errorResponse: new Response(
        JSON.stringify({
          error: 'Access pending. You have not been assigned to a team yet.',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  if (allowedRoles && allowedRoles.length > 0) {
    // Superadmins always pass role checks
    if (!session.isSuperadmin && !allowedRoles.includes(session.role)) {
      return {
        session,
        errorResponse: new Response(
          JSON.stringify({ error: 'Permission denied. Insufficient role.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        ),
      };
    }
  }

  return { session };
}
