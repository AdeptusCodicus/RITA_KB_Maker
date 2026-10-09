export type UserRole = 'superadmin' | 'admin' | 'editor' | 'viewer' | 'unassigned';

export type TeamRole = 'admin' | 'editor' | 'viewer';

export interface UserDocument {
  email: string;
  name?: string;
  avatarUrl?: string;
  teamId: string | null;
  teamRole: TeamRole | null;
  status: 'active' | 'invited' | 'disabled';
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface TeamDocument {
  id: string;
  name: string;
  description?: string;
  adminEmails: string[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  status?: 'active' | 'archived';
  deletedAt?: string;
  scheduledPurgeAt?: string;
  deletedBy?: {
    email: string;
    name?: string;
  };
}

export interface TeamMemberItem {
  email: string;
  name?: string;
  avatarUrl?: string;
  teamRole: TeamRole;
  status: 'active' | 'invited' | 'disabled';
  joinedAt?: string;
}

export interface TeamKBRecord {
  id: string;
  teamId: string;
  title: string;
  filename: string;
  databricksPath: string;
  qualityScore?: number;
  qualityGrade?: string;
  uploadedBy: {
    email: string;
    name: string;
  };
  lastEditedBy?: {
    email: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type AuditActionType =
  | 'KB_CREATED'
  | 'KB_EDITED'
  | 'KB_DELETED'
  | 'KB_PUSHED'
  | 'MEMBER_ADDED'
  | 'MEMBER_REMOVED'
  | 'ROLE_CHANGED'
  | 'TEAM_CREATED'
  | 'TEAM_ARCHIVED'
  | 'TEAM_RESTORED'
  | 'TEAM_PURGED'
  | 'ADMIN_ASSIGNED'
  | 'ADMIN_REMOVED';

export interface AuditLogRecord {
  id: string;
  teamId: string;
  action: AuditActionType;
  performedBy: {
    email: string;
    name: string;
    role: string;
  };
  targetType: 'kb' | 'member' | 'team';
  targetId: string;
  details?: Record<string, any>;
  timestamp: string;
}

export interface AuthSession {
  authenticated: boolean;
  email: string | null;
  name: string | null;
  avatarUrl?: string;
  isSuperadmin: boolean;
  teamId: string | null;
  teamName: string | null;
  role: UserRole;
  status: 'active' | 'unassigned' | 'unauthenticated';
  isSimulating?: boolean;
  realEmail?: string | null;
  simulatedRole?: UserRole;
}

export interface SearchUserItem {
  email: string;
  name: string;
  avatarUrl?: string;
  teamId: string | null;
  teamName?: string | null;
  teamRole: TeamRole | null;
  status: string;
  isSuperadmin?: boolean;
}

