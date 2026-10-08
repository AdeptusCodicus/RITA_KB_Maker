import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getAllUsers, getAllTeams, isSuperadminEmail, isEmailInOrganization } from '@/lib/firestore';
import { verifyGoogleWorkspaceUser, formatNameFromEmail } from '@/lib/google-workspace';
import type { SearchUserItem } from '@/types/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request.headers);
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim().toLowerCase();
    const lookupEmail = (searchParams.get('email') || '').trim().toLowerCase();

    const [users, teams] = await Promise.all([
      getAllUsers(),
      getAllTeams(),
    ]);

    const teamMap = new Map<string, string>();
    for (const t of teams) {
      teamMap.set(t.id, t.name);
    }

    // Direct single email lookup for real-time validation via Google Workspace DWD
    if (lookupEmail) {
      const isOrgEmail = isEmailInOrganization(lookupEmail);
      if (!isOrgEmail) {
        return NextResponse.json({
          isOrgEmail: false,
          existsOnGoogle: false,
          googleVerified: false,
          user: null,
          error: 'Must use your organization domain (@foodgroup.ph)',
        });
      }

      const googleCheck = await verifyGoogleWorkspaceUser(lookupEmail);
      if (!googleCheck.exists) {
        return NextResponse.json({
          isOrgEmail: true,
          existsOnGoogle: false,
          googleVerified: googleCheck.verified,
          user: null,
          error: googleCheck.error || 'User does not exist in Google Workspace organization',
        });
      }

      const user = users.find((u) => u.email.toLowerCase() === lookupEmail);
      return NextResponse.json({
        isOrgEmail: true,
        existsOnGoogle: true,
        googleVerified: googleCheck.verified,
        isExistingMember: !!user,
        user: user
          ? {
              email: user.email,
              name: user.name || googleCheck.name || user.email.split('@')[0],
              avatarUrl: user.avatarUrl,
              teamId: user.teamId,
              teamName: user.teamId ? teamMap.get(user.teamId) || user.teamId : null,
              teamRole: user.teamRole,
              status: user.status,
              isSuperadmin: isSuperadminEmail(user.email),
            }
          : {
              email: lookupEmail,
              name: googleCheck.name || formatNameFromEmail(lookupEmail),
              avatarUrl: null,
              teamId: null,
              teamName: null,
              teamRole: null,
              status: 'unassigned',
              isSuperadmin: isSuperadminEmail(lookupEmail),
            },
      });
    }

    let filtered = users.filter((u) => isEmailInOrganization(u.email));
    if (q) {
      filtered = filtered.filter((u) => {
        const emailMatch = u.email.toLowerCase().includes(q);
        const nameMatch = u.name ? u.name.toLowerCase().includes(q) : false;
        return emailMatch || nameMatch;
      });
    }

    const searchResults: SearchUserItem[] = filtered.map((u) => {
      const isSuper = isSuperadminEmail(u.email);
      return {
        email: u.email,
        name: u.name || u.email.split('@')[0],
        avatarUrl: u.avatarUrl,
        teamId: u.teamId,
        teamName: u.teamId ? teamMap.get(u.teamId) || u.teamId : null,
        teamRole: u.teamRole,
        status: u.status,
        isSuperadmin: isSuper,
      };
    });

    // Limit to 50 results
    return NextResponse.json({ users: searchResults.slice(0, 50) });
  } catch (error) {
    console.error('Error in /api/users/search GET:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to search users' },
      { status: 500 }
    );
  }
}
