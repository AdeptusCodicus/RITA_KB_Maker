// ── Extraction ───────────────────────────────────────────────────────────────

export interface ExtractionResult {
  text: string;
  pageCount?: number;
}

// ── KB Generation & Refinement ────────────────────────────────────────────────

export interface KBGenerateRequest {
  text: string;
  filename: string;
}

export interface RefineKBRequest {
  markdown: string;
  instructions: string;
  originalText?: string;
}

// ── Quality Check ────────────────────────────────────────────────────────────

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface QualityCheck {
  id: string;
  name: string;
  score: number;
  max: number;
  status: CheckStatus;
  notes: string;
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface QualityReport {
  overall_score: number;
  grade: Grade;
  passed: boolean;
  checks: QualityCheck[];
  suggestions: string[];
  auto_fixed_issues: string[];
}

// ── Drafts ───────────────────────────────────────────────────────────────────

export interface KBDraft {
  id: string;
  title: string;
  filename: string;
  extractedText: string;
  markdown: string;
  qualityReport: QualityReport | null;
  updatedAt: string;
}

// ── GitHub Push ───────────────────────────────────────────────────────────────

export interface GitHubPushRequest {
  markdown: string;
  title: string;
  override?: boolean;
}

export interface GitHubPushResponse {
  url: string;
  sha: string;
}

// ── Processing State (client-side) ───────────────────────────────────────────

export type ProcessingStep =
  | 'idle'
  | 'uploading'
  | 'extracting'
  | 'generating'
  | 'refining'
  | 'quality-checking'
  | 'complete'
  | 'error';

export interface ProcessingState {
  step: ProcessingStep;
  message: string;
  progress: number; // 0–100
  isCapacity?: boolean;
  retryCountdown?: number | null;
  retryAttempt?: number;
  maxRetries?: number;
}

export interface AIErrorResponse {
  error: string;
  isCapacity?: boolean;
  type?: 'CAPACITY_EXCEEDED' | 'GENERATION_ERROR' | 'AUDIT_ERROR' | 'REFINEMENT_ERROR' | 'API_ERROR';
  retryAfterSeconds?: number;
}

export interface UploadedFile {
  file: File;
  name: string;
  size: number;
  type: string;
  preview?: string;
}

