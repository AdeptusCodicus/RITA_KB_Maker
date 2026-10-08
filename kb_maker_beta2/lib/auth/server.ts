import { headers } from 'next/headers';
import {
  getUserDoc,
  upsertUserDoc,
  getTeamDoc,
  isSuperadminEmail,
  isEmailInOrganization,
} from '@/lib/firestore';
import type { AuthSession, UserRole } from '@/types/auth';

export interface SimulationConfig {
  mode: 'role' | 'user';
  role?: UserRole;
  teamId?: string | null;
  teamName?: string | null;
  email?: string;
}

/**
 * Extracts the real authenticated Google identity from IAP headers or dev fallback.
 */
export async function getRealAuthenticatedEmail(
  reqHeaders?: Headers
): Promise<string | null> {
  const h = reqHeaders || (await headers());

  // Check explicit dev sign-out cookie
  const cookieHeader = h.get('cookie');
  if (cookieHeader) {
    if (cookieHeader.includes('kb_dev_email=__signed_out__')) {
      return null;
    }
  }

  // 1. Google Cloud Identity-Aware Proxy (IAP) header
  const iapEmail = h.get('x-goog-authenticated-user-email');
  if (iapEmail) {
    const cleanEmail = iapEmail.replace(/^accounts\.google\.com:/i, '').trim().toLowerCase();
    if (cleanEmail) return cleanEmail;
  }

  // 2. Client-provided dev switcher header (for local testing outside IAP)
  const devHeader = h.get('x-dev-user-email');
  if (devHeader && process.env.NODE_ENV !== 'production') {
    const val = devHeader.trim().toLowerCase();
    if (val === '__signed_out__') return null;
    if (val) return val;
  }

  // 3. Fallback from environment (DEV_AUTH_EMAIL) in local dev
  if (process.env.DEV_AUTH_EMAIL) {
    return process.env.DEV_AUTH_EMAIL.trim().toLowerCase();
  }

  return null;
}

/**
 * Parses active simulation configuration from cookies.
 */
export function getSimulationConfigFromHeaders(
  reqHeaders?: Headers
): SimulationConfig | null {
  if (!reqHeaders) return null;
  const cookieHeader = reqHeaders.get('cookie');
  if (!cookieHeader) return null;

  // 1. JSON simulation cookie
  const simMatch = cookieHeader.match(/kb_simulation=([^;]+)/);
  if (simMatch && simMatch[1]) {
    try {
      const decoded = decodeURIComponent(simMatch[1]).trim();
      if (decoded === '__clear__' || decoded === '__signed_out__') return null;
      const parsed = JSON.parse(decoded);
      if (parsed && (parsed.mode === 'role' || parsed.mode === 'user')) {
        return parsed as SimulationConfig;
      }
    } catch {
      // ignore JSON parse failure
    }
  }

  // 2. Legacy dev email cookie
  const devMatch = cookieHeader.match(/kb_dev_email=([^;]+)/);
  if (devMatch && devMatch[1]) {
    const val = decodeURIComponent(devMatch[1]).trim().toLowerCase();
    if (val && val !== '__signed_out__') {
      return { mode: 'user', email: val };
    }
  }

  return null;
}

/**
 * Extracts authenticated email, respecting active simulation if enabled.
 */
export async function getAuthenticatedEmailFromHeaders(
  reqHeaders?: Headers
): Promise<string | null> {
  const session = await getServerSession(reqHeaders);
  return session.email;
}

/**
 * Resolves the full AuthSession for the current user, including role simulation.
 */
