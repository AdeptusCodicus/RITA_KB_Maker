import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import {
  getTeamDoc,
  getUserDoc,
  upsertUserDoc,
  addAuditLog,
  getFirestoreDb,
} from '@/lib/firestore';
import type { TeamRole } from '@/types/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function PATCH(
  request: Request,
  props: { params: Promise<{ teamId: string; email: string }> }
) {
  try {
    const params = await props.params;
    const { session, errorResponse } = await requireAuth(request.headers, [
      'superadmin',
      'admin',
    ]);
    if (errorResponse) return errorResponse;

    if (!session.isSuperadmin && session.teamId !== params.teamId) {
      return NextResponse.json(
        { error: 'You can only modify members of your own team' },
        { status: 403 }
      );
    }

    const targetEmail = decodeURIComponent(params.email).trim().toLowerCase();
    const body = await request.json();
    const { role } = body;

    const validRoles: TeamRole[] = ['admin', 'editor', 'viewer'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    if (role === 'admin' && !session.isSuperadmin) {
      return NextResponse.json(
        { error: 'Only Superadmins can promote members to Admin' },
        { status: 403 }
      );
    }

    const user = await getUserDoc(targetEmail);
    if (!user || user.teamId !== params.teamId) {
      return NextResponse.json(
        { error: 'Member not found in this team' },
        { status: 404 }
      );
    }

    const oldRole = user.teamRole || 'viewer';
    await upsertUserDoc(targetEmail, {
      teamRole: role,
    });

    // Write audit log
    await addAuditLog(
      params.teamId,
      'ROLE_CHANGED',
      {
        email: session.email || '',
        name: session.name || undefined,
        role: session.role,
      },
      'member',
      targetEmail,
      { previousRole: oldRole, newRole: role }
    );

    return NextResponse.json({
      success: true,
      email: targetEmail,
      teamRole: role,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update member role' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ teamId: string; email: string }> }
) {
  try {
    const params = await props.params;
    const { session, errorResponse } = await requireAuth(request.headers, [
      'superadmin',
      'admin',
    ]);
    if (errorResponse) return errorResponse;

    if (!session.isSuperadmin && session.teamId !== params.teamId) {
      return NextResponse.json(
        { error: 'You can only remove members from your own team' },
        { status: 403 }
      );
    }

    const targetEmail = decodeURIComponent(params.email).trim().toLowerCase();
    const user = await getUserDoc(targetEmail);

    if (!user || user.teamId !== params.teamId) {
      return NextResponse.json(
        { error: 'Member not found in this team' },
        { status: 404 }
      );
    }

    // Admins cannot remove themselves
    if (!session.isSuperadmin && session.email === targetEmail) {
      return NextResponse.json(
        { error: 'You cannot remove yourself from the team' },
        { status: 400 }
      );
    }

    // Remove team association
    await upsertUserDoc(targetEmail, {
      teamId: null,
      teamRole: null,
    });

    // If they were in team's adminEmails array, remove them
    const team = await getTeamDoc(params.teamId);
    if (team && team.adminEmails.includes(targetEmail)) {
      const db = getFirestoreDb();
      await db.collection('teams').doc(params.teamId).update({
        adminEmails: team.adminEmails.filter((e) => e !== targetEmail),
        updatedAt: new Date().toISOString(),
      });
    }

    // Write audit log
    await addAuditLog(
      params.teamId,
      'MEMBER_REMOVED',
      {
        email: session.email || '',
        name: session.name || undefined,
        role: session.role,
      },
      'member',
      targetEmail,
      { previousRole: user.teamRole }
    );

    return NextResponse.json({ success: true, removed: targetEmail });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove member' },
      { status: 500 }
    );
  }
}
