import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getAllUsers, getAllTeams, isSuperadminEmail, isEmailInOrganization } from '@/lib/firestore';
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

    // Direct single email lookup for real-time validation
    if (lookupEmail) {
      const isOrgEmail = isEmailInOrganization(lookupEmail);
      const user = users.find((u) => u.email.toLowerCase() === lookupEmail);
      return NextResponse.json({
        isOrgEmail,
        user: user
          ? {
              email: user.email,
              name: user.name || user.email.split('@')[0],
              avatarUrl: user.avatarUrl,
              teamId: user.teamId,
              teamName: user.teamId ? teamMap.get(user.teamId) || user.teamId : null,
              teamRole: user.teamRole,
              status: user.status,
              isSuperadmin: isSuperadminEmail(user.email),
            }
          : null,
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
