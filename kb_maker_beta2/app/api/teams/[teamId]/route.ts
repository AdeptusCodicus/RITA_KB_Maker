import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getTeamDoc, archiveTeamDoc, purgeTeamDoc } from '@/lib/firestore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: Request,
  props: { params: Promise<{ teamId: string }> }
) {
  try {
    const params = await props.params;
    const { session, errorResponse } = await requireAuth(request.headers);
    if (errorResponse) return errorResponse;

    // Check permission: Superadmin or member of this team
    if (!session.isSuperadmin && session.teamId !== params.teamId) {
      return NextResponse.json({ error: 'Access denied to this team' }, { status: 403 });
    }

    const team = await getTeamDoc(params.teamId);
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    return NextResponse.json({ team });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error fetching team' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ teamId: string }> }
) {
  try {
    const params = await props.params;
    const { session, errorResponse } = await requireAuth(request.headers, ['superadmin']);
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const isPermanent = searchParams.get('permanent') === 'true';

    const actor = {
      email: session.email || 'system',
      name: session.name || undefined,
      role: session.role,
    };

    if (isPermanent) {
      await purgeTeamDoc(params.teamId, actor);
      return NextResponse.json({ success: true, purged: true, teamId: params.teamId });
    } else {
      const archivedTeam = await archiveTeamDoc(params.teamId, actor);
      return NextResponse.json({
        success: true,
        archived: true,
        team: archivedTeam,
        message: 'Team moved to 30-day limbo. All members have been unassigned.',
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete team' },
      { status: 500 }
    );
  }
}
