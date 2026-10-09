import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import {
  getTeamDoc,
  getTeamMembers,
  getUserDoc,
  upsertUserDoc,
  isEmailInOrganization,
  addAuditLog,
} from '@/lib/firestore';
import { verifyGoogleWorkspaceUser, formatNameFromEmail } from '@/lib/google-workspace';
import type { TeamRole } from '@/types/auth';

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

    if (!session.isSuperadmin && session.teamId !== params.teamId) {
      return NextResponse.json({ error: 'Access denied to this team' }, { status: 403 });
    }

    const members = await getTeamMembers(params.teamId);
    return NextResponse.json({ members });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list members' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  props: { params: Promise<{ teamId: string }> }
) {
  try {
    const params = await props.params;
    const { session, errorResponse } = await requireAuth(request.headers, [
      'superadmin',
      'admin',
    ]);
    if (errorResponse) return errorResponse;

    // Regular admin can only manage their own team
    if (!session.isSuperadmin && session.teamId !== params.teamId) {
      return NextResponse.json(
        { error: 'You can only add members to your own team' },
        { status: 403 }
      );
    }

    const team = await getTeamDoc(params.teamId);
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const body = await request.json();
    const { email, role = 'editor' } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Valid email address is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Format check
    if (!normalizedEmail.includes('@') || !normalizedEmail.includes('.')) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // 2. Organization domain verification & Google Workspace verification
    if (!isEmailInOrganization(normalizedEmail)) {
      return NextResponse.json(
        {
          error: `Email domain does not belong to authorized organization domain(s).`,
        },
        { status: 400 }
      );
    }

    const googleCheck = await verifyGoogleWorkspaceUser(normalizedEmail);
    if (!googleCheck.exists) {
      return NextResponse.json(
        {
          error: googleCheck.error || 'User does not exist in Google Workspace organization.',
        },
        { status: 400 }
      );
    }

    // 3. Role validation
    const validRoles: TeamRole[] = ['admin', 'editor', 'viewer'];
    const assignedRole: TeamRole = validRoles.includes(role) ? role : 'editor';

    // Non-superadmin cannot assign admin role unless already authorized
    if (assignedRole === 'admin' && !session.isSuperadmin) {
      return NextResponse.json(
        { error: 'Only Superadmins can assign the Admin role' },
        { status: 403 }
      );
    }

    // 4. Check existing team assignment
    const existingUser = await getUserDoc(normalizedEmail);
    if (existingUser) {
      if (existingUser.teamId === params.teamId) {
        if (session.isSuperadmin && assignedRole === 'admin') {
          // Promote existing member to admin and synchronize team.adminEmails
          await upsertUserDoc(normalizedEmail, {
            teamRole: 'admin',
          });
          const { syncTeamAdminRole } = await import('@/lib/firestore');
          await syncTeamAdminRole(params.teamId, normalizedEmail, true);
          await addAuditLog(
            params.teamId,
            'ADMIN_ASSIGNED',
            {
              email: session.email || '',
              name: session.name || undefined,
              role: session.role,
            },
            'member',
            normalizedEmail,
            { reason: 'Superadmin assigned administrator to unmanaged team' }
          );
          return NextResponse.json({
            success: true,
            promoted: true,
            member: {
              email: normalizedEmail,
              teamRole: 'admin',
              status: 'active',
            },
          });
        }
        return NextResponse.json(
          { error: `User ${normalizedEmail} is already a member of this team` },
          { status: 400 }
        );
      }

      if (existingUser.teamId) {
        // User is currently in another team
        const otherTeam = await getTeamDoc(existingUser.teamId);
        const otherTeamName = otherTeam ? otherTeam.name : existingUser.teamId;

        // Only superadmins can transfer members between teams
        if (!session.isSuperadmin) {
          return NextResponse.json(
            {
              error: `User ${normalizedEmail} is already assigned to team "${otherTeamName}". Only a Superadmin can transfer members between teams.`,
            },
            { status: 400 }
          );
        }
      }
    }

    // 5. Update or create user record
    await upsertUserDoc(normalizedEmail, {
      teamId: params.teamId,
      teamRole: assignedRole,
      status: 'active',
      name: existingUser?.name || googleCheck.name || formatNameFromEmail(normalizedEmail),
    });

    // If assigning admin, also synchronize team's adminEmails array safely
    if (assignedRole === 'admin') {
      const { syncTeamAdminRole } = await import('@/lib/firestore');
      await syncTeamAdminRole(params.teamId, normalizedEmail, true);
    }

    // 6. Record audit log
    await addAuditLog(
      params.teamId,
      'MEMBER_ADDED',
      {
        email: session.email || '',
        name: session.name || undefined,
        role: session.role,
      },
      'member',
      normalizedEmail,
      {
        assignedRole,
        teamName: team.name,
      }
    );

    return NextResponse.json({
      success: true,
      member: {
        email: normalizedEmail,
        teamRole: assignedRole,
        status: 'active',
      },
    });
  } catch (error) {
    console.error('Error adding member:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add member' },
      { status: 500 }
    );
  }
}
