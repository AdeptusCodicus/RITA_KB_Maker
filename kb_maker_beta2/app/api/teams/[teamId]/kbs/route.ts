import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import {
  getTeamKBs,
  getAllKBs,
  saveTeamKBRecord,
  deleteTeamKBRecord,
  getKBRecord,
  addAuditLog,
} from '@/lib/firestore';
import type { TeamKBRecord } from '@/types/auth';

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

    const kbs =
      session.isSuperadmin && (params.teamId === 'global' || params.teamId === 'all')
        ? await getAllKBs()
        : await getTeamKBs(params.teamId);
    return NextResponse.json({ kbs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list team KBs' },
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
    // Strictly restrict to Superadmins, Admins, and Editors (Viewers are blocked)
    const { session, errorResponse } = await requireAuth(request.headers, [
      'superadmin',
      'admin',
      'editor',
    ]);
    if (errorResponse) return errorResponse;

    if (!session.isSuperadmin && session.teamId !== params.teamId) {
      return NextResponse.json(
        { error: 'You can only add KBs to your own team' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, filename, databricksPath, qualityScore, qualityGrade } = body;

    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    const kbId = `kb_${filename.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const existing = await getKBRecord(kbId);
    const now = new Date().toISOString();

    const record: TeamKBRecord = {
      id: kbId,
      teamId: params.teamId,
      title: title || filename,
      filename,
      databricksPath: databricksPath || '',
      qualityScore,
      qualityGrade,
      uploadedBy: existing?.uploadedBy || {
        email: session.email || 'unknown',
        name: session.name || session.email?.split('@')[0] || 'Unknown',
      },
      lastEditedBy: {
        email: session.email || 'unknown',
        name: session.name || session.email?.split('@')[0] || 'Unknown',
      },
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    await saveTeamKBRecord(record);

    // Record audit log
    await addAuditLog(
      params.teamId,
      existing ? 'KB_EDITED' : 'KB_CREATED',
      {
        email: session.email || '',
        name: session.name || undefined,
        role: session.role,
      },
      'kb',
      filename,
      {
        title: record.title,
        databricksPath: record.databricksPath,
        qualityScore,
      }
    );

    return NextResponse.json({ success: true, kb: record });
  } catch (error) {
    console.error('Error saving team KB:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save KB' },
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
    // Strictly restrict to Superadmins, Admins, and Editors
    const { session, errorResponse } = await requireAuth(request.headers, [
      'superadmin',
      'admin',
      'editor',
    ]);
    if (errorResponse) return errorResponse;

    if (!session.isSuperadmin && session.teamId !== params.teamId) {
      return NextResponse.json(
        { error: 'You can only delete KBs from your own team' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const kbId = searchParams.get('kbId');

    if (!kbId) {
      return NextResponse.json({ error: 'Missing kbId parameter' }, { status: 400 });
    }

    const existing = await getKBRecord(kbId);
    if (!existing || existing.teamId !== params.teamId) {
      return NextResponse.json({ error: 'KB not found in this team' }, { status: 404 });
    }

    await deleteTeamKBRecord(kbId);

    // Record audit log
    await addAuditLog(
      params.teamId,
      'KB_DELETED',
      {
        email: session.email || '',
        name: session.name || undefined,
        role: session.role,
      },
      'kb',
      existing.filename,
      { title: existing.title }
    );

    return NextResponse.json({ success: true, deleted: kbId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete KB' },
      { status: 500 }
    );
  }
}
