import { Firestore, FieldValue } from '@google-cloud/firestore';
import type {
  UserDocument,
  TeamDocument,
  TeamMemberItem,
  TeamKBRecord,
  AuditLogRecord,
  AuditActionType,
} from '@/types/auth';

declare global {
  // eslint-disable-next-line no-var
  var __firestoreDb: Firestore | undefined;
}

export function getFirestoreDb(): Firestore {
  if (global.__firestoreDb) {
    return global.__firestoreDb;
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'rgpt-gchat-test';
  const firestore = new Firestore({
    projectId,
    ignoreUndefinedProperties: true,
  });

  if (process.env.NODE_ENV !== 'production') {
    global.__firestoreDb = firestore;
  }

  return firestore;
}

// ── Environment Helpers ────────────────────────────────────────────────────────

export function getSuperadminEmails(): string[] {
  const raw = process.env.SUPERADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function getAllowedOrgDomains(): string[] {
  const raw = process.env.ALLOWED_ORG_DOMAINS || '';
  return raw
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

export function isSuperadminEmail(email: string): boolean {
  if (!email) return false;
  const superadmins = getSuperadminEmails();
  return superadmins.includes(email.toLowerCase().trim());
}

export function isEmailInOrganization(email: string): boolean {
  if (!email) return false;
  const allowedDomains = getAllowedOrgDomains();
  // If no allowed domains are configured, permit any Google authenticated domain by default
  if (allowedDomains.length === 0) return true;

  const domain = email.toLowerCase().split('@').pop() || '';
  return allowedDomains.includes(domain);
}

// ── User Management ──────────────────────────────────────────────────────────

export async function getUserDoc(email: string): Promise<UserDocument | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const db = getFirestoreDb();
  const snapshot = await db.collection('users').doc(normalizedEmail).get();
  if (!snapshot.exists) return null;
  return snapshot.data() as UserDocument;
}

export async function upsertUserDoc(
  email: string,
  data: Partial<UserDocument>
): Promise<UserDocument> {
  const normalizedEmail = email.toLowerCase().trim();
  const db = getFirestoreDb();
  const ref = db.collection('users').doc(normalizedEmail);
  const existing = await ref.get();
  const now = new Date().toISOString();

  if (existing.exists) {
    const updated: Partial<UserDocument> = {
      ...data,
      updatedAt: now,
    };
    await ref.set(updated, { merge: true });
    const fresh = await ref.get();
    return fresh.data() as UserDocument;
  } else {
    const created: UserDocument = {
      email: normalizedEmail,
      name: data.name || normalizedEmail.split('@')[0],
      avatarUrl: data.avatarUrl,
      teamId: data.teamId || null,
      teamRole: data.teamRole || null,
      status: data.status || 'invited',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: data.lastLoginAt || now,
      ...data,
    };
    await ref.set(created);
    return created;
  }
}

export async function getAllUsers(): Promise<UserDocument[]> {
  const db = getFirestoreDb();
  const snapshot = await db.collection('users').get();
  return snapshot.docs.map((doc) => doc.data() as UserDocument);
}


// ── Team Management ──────────────────────────────────────────────────────────

export async function getTeamDoc(teamId: string): Promise<TeamDocument | null> {
  const db = getFirestoreDb();
  const snapshot = await db.collection('teams').doc(teamId).get();
  if (!snapshot.exists) return null;
  return snapshot.data() as TeamDocument;
}

export async function getAllTeams(includeArchived: boolean = false): Promise<TeamDocument[]> {
  const db = getFirestoreDb();
  const snapshot = await db.collection('teams').orderBy('name', 'asc').get();
  const all = snapshot.docs.map((doc) => doc.data() as TeamDocument);
  if (includeArchived) return all;
  return all.filter((t) => t.status !== 'archived');
}

export async function createTeamDoc(
  teamId: string,
  name: string,
  createdBy: string,
  adminEmails: string[] = [],
  description?: string
): Promise<TeamDocument> {
  const db = getFirestoreDb();
  const now = new Date().toISOString();
  const team: TeamDocument = {
    id: teamId,
    name,
    description,
    adminEmails: adminEmails.map((e) => e.toLowerCase().trim()),
    status: 'active',
    createdAt: now,
    createdBy: createdBy.toLowerCase().trim(),
    updatedAt: now,
  };
  await db.collection('teams').doc(teamId).set(team);
  return team;
}

/**
 * Soft-deletes a team into 30-day limbo.
 * Unassigns all active team members immediately so they can join new teams.
 * Preserves team metadata, KB history, and audit logs during the 30-day window.
 */
export async function archiveTeamDoc(
  teamId: string,
  deletedBy: { email: string; name?: string; role: string }
): Promise<TeamDocument> {
  const db = getFirestoreDb();
  const teamRef = db.collection('teams').doc(teamId);
  const teamDoc = await teamRef.get();
  if (!teamDoc.exists) {
    throw new Error('Team not found');
  }

  const now = new Date();
  const purgeDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30-day limbo window

  const updateData: Partial<TeamDocument> = {
    status: 'archived',
    deletedAt: now.toISOString(),
    scheduledPurgeAt: purgeDate.toISOString(),
    deletedBy: {
      email: deletedBy.email.toLowerCase().trim(),
      name: deletedBy.name,
    },
    updatedAt: now.toISOString(),
  };

  await teamRef.update(updateData);

  // Unassign all members from this team so they can join or create new teams
  const userSnapshot = await db.collection('users').where('teamId', '==', teamId).get();
  if (!userSnapshot.empty) {
    const batch = db.batch();
    for (const doc of userSnapshot.docs) {
      batch.update(doc.ref, {
        teamId: null,
        teamRole: null,
        updatedAt: now.toISOString(),
      });
    }
    await batch.commit();
  }

  // Record audit log
  await addAuditLog(
    teamId,
    'TEAM_ARCHIVED',
    deletedBy,
    'team',
    teamId,
    {
      scheduledPurgeAt: purgeDate.toISOString(),
      unassignedMembersCount: userSnapshot.docs.length,
    }
  );

  const updatedDoc = await teamRef.get();
  return updatedDoc.data() as TeamDocument;
}

/**
 * Restores a team from 30-day limbo back to active status.
 */
export async function restoreTeamDoc(
  teamId: string,
  restoredBy: { email: string; name?: string; role: string }
): Promise<TeamDocument> {
  const db = getFirestoreDb();
  const teamRef = db.collection('teams').doc(teamId);
  const teamDoc = await teamRef.get();
  if (!teamDoc.exists) {
    throw new Error('Team not found');
  }

  const now = new Date().toISOString();
  await teamRef.update({
    status: 'active',
    deletedAt: FieldValue.delete(),
    scheduledPurgeAt: FieldValue.delete(),
    deletedBy: FieldValue.delete(),
    updatedAt: now,
  });

  await addAuditLog(
    teamId,
    'TEAM_RESTORED',
    restoredBy,
    'team',
    teamId,
    {}
  );

  const updatedDoc = await teamRef.get();
  return updatedDoc.data() as TeamDocument;
}

/**
 * Permanently deletes a team document and its metadata in Firestore.
 * NOTE: Published knowledge base files in Databricks Unity Catalog remain untouched.
 */
export async function purgeTeamDoc(
  teamId: string,
  purgedBy: { email: string; name?: string; role: string }
): Promise<void> {
  const db = getFirestoreDb();
  const kbSnapshot = await db.collection('knowledge_bases').where('teamId', '==', teamId).get();
  const logSnapshot = await db.collection('audit_logs').where('teamId', '==', teamId).get();

  const batch = db.batch();
  for (const doc of kbSnapshot.docs) {
    batch.delete(doc.ref);
  }
  for (const doc of logSnapshot.docs) {
    batch.delete(doc.ref);
  }
  batch.delete(db.collection('teams').doc(teamId));
  await batch.commit();
}

/**
 * Synchronizes adminEmails list on the team document when roles are changed.
 */
export async function syncTeamAdminRole(
  teamId: string,
  email: string,
  isAdmin: boolean
): Promise<void> {
  const db = getFirestoreDb();
  const teamRef = db.collection('teams').doc(teamId);
  const teamDoc = await teamRef.get();
  if (!teamDoc.exists) return;

  const teamData = teamDoc.data() as TeamDocument;
  const normalizedEmail = email.toLowerCase().trim();
  let currentAdmins = (teamData.adminEmails || []).map((e) => e.toLowerCase().trim());

  if (isAdmin) {
    if (!currentAdmins.includes(normalizedEmail)) {
      currentAdmins.push(normalizedEmail);
    }
  } else {
    currentAdmins = currentAdmins.filter((e) => e !== normalizedEmail);
  }

  await teamRef.update({
    adminEmails: currentAdmins,
    updatedAt: new Date().toISOString(),
  });
}

export async function getTeamMembers(teamId: string): Promise<TeamMemberItem[]> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection('users')
    .where('teamId', '==', teamId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as UserDocument;
    return {
      email: data.email,
      name: data.name,
      avatarUrl: data.avatarUrl,
      teamRole: data.teamRole || 'viewer',
      status: data.status,
      joinedAt: data.createdAt,
    };
  });
}

