import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { restoreTeamDoc } from '@/lib/firestore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  request: Request,
  props: { params: Promise<{ teamId: string }> }
) {
  try {
    const params = await props.params;
    const { session, errorResponse } = await requireAuth(request.headers, ['superadmin']);
    if (errorResponse) return errorResponse;

    const actor = {
      email: session.email || 'system',
      name: session.name || undefined,
      role: session.role,
    };

    const restoredTeam = await restoreTeamDoc(params.teamId, actor);
    return NextResponse.json({
      success: true,
      restored: true,
      team: restoredTeam,
      message: 'Team restored from 30-day limbo back to active status.',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to restore team' },
      { status: 500 }
    );
  }
}
