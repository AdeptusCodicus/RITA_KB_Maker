import { NextResponse } from 'next/server';
import { getServerSession, getRealAuthenticatedEmail } from '@/lib/auth/server';
import { isSuperadminEmail } from '@/lib/firestore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const session = await getServerSession(request.headers);
    return NextResponse.json(session);
  } catch (error) {
    console.error('Error in /api/auth/me GET:', error);
    return NextResponse.json(
      {
        authenticated: false,
        error: error instanceof Error ? error.message : 'Unknown auth error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const realEmail = await getRealAuthenticatedEmail(request.headers);
    const isRealSuperadmin = realEmail ? isSuperadminEmail(realEmail) : false;
    const isDev = process.env.NODE_ENV !== 'production';

    // In production, only verified superadmins may simulate roles/users
    if (!isRealSuperadmin && !isDev) {
      return NextResponse.json(
        { error: 'Role simulation requires Superadmin privileges' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { action, role, teamId, teamName, email, devEmail } = body;

    const response = NextResponse.json({ success: true });

    // 1. Clear simulation / Sign out
    if (action === 'clear_simulation' || (devEmail === null && !action)) {
      response.cookies.delete('kb_simulation');
      response.cookies.set({
        name: 'kb_simulation',
        value: '',
        path: '/',
        maxAge: 0,
        sameSite: 'lax',
      });
      if (devEmail === null && !action) {
        response.cookies.set({
          name: 'kb_dev_email',
          value: '__signed_out__',
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
          sameSite: 'lax',
        });
      } else {
        response.cookies.delete('kb_dev_email');
        response.cookies.set({
          name: 'kb_dev_email',
          value: '',
          path: '/',
          maxAge: 0,
          sameSite: 'lax',
        });
      }
      return response;
    }

    // 2. Direct Role Simulation (superadmin, admin, editor, viewer, unassigned)
    if (action === 'simulate_role' || role) {
      const simConfig = {
        mode: 'role',
        role: role || 'viewer',
        teamId: teamId || null,
        teamName: teamName || null,
      };

      response.cookies.set({
        name: 'kb_simulation',
        value: JSON.stringify(simConfig),
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
        sameSite: 'lax',
      });
      return response;
    }

    // 3. Specific User Simulation
    const targetEmail = (email || devEmail || '').trim().toLowerCase();
    if (targetEmail) {
      const simConfig = {
        mode: 'user',
        email: targetEmail,
      };

      response.cookies.set({
        name: 'kb_simulation',
        value: JSON.stringify(simConfig),
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
        sameSite: 'lax',
      });
      response.cookies.set({
        name: 'kb_dev_email',
        value: targetEmail,
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
        sameSite: 'lax',
      });
      return response;
    }

    return NextResponse.json({ error: 'No valid simulation action specified' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid request' },
      { status: 400 }
    );
  }
}