// ── Team Knowledge Bases ─────────────────────────────────────────────────────

export async function getTeamKBs(teamId: string): Promise<TeamKBRecord[]> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection('knowledge_bases')
    .where('teamId', '==', teamId)
    .get();

  const records = snapshot.docs.map((doc) => doc.data() as TeamKBRecord);
  return records.sort((a, b) => {
    const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return timeB - timeA;
  });
}

export async function getAllKBs(): Promise<TeamKBRecord[]> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection('knowledge_bases')
    .orderBy('updatedAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => doc.data() as TeamKBRecord);
}

export async function getKBRecord(kbId: string): Promise<TeamKBRecord | null> {
  const db = getFirestoreDb();
  const doc = await db.collection('knowledge_bases').doc(kbId).get();
  if (!doc.exists) return null;
  return doc.data() as TeamKBRecord;
}

export async function saveTeamKBRecord(record: TeamKBRecord): Promise<void> {
  const db = getFirestoreDb();
  await db.collection('knowledge_bases').doc(record.id).set(record, { merge: true });
}

export async function deleteTeamKBRecord(kbId: string): Promise<void> {
  const db = getFirestoreDb();
  await db.collection('knowledge_bases').doc(kbId).delete();
}

// ── Audit Logs ───────────────────────────────────────────────────────────────

