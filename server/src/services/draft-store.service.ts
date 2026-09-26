import fs from 'fs';
import path from 'path';
import os from 'os';
import { DocumentDraft } from '../types/index.js';
import {
  isSupabaseConfigured,
  fetchCustomDraftsFromSupabase,
  saveCustomDraftToSupabase,
  deleteCustomDraftFromSupabase,
} from './supabase.service.js';

class DraftStore {
  private inMemoryCache: DocumentDraft[] | null = null;
  private hasInitializedCloud: boolean = false;

  constructor() {
    this.getAllDraftsAsync().catch((err) => {
      console.warn('⚠️ [DraftStore] Initial cloud load warning:', err.message);
    });
  }

  private getStoragePath(): string {
    if (process.env.VERCEL) {
      return path.join(os.tmpdir(), 'custom-drafts.json');
    }
    const serverData = path.join(process.cwd(), 'server', 'data', 'custom-drafts.json');
    if (fs.existsSync(serverData) || fs.existsSync(path.dirname(serverData))) {
      return serverData;
    }
    const localData = path.join(process.cwd(), 'data', 'custom-drafts.json');
    if (fs.existsSync(localData) || fs.existsSync(path.dirname(localData))) {
      return localData;
    }
    return path.join(__dirname, '../../data/custom-drafts.json');
  }

  private ensureDataFile(): string {
    const targetFile = this.getStoragePath();
    try {
      const dir = path.dirname(targetFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(targetFile)) {
        fs.writeFileSync(targetFile, '[]', 'utf8');
      }
      return targetFile;
    } catch {
      const tmpFile = path.join(os.tmpdir(), 'custom-drafts.json');
      try {
        if (!fs.existsSync(tmpFile)) {
          fs.writeFileSync(tmpFile, '[]', 'utf8');
        }
        return tmpFile;
      } catch {
        return tmpFile;
      }
    }
  }

  public getAllDrafts(): DocumentDraft[] {
    if (this.inMemoryCache && this.inMemoryCache.length > 0) {
      return this.inMemoryCache;
    }
    const file = this.ensureDataFile();
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw) as DocumentDraft[];
        this.inMemoryCache = parsed;
        return parsed;
      }
    } catch (err) {
      console.error('Failed to load custom drafts:', err);
    }
    return this.inMemoryCache || [];
  }

  public async getAllDraftsAsync(): Promise<DocumentDraft[]> {
    if (isSupabaseConfigured()) {
      try {
        const cloudDrafts = await fetchCustomDraftsFromSupabase();
        if (cloudDrafts !== null) {
          if (cloudDrafts.length > 0) {
            this.inMemoryCache = cloudDrafts;
            this.hasInitializedCloud = true;
            this.saveLocalCache(cloudDrafts);
            return cloudDrafts;
          } else if (!this.hasInitializedCloud) {
            // If cloud is empty, seed from local if available
            const local = this.getAllDrafts();
            if (local.length > 0) {
              for (const draft of local) {
                await saveCustomDraftToSupabase(draft).catch(() => {});
              }
              this.hasInitializedCloud = true;
              return local;
            }
          }
          this.inMemoryCache = cloudDrafts;
          return cloudDrafts;
        }
      } catch (err: any) {
        console.warn('⚠️ [DraftStore] Supabase fetch drafts error, using local:', err.message);
      }
    }
    return this.getAllDrafts();
  }

  private saveLocalCache(drafts: DocumentDraft[]): void {
    const targetFile = this.getStoragePath();
    try {
      const dir = path.dirname(targetFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(targetFile, JSON.stringify(drafts, null, 2), 'utf8');
    } catch {
      try {
        const tmpFile = path.join(os.tmpdir(), 'custom-drafts.json');
        fs.writeFileSync(tmpFile, JSON.stringify(drafts, null, 2), 'utf8');
      } catch (tmpErr) {
        console.warn('Persisting drafts to disk failed; using memory.', tmpErr);
      }
    }
  }

  public saveDraft(draft: DocumentDraft): DocumentDraft {
    const drafts = this.getAllDrafts();
    const existingIdx = drafts.findIndex((d) => d.id === draft.id);

    const now = new Date().toISOString();
    const updated: DocumentDraft = {
      ...draft,
      updatedAt: now,
      createdAt: existingIdx >= 0 ? (drafts[existingIdx].createdAt || now) : (draft.createdAt || now),
    };

    if (existingIdx >= 0) {
      drafts[existingIdx] = updated;
    } else {
      drafts.unshift(updated);
    }

    this.inMemoryCache = drafts;
    this.saveLocalCache(drafts);

    if (isSupabaseConfigured()) {
      saveCustomDraftToSupabase(updated).catch((e) => {
        console.warn('⚠️ [DraftStore] Background Supabase draft save error:', e.message);
      });
    }

    return updated;
  }

  public async saveDraftAsync(draft: DocumentDraft): Promise<DocumentDraft> {
    const updated = this.saveDraft(draft);
    if (isSupabaseConfigured()) {
      await saveCustomDraftToSupabase(updated);
    }
    return updated;
  }

  public deleteDraft(id: string): void {
    const drafts = this.getAllDrafts();
    const idx = drafts.findIndex((d) => d.id === id);
    if (idx !== -1) {
      drafts.splice(idx, 1);
      this.inMemoryCache = drafts;
      this.saveLocalCache(drafts);

      if (isSupabaseConfigured()) {
        deleteCustomDraftFromSupabase(id).catch((e) => {
          console.warn('⚠️ [DraftStore] Background Supabase draft delete error:', e.message);
        });
      }
    }
  }

  public async deleteDraftAsync(id: string): Promise<void> {
    this.deleteDraft(id);
    if (isSupabaseConfigured()) {
      await deleteCustomDraftFromSupabase(id);
    }
  }
}

export const draftStore = new DraftStore();
