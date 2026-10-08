import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import {
  getAllTeams,
  getTeamDoc,
  createTeamDoc,
  addAuditLog,
  getTeamMembers,
  getTeamKBs,
  upsertUserDoc,
  getUserDoc,
  isEmailInOrganization,
} from '@/lib/firestore';
import { verifyGoogleWorkspaceUser, formatNameFromEmail } from '@/lib/google-workspace';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { session, errorResponse } = await requireAuth(request.headers);
    if (errorResponse) return errorResponse;

    // Superadmins can retrieve all teams with summaries
    if (session.isSuperadmin) {
      const teams = await getAllTeams();
      // Enrich with member count
      const enriched = await Promise.all(
        teams.map(async (t) => {
          const members = await getTeamMembers(t.id);
          const kbs = await getTeamKBs(t.id);
          return {
            ...t,
            memberCount: members.length,
            kbCount: kbs.length,
          };
        })
      );
      return NextResponse.json({ teams: enriched });
    }

    // Normal users return only their assigned team
    if (!session.teamId) {
      return NextResponse.json({ teams: [] });
    }

    const team = await getTeamDoc(session.teamId);
    if (!team) {
      return NextResponse.json({ teams: [] });
    }

    const members = await getTeamMembers(team.id);
    const kbs = await getTeamKBs(team.id);

    return NextResponse.json({
      teams: [
        {
          ...team,
          memberCount: members.length,
          kbCount: kbs.length,
        },
      ],
    });
  } catch (error) {
    console.error('Error in /api/teams GET:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch teams' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { session, errorResponse } = await requireAuth(request.headers, ['superadmin']);
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { name, description, adminEmails } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Team name is required' }, { status: 400 });
    }

    const teamSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/_+/g, '_');
    const teamId = `team_${teamSlug}_${Math.random().toString(36).substring(2, 6)}`;

    const normalizedAdmins = Array.isArray(adminEmails)
      ? adminEmails.map((e: string) => e.trim().toLowerCase()).filter(Boolean)
      : [];

    // Verify all specified initial admin emails against Google Workspace
    for (const adminEmail of normalizedAdmins) {
      if (!isEmailInOrganization(adminEmail)) {
        return NextResponse.json(
          { error: `Admin email ${adminEmail} does not belong to authorized organization domain(s).` },
          { status: 400 }
        );
      }
      const googleCheck = await verifyGoogleWorkspaceUser(adminEmail);
      if (!googleCheck.exists) {
        return NextResponse.json(
          { error: googleCheck.error || `Admin email ${adminEmail} does not exist in Google Workspace.` },
          { status: 400 }
        );
      }
    }

    const newTeam = await createTeamDoc(
      teamId,
      name.trim(),
      session.email || 'system',
      normalizedAdmins,
      description?.trim()
    );

    // If admins are specified, set their team assignment
    for (const adminEmail of normalizedAdmins) {
      const existing = await getUserDoc(adminEmail);
      const googleCheck = await verifyGoogleWorkspaceUser(adminEmail);
      await upsertUserDoc(adminEmail, {
        teamId,
        teamRole: 'admin',
        status: 'active',
        name: existing?.name || googleCheck.name || formatNameFromEmail(adminEmail),
      });
    }

    // Write audit log
    await addAuditLog(
      teamId,
      'TEAM_CREATED',
      {
        email: session.email || '',
        name: session.name || undefined,
        role: session.role,
      },
      'team',
      teamId,
      { teamName: name, adminEmails: normalizedAdmins }
    );

    return NextResponse.json({ success: true, team: newTeam });
  } catch (error) {
    console.error('Error in /api/teams POST:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create team' },
      { status: 500 }
    );
  }
}