export async function addAuditLog(
  teamId: string,
  action: AuditActionType,
  performedBy: { email: string; name?: string; role: string },
  targetType: 'kb' | 'member' | 'team',
  targetId: string,
  details?: Record<string, any>
): Promise<AuditLogRecord> {
  const db = getFirestoreDb();
  const ref = db.collection('audit_logs').doc();
  const log: AuditLogRecord = {
    id: ref.id,
    teamId,
    action,
    performedBy: {
      email: performedBy.email.toLowerCase().trim(),
      name: performedBy.name || performedBy.email.split('@')[0],
      role: performedBy.role,
    },
    targetType,
    targetId,
    details,
    timestamp: new Date().toISOString(),
  };
  await ref.set(log);
  return log;
}

export async function getTeamAuditLogs(
  teamId: string,
  limitCount: number = 50
): Promise<AuditLogRecord[]> {
  const db = getFirestoreDb();
  
  if (teamId !== 'all') {
    const snapshot = await db
      .collection('audit_logs')
      .where('teamId', '==', teamId)
      .get();

    const logs = snapshot.docs.map((doc) => doc.data() as AuditLogRecord);
    return logs
      .sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      })
      .slice(0, limitCount);
  }

  const snapshot = await db
    .collection('audit_logs')
    .orderBy('timestamp', 'desc')
    .limit(limitCount)
    .get();

  return snapshot.docs.map((doc) => doc.data() as AuditLogRecord);
}