export async function getServerSession(reqHeaders?: Headers): Promise<AuthSession> {
  const h = reqHeaders || (await headers());
  const realEmail = await getRealAuthenticatedEmail(h);

  if (!realEmail) {
    return {
      authenticated: false,
      email: null,
      name: null,
      isSuperadmin: false,
      teamId: null,
      teamName: null,
      role: 'unassigned',
      status: 'unauthenticated',
      isSimulating: false,
      realEmail: null,
    };
  }

  const isRealSuperadmin = isSuperadminEmail(realEmail);
  const canSimulate = isRealSuperadmin || process.env.NODE_ENV !== 'production';

  // Check if simulation is requested and permitted
  if (canSimulate) {
    const simConfig = getSimulationConfigFromHeaders(h);
    if (simConfig) {
      if (simConfig.mode === 'role' && simConfig.role) {
        const simRole = simConfig.role;

        if (simRole === 'superadmin') {
          return {
            authenticated: true,
            email: realEmail,
            name: `${realEmail.split('@')[0]} (Simulating Superadmin)`,
            isSuperadmin: true,
            teamId: null,
            teamName: null,
            role: 'superadmin',
            status: 'active',
            isSimulating: true,
            realEmail,
            simulatedRole: 'superadmin',
          };
        }

        if (simRole === 'unassigned') {
          return {
            authenticated: true,
            email: realEmail,
            name: `${realEmail.split('@')[0]} (Simulating Unassigned)`,
            isSuperadmin: false,
            teamId: null,
            teamName: null,
            role: 'unassigned',
            status: 'unassigned',
            isSimulating: true,
            realEmail,
            simulatedRole: 'unassigned',
          };
        }

        // Team roles: admin, editor, viewer
        const simTeamId = simConfig.teamId || null;
        let simTeamName = simConfig.teamName || null;
        if (simTeamId && !simTeamName) {
          const t = await getTeamDoc(simTeamId);
          simTeamName = t ? t.name : null;
        }

        return {
          authenticated: true,
          email: realEmail,
          name: `${realEmail.split('@')[0]} (Simulating ${simRole})`,
          isSuperadmin: false,
          teamId: simTeamId,
          teamName: simTeamName,
          role: simRole,
          status: 'active',
          isSimulating: true,
          realEmail,
          simulatedRole: simRole,
        };
      }

      if (simConfig.mode === 'user' && simConfig.email) {
        const simEmail = simConfig.email.trim().toLowerCase();
        let userDoc = await getUserDoc(simEmail);
        if (!userDoc) {
          userDoc = await upsertUserDoc(simEmail, {
            name: simEmail.split('@')[0],
            teamId: null,
            teamRole: null,
            status: 'active',
            lastLoginAt: new Date().toISOString(),
          });
        }

        const isSimSuper = isSuperadminEmail(simEmail);
        if (isSimSuper) {
          let teamName: string | null = null;
          if (userDoc.teamId) {
            const team = await getTeamDoc(userDoc.teamId);
            teamName = team ? team.name : null;
          }
          return {
            authenticated: true,
            email: simEmail,
            name: userDoc.name || simEmail.split('@')[0],
            avatarUrl: userDoc.avatarUrl,
            isSuperadmin: true,
            teamId: userDoc.teamId,
            teamName,
            role: 'superadmin',
            status: 'active',
            isSimulating: true,
            realEmail,
            simulatedRole: 'superadmin',
          };
        }

        if (!userDoc.teamId) {
          return {
            authenticated: true,
            email: simEmail,
            name: userDoc.name || simEmail.split('@')[0],
            avatarUrl: userDoc.avatarUrl,
            isSuperadmin: false,
            teamId: null,
            teamName: null,
            role: 'unassigned',
            status: 'unassigned',
            isSimulating: true,
            realEmail,
            simulatedRole: 'unassigned',
          };
        }

        const team = await getTeamDoc(userDoc.teamId);
        const isAdmin =
          (team && team.adminEmails.includes(simEmail)) || userDoc.teamRole === 'admin';
        const resolvedRole: UserRole = isAdmin
          ? 'admin'
          : userDoc.teamRole === 'editor'
          ? 'editor'
          : 'viewer';

        return {
          authenticated: true,
          email: simEmail,
          name: userDoc.name || simEmail.split('@')[0],
          avatarUrl: userDoc.avatarUrl,
          isSuperadmin: false,
          teamId: team?.id || userDoc.teamId,
          teamName: team?.name || null,
          role: resolvedRole,
          status: 'active',
          isSimulating: true,
          realEmail,
          simulatedRole: resolvedRole,
        };
      }
    }
  }

  // Look up user document from Firestore for realEmail
  let userDoc = await getUserDoc(realEmail);

  // If user doesn't exist yet, auto-provision initial user record
  if (!userDoc) {
    userDoc = await upsertUserDoc(realEmail, {
      name: realEmail.split('@')[0],
      teamId: null,
      teamRole: null,
      status: 'active',
      lastLoginAt: new Date().toISOString(),
    });
  } else {
    await upsertUserDoc(realEmail, {
      lastLoginAt: new Date().toISOString(),
    });
  }

  // If superadmin, grant superadmin role regardless of team assignment
  if (isRealSuperadmin) {
    let teamName: string | null = null;
    if (userDoc.teamId) {
      const team = await getTeamDoc(userDoc.teamId);
      teamName = team ? team.name : null;
    }

    return {
      authenticated: true,
      email: realEmail,
      name: userDoc.name || realEmail.split('@')[0],
      avatarUrl: userDoc.avatarUrl,
      isSuperadmin: true,
      teamId: userDoc.teamId,
      teamName,
      role: 'superadmin',
      status: 'active',
      isSimulating: false,
      realEmail,
    };
  }

  // Non-superadmin: check team membership
  if (!userDoc.teamId) {
    return {
      authenticated: true,
      email: realEmail,
      name: userDoc.name || realEmail.split('@')[0],
      avatarUrl: userDoc.avatarUrl,
      isSuperadmin: false,
      teamId: null,
      teamName: null,
      role: 'unassigned',
      status: 'unassigned',
      isSimulating: false,
      realEmail,
    };
  }

  // Resolve team
  const team = await getTeamDoc(userDoc.teamId);
  if (!team) {
    return {
      authenticated: true,
      email: realEmail,
      name: userDoc.name || realEmail.split('@')[0],
      avatarUrl: userDoc.avatarUrl,
      isSuperadmin: false,
      teamId: null,
      teamName: null,
      role: 'unassigned',
      status: 'unassigned',
      isSimulating: false,
      realEmail,
    };
  }

  // Determine role in the team
  const isAdmin =
    team.adminEmails.includes(realEmail) || userDoc.teamRole === 'admin';
  const resolvedRole: UserRole = isAdmin
    ? 'admin'
    : userDoc.teamRole === 'editor'
    ? 'editor'
    : 'viewer';

  return {
    authenticated: true,
    email: realEmail,
    name: userDoc.name || realEmail.split('@')[0],
    avatarUrl: userDoc.avatarUrl,
    isSuperadmin: false,
    teamId: team.id,
    teamName: team.name,
    role: resolvedRole,
    status: 'active',
    isSimulating: false,
    realEmail,
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
