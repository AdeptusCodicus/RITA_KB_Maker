import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/server';

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
  // Allow switching dev identity during local development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Dev auth switching disabled in production' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { devEmail } = body;

    const response = NextResponse.json({ success: true, email: devEmail });

    if (!devEmail) {
      // Clear cookie
      response.cookies.delete('kb_dev_email');
    } else {
      // Set cookie for 7 days
      response.cookies.set({
        name: 'kb_dev_email',
        value: devEmail.trim().toLowerCase(),
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
        sameSite: 'lax',
      });
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid request' },
      { status: 400 }
    );
  }
}
