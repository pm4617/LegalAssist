import fs from 'fs';
import path from 'path';
import os from 'os';
import { DocumentDraft } from '../types/index.js';

class DraftStore {
  private inMemoryCache: DocumentDraft[] | null = null;

  private getStoragePath(): string {
    if (process.env.VERCEL) {
      return path.join(os.tmpdir(), 'custom-drafts.json');
    }
    return path.join(process.cwd(), 'data', 'custom-drafts.json');
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
    const targetFile = this.getStoragePath();
    try {
      const dir = path.dirname(targetFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(targetFile, JSON.stringify(drafts, null, 2), 'utf8');
    } catch (err) {
      try {
        const tmpFile = path.join(os.tmpdir(), 'custom-drafts.json');
        fs.writeFileSync(tmpFile, JSON.stringify(drafts, null, 2), 'utf8');
      } catch (tmpErr) {
        console.warn('Persisting drafts to disk failed in serverless; using memory.', tmpErr);
      }
    }

    return updated;
  }

  public deleteDraft(id: string): void {
    const drafts = this.getAllDrafts();
    const idx = drafts.findIndex((d) => d.id === id);
    if (idx !== -1) {
      drafts.splice(idx, 1);
      this.inMemoryCache = drafts;
      const targetFile = this.getStoragePath();
      try {
        fs.writeFileSync(targetFile, JSON.stringify(drafts, null, 2), 'utf8');
      } catch {}
    }
  }
}

export const draftStore = new DraftStore();
