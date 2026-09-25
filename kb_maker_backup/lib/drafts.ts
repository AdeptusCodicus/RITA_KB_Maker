import type { KBDraft } from '@/types/kb';

const DRAFTS_KEY = 'kb_maker_saved_drafts';

export function getAllDrafts(): KBDraft[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDraft(draft: Omit<KBDraft, 'id' | 'updatedAt'> & { id?: string }): KBDraft {
  const drafts = getAllDrafts();
  // Ensure unique ID for new drafts
  const id = draft.id || `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newDraft: KBDraft = {
    ...draft,
    id,
    updatedAt: now,
  };

  const existingIndex = drafts.findIndex((d) => d.id === id);
  if (existingIndex >= 0) {
    drafts[existingIndex] = newDraft;
  } else {
    drafts.unshift(newDraft);
  }

  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('kb_active_draft_id', id);
    window.dispatchEvent(new Event('kb_drafts_updated'));
  }
  return newDraft;
}

export function getDraftById(id: string): KBDraft | null {
  const drafts = getAllDrafts();
  return drafts.find((d) => d.id === id) || null;
}

export function deleteDraft(id: string): void {
  const drafts = getAllDrafts().filter((d) => d.id !== id);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  if (typeof window !== 'undefined') {
    if (sessionStorage.getItem('kb_active_draft_id') === id) {
      sessionStorage.removeItem('kb_active_draft_id');
    }
    window.dispatchEvent(new Event('kb_drafts_updated'));
  }
}

export function getActiveDraftId(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('kb_active_draft_id');
}

export function setActiveDraftId(id: string | null): void {
  if (typeof window === 'undefined') return;
  if (id) {
    sessionStorage.setItem('kb_active_draft_id', id);
  } else {
    sessionStorage.removeItem('kb_active_draft_id');
  }
  window.dispatchEvent(new Event('kb_drafts_updated'));
}
