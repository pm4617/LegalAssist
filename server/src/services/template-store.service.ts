import fs from 'fs';
import path from 'path';
import os from 'os';
import { TEMPLATES } from '../templates/registry.js';
import { LegalTemplate } from '../types/index.js';

class TemplateStore {
  private inMemoryCache: LegalTemplate[] | null = null;

  private getStoragePath(): string {
    if (process.env.VERCEL) {
      return path.join(os.tmpdir(), 'custom-templates.json');
    }
    return path.join(__dirname, '../../data/custom-templates.json');
  }

  private ensureDataFile(): string {
    let targetFile = this.getStoragePath();
    try {
      const dir = path.dirname(targetFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(targetFile)) {
        // Try reading seed data from bundled data dir first if available
        const seedFile = path.join(__dirname, '../../data/custom-templates.json');
        let initialData = '[]';
        if (fs.existsSync(seedFile)) {
          try { initialData = fs.readFileSync(seedFile, 'utf8'); } catch {}
        }
        fs.writeFileSync(targetFile, initialData, 'utf8');
      }
      return targetFile;
    } catch (err: any) {
      // Fallback to /tmp if primary path is read-only (EROFS)
      const tmpFile = path.join(os.tmpdir(), 'custom-templates.json');
      try {
        if (!fs.existsSync(tmpFile)) {
          const seedFile = path.join(__dirname, '../../data/custom-templates.json');
          let initialData = '[]';
          if (fs.existsSync(seedFile)) {
            try { initialData = fs.readFileSync(seedFile, 'utf8'); } catch {}
          }
          fs.writeFileSync(tmpFile, initialData, 'utf8');
        }
        return tmpFile;
      } catch {
        return tmpFile;
      }
    }
  }

  loadCustomTemplates(): LegalTemplate[] {
    const file = this.ensureDataFile();
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw) as LegalTemplate[];
        this.inMemoryCache = parsed;
        return parsed;
      }
    } catch {
      // If reading from storage fails, try seed file directly
      try {
        const seedFile = path.join(__dirname, '../../data/custom-templates.json');
        if (fs.existsSync(seedFile)) {
          const raw = fs.readFileSync(seedFile, 'utf8');
          const parsed = JSON.parse(raw) as LegalTemplate[];
          this.inMemoryCache = parsed;
          return parsed;
        }
      } catch {}
    }
    return this.inMemoryCache || [];
  }

  saveCustomTemplates(templates: LegalTemplate[]): void {
    this.inMemoryCache = templates;
    let targetFile = this.getStoragePath();
    try {
      const dir = path.dirname(targetFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(targetFile, JSON.stringify(templates, null, 2), 'utf8');
    } catch (err: any) {
      // If writing to primary storage fails due to EROFS/EACCES, write to /tmp
      try {
        const tmpFile = path.join(os.tmpdir(), 'custom-templates.json');
        fs.writeFileSync(tmpFile, JSON.stringify(templates, null, 2), 'utf8');
      } catch (tmpErr) {
        console.warn('Persisting to disk failed in serverless environment; using in-memory state.', tmpErr);
      }
    }
  }

  /** Returns built-in templates merged with custom (custom overrides built-in if same id) */
  getAllTemplates(): LegalTemplate[] {
    const custom = this.loadCustomTemplates();
    const customIds = new Set(custom.map((t) => t.id));
    const builtIns = TEMPLATES.filter((t) => !customIds.has(t.id));
    return [...builtIns, ...custom];
  }

  getTemplate(id: string): LegalTemplate | undefined {
    return this.getAllTemplates().find((t) => t.id === id);
  }

  /** Upsert a custom template. Saves over any previous custom entry with same id. */
  saveTemplate(template: LegalTemplate): LegalTemplate {
    const custom = this.loadCustomTemplates();
    const existingIdx = custom.findIndex((t) => t.id === template.id);

    const now = new Date().toISOString();
    const updated: LegalTemplate = {
      ...template,
      isBuiltIn: false,
      updatedAt: now,
      createdAt: existingIdx >= 0 ? (custom[existingIdx].createdAt || now) : now,
    };

    if (existingIdx >= 0) {
      custom[existingIdx] = updated;
    } else {
      custom.push(updated);
    }
    this.saveCustomTemplates(custom);
    return updated;
  }

  /** Delete a custom template. Throws if it is a built-in template from registry. */
  deleteTemplate(id: string): void {
    const builtIn = TEMPLATES.find((t) => t.id === id);
    if (builtIn) {
      throw new Error(`Cannot delete built-in template "${id}". Clone it first to create an editable copy.`);
    }
    const custom = this.loadCustomTemplates();
    const idx = custom.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Template "${id}" not found in custom store.`);
    custom.splice(idx, 1);
    this.saveCustomTemplates(custom);
  }

  /** Clone a template as a new custom template with a new id */
  cloneTemplate(sourceId: string, newId: string, newTitle: string): LegalTemplate {
    const source = this.getTemplate(sourceId);
    if (!source) throw new Error(`Template "${sourceId}" not found.`);
    const cloned: LegalTemplate = {
      ...source,
      id: newId,
      title: newTitle,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return this.saveTemplate(cloned);
  }
}

export const templateStore = new TemplateStore();

