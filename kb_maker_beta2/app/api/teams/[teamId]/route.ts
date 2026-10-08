import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { getTeamDoc, getFirestoreDb } from '@/lib/firestore';

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
