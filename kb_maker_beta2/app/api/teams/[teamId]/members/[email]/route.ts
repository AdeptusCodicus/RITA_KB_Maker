import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import {
  getTeamDoc,
  getUserDoc,
  upsertUserDoc,
  addAuditLog,
  syncTeamAdminRole,
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

    const team = await getTeamDoc(params.teamId);
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const user = await getUserDoc(targetEmail);
    if (!user || user.teamId !== params.teamId) {
      return NextResponse.json(
        { error: 'Member not found in this team' },
        { status: 404 }
      );
    }

    const oldRole = user.teamRole || 'viewer';
    const isTargetAdmin = oldRole === 'admin' || (team.adminEmails || []).includes(targetEmail);

    // Only superadmins can promote to Admin or demote an Admin
    if ((role === 'admin' || isTargetAdmin) && !session.isSuperadmin) {
      return NextResponse.json(
        { error: 'Only Organization Superadmins can promote or demote Team Administrators' },
        { status: 403 }
      );
    }

    await upsertUserDoc(targetEmail, {
      teamRole: role,
    });

    // Synchronize team.adminEmails
    await syncTeamAdminRole(params.teamId, targetEmail, role === 'admin');

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

    const team = await getTeamDoc(params.teamId);
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const targetEmail = decodeURIComponent(params.email).trim().toLowerCase();
    const user = await getUserDoc(targetEmail);

    if (!user || user.teamId !== params.teamId) {
      return NextResponse.json(
        { error: 'Member not found in this team' },
        { status: 404 }
      );
    }

    const isTargetAdmin =
      user.teamRole === 'admin' || (team.adminEmails || []).includes(targetEmail);

    // Only superadmins can remove an Admin
    if (isTargetAdmin && !session.isSuperadmin) {
      return NextResponse.json(
        { error: 'Only Organization Superadmins can remove Team Administrators' },
        { status: 403 }
      );
    }

    // Admins cannot remove themselves unless superadmin
    if (!session.isSuperadmin && session.email === targetEmail) {
      return NextResponse.json(
        { error: 'You cannot remove yourself from the team' },
        { status: 400 }
      );
    }

    // Parse optional succession replacement body
    const body = await request.json().catch(() => ({}));
    const { promoteEmail, newAdminEmail } = body as {
      promoteEmail?: string;
      newAdminEmail?: string;
    };

    // If an existing teammate is promoted as replacement admin
    if (promoteEmail && promoteEmail.trim()) {
      const cleanPromote = promoteEmail.trim().toLowerCase();
      const promoteUser = await getUserDoc(cleanPromote);
      if (promoteUser && promoteUser.teamId === params.teamId) {
        await upsertUserDoc(cleanPromote, { teamRole: 'admin' });
        await syncTeamAdminRole(params.teamId, cleanPromote, true);
        await addAuditLog(
          params.teamId,
          'ADMIN_ASSIGNED',
          {
            email: session.email || '',
            name: session.name || undefined,
            role: session.role,
          },
          'member',
          cleanPromote,
          { reason: 'Succession replacement for removed admin' }
        );
      }
    } else if (newAdminEmail && newAdminEmail.trim()) {
      // If a new colleague is assigned as replacement admin
      const cleanNew = newAdminEmail.trim().toLowerCase();
      const existingUser = await getUserDoc(cleanNew);
      await upsertUserDoc(cleanNew, {
        name: existingUser?.name || cleanNew.split('@')[0],
        teamId: params.teamId,
        teamRole: 'admin',
        status: 'active',
      });
      await syncTeamAdminRole(params.teamId, cleanNew, true);
      await addAuditLog(
        params.teamId,
        'ADMIN_ASSIGNED',
        {
          email: session.email || '',
          name: session.name || undefined,
          role: session.role,
        },
        'member',
        cleanNew,
        { reason: 'New administrator assigned upon admin removal' }
      );
    }

    // Remove team association for target
    await upsertUserDoc(targetEmail, {
      teamId: null,
      teamRole: null,
    });

    // Remove from team.adminEmails
    await syncTeamAdminRole(params.teamId, targetEmail, false);

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
