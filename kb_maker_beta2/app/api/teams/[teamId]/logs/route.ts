import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getTeamAuditLogs } from '@/lib/firestore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: Request,
  props: { params: Promise<{ teamId: string }> }
) {
  try {
    const params = await props.params;
    // Strictly restrict to Superadmins and Admins
    const { session, errorResponse } = await requireAuth(request.headers, [
      'superadmin',
      'admin',
    ]);
    if (errorResponse) return errorResponse;

    if (!session.isSuperadmin && session.teamId !== params.teamId) {
      return NextResponse.json(
        { error: 'You can only view audit logs for your own team' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const logs = await getTeamAuditLogs(params.teamId, limit);
    return NextResponse.json({ logs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}
