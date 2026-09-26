import fs from 'fs';
import path from 'path';
import os from 'os';
import { TEMPLATES } from '../templates/registry.js';
import { LegalTemplate } from '../types/index.js';
import {
  isSupabaseConfigured,
  fetchCustomTemplatesFromSupabase,
  saveCustomTemplateToSupabase,
  deleteCustomTemplateFromSupabase,
  batchUpsertCustomTemplatesToSupabase,
  saveTemplatePdf,
  getTemplatePdf,
  deleteTemplatePdf,
} from './supabase.service.js';

class TemplateStore {
  private inMemoryCache: LegalTemplate[] | null = null;
  private hasInitializedCloud: boolean = false;

  constructor() {
    // Eagerly populate cache in background on startup
    this.loadCustomTemplatesAsync().catch((err) => {
      console.warn('⚠️ [TemplateStore] Initial cloud load warning:', err.message);
    });
  }

  private getStoragePath(): string {
    if (process.env.VERCEL) {
      return path.join(os.tmpdir(), 'custom-templates.json');
    }
    const localData = path.join(process.cwd(), 'data', 'custom-templates.json');
    if (fs.existsSync(path.dirname(localData))) {
      return localData;
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
        const seedFile = path.join(process.cwd(), 'data', 'custom-templates.json');
        let initialData = '[]';
        if (fs.existsSync(seedFile)) {
          try { initialData = fs.readFileSync(seedFile, 'utf8'); } catch {}
        }
        fs.writeFileSync(targetFile, initialData, 'utf8');
      }
      return targetFile;
    } catch {
      // Fallback to /tmp if primary path is read-only (EROFS)
      const tmpFile = path.join(os.tmpdir(), 'custom-templates.json');
      try {
        if (!fs.existsSync(tmpFile)) {
          const seedFile = path.join(process.cwd(), 'data', 'custom-templates.json');
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

  /**
   * Synchronous load from memory or local disk file.
   */
  loadCustomTemplates(): LegalTemplate[] {
    if (this.inMemoryCache && this.inMemoryCache.length > 0) {
      return this.inMemoryCache;
    }

    const file = this.ensureDataFile();
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw) as LegalTemplate[];
        this.inMemoryCache = parsed;
        return parsed;
      }
    } catch {
      try {
        const seedFile = path.join(process.cwd(), 'data', 'custom-templates.json');
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

  /**
   * Asynchronous load with Supabase cloud persistence and automatic local sync.
   */
  async loadCustomTemplatesAsync(): Promise<LegalTemplate[]> {
    if (isSupabaseConfigured()) {
      try {
        const cloudTemplates = await fetchCustomTemplatesFromSupabase();
        if (cloudTemplates !== null) {
          if (cloudTemplates.length > 0) {
            this.inMemoryCache = cloudTemplates;
            this.hasInitializedCloud = true;
            this.saveLocalCache(cloudTemplates);
            return cloudTemplates;
          } else if (!this.hasInitializedCloud) {
            // First time running with Supabase: migrate existing local templates to Supabase
            const local = this.loadCustomTemplates();
            if (local.length > 0) {
              console.log(`⚡ [Supabase] Empty cloud database detected. Migrating ${local.length} local templates to Supabase...`);
              await batchUpsertCustomTemplatesToSupabase(local);
              this.hasInitializedCloud = true;
              return local;
            }
          }
          this.inMemoryCache = cloudTemplates;
          return cloudTemplates;
        }
      } catch (err: any) {
        console.warn('⚠️ [TemplateStore] Supabase fetch failed, falling back to local storage:', err.message);
      }
    }

    return this.loadCustomTemplates();
  }

  private saveLocalCache(templates: LegalTemplate[]): void {
    let targetFile = this.getStoragePath();
    try {
      const dir = path.dirname(targetFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(targetFile, JSON.stringify(templates, null, 2), 'utf8');
    } catch {
      try {
        const tmpFile = path.join(os.tmpdir(), 'custom-templates.json');
        fs.writeFileSync(tmpFile, JSON.stringify(templates, null, 2), 'utf8');
      } catch {}
    }
  }

  saveCustomTemplates(templates: LegalTemplate[]): void {
    this.inMemoryCache = templates;
    this.saveLocalCache(templates);
  }

  /** Returns built-in templates merged with custom (custom overrides built-in if same id) */
  getAllTemplates(): LegalTemplate[] {
    const custom = this.loadCustomTemplates();
    const customIds = new Set(custom.map((t) => t.id));
    const builtIns = TEMPLATES.filter((t) => !customIds.has(t.id));
    return [...builtIns, ...custom];
  }

  async getAllTemplatesAsync(): Promise<LegalTemplate[]> {
    const custom = await this.loadCustomTemplatesAsync();
    const customIds = new Set(custom.map((t) => t.id));
    const builtIns = TEMPLATES.filter((t) => !customIds.has(t.id));
    return [...builtIns, ...custom];
  }

  getTemplate(id: string): LegalTemplate | undefined {
    return this.getAllTemplates().find((t) => t.id === id);
  }

  async getTemplateAsync(id: string): Promise<LegalTemplate | undefined> {
    const all = await this.getAllTemplatesAsync();
    return all.find((t) => t.id === id);
  }

  /** Upsert a custom template synchronously with background Supabase sync. */
  saveTemplate(template: LegalTemplate): LegalTemplate {
    const custom = this.loadCustomTemplates();
    const existingIdx = custom.findIndex((t) => t.id === template.id);

    const now = new Date().toISOString();

    // Handle reference PDF metadata and binary extraction
    let cleanRefPdf = template.referencePdf ? { ...template.referencePdf } : undefined;
    if (template.referencePdf?.dataBase64) {
      const rawBase64 = template.referencePdf.dataBase64.replace(/^data:application\/pdf;base64,/, '');
      const pdfBuf = Buffer.from(rawBase64, 'base64');
      const fileName = template.referencePdf.fileName || `${template.id}.pdf`;
      const mimeType = template.referencePdf.mimeType || 'application/pdf';
      const fileSize = pdfBuf.length;

      // Save raw PDF binary to DB and local storage
      saveTemplatePdf(template.id, fileName, fileSize, pdfBuf, mimeType).catch((err) => {
        console.error('❌ Failed saving template PDF:', err.message);
      });

      // Strip large dataBase64 string from template JSON model
      delete cleanRefPdf?.dataBase64;
      cleanRefPdf = {
        fileName,
        fileSize,
        mimeType,
        uploadedAt: now,
      };
    } else if (!template.referencePdf) {
      // PDF was removed while editing
      if (existingIdx >= 0 && custom[existingIdx].referencePdf) {
        deleteTemplatePdf(template.id).catch(() => {});
      }
      cleanRefPdf = undefined;
    }

    const updated: LegalTemplate = {
      ...template,
      isBuiltIn: false,
      updatedAt: now,
      createdAt: existingIdx >= 0 ? (custom[existingIdx].createdAt || now) : now,
      referencePdf: cleanRefPdf,
    };

    if (existingIdx >= 0) {
      custom[existingIdx] = updated;
    } else {
      custom.push(updated);
    }
    this.saveCustomTemplates(custom);

    if (isSupabaseConfigured()) {
      saveCustomTemplateToSupabase(updated).catch((e) => {
        console.warn('⚠️ [TemplateStore] Background Supabase save error:', e.message);
      });
    }

    return updated;
  }

  /** Upsert a custom template asynchronously, awaiting Supabase write. */
  async saveTemplateAsync(template: LegalTemplate): Promise<LegalTemplate> {
    const custom = this.loadCustomTemplates();
    const existingIdx = custom.findIndex((t) => t.id === template.id);
    const now = new Date().toISOString();

    let cleanRefPdf = template.referencePdf ? { ...template.referencePdf } : undefined;
    if (template.referencePdf?.dataBase64) {
      const rawBase64 = template.referencePdf.dataBase64.replace(/^data:application\/pdf;base64,/, '');
      const pdfBuf = Buffer.from(rawBase64, 'base64');
      const fileName = template.referencePdf.fileName || `${template.id}.pdf`;
      const mimeType = template.referencePdf.mimeType || 'application/pdf';
      const fileSize = pdfBuf.length;

      await saveTemplatePdf(template.id, fileName, fileSize, pdfBuf, mimeType);

      delete cleanRefPdf?.dataBase64;
      cleanRefPdf = {
        fileName,
        fileSize,
        mimeType,
        uploadedAt: now,
      };
    } else if (!template.referencePdf) {
      if (existingIdx >= 0 && custom[existingIdx].referencePdf) {
        await deleteTemplatePdf(template.id);
      }
      cleanRefPdf = undefined;
    }

    const updated: LegalTemplate = {
      ...template,
      isBuiltIn: false,
      updatedAt: now,
      createdAt: existingIdx >= 0 ? (custom[existingIdx].createdAt || now) : now,
      referencePdf: cleanRefPdf,
    };

    if (existingIdx >= 0) {
      custom[existingIdx] = updated;
    } else {
      custom.push(updated);
    }
    this.saveCustomTemplates(custom);

    if (isSupabaseConfigured()) {
      await saveCustomTemplateToSupabase(updated);
    }
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

    // Delete associated PDF
    deleteTemplatePdf(id).catch((e) => {
      console.warn('⚠️ [TemplateStore] Failed deleting template PDF on delete:', e.message);
    });

    if (isSupabaseConfigured()) {
      deleteCustomTemplateFromSupabase(id).catch((e) => {
        console.warn('⚠️ [TemplateStore] Background Supabase delete error:', e.message);
      });
    }
  }

  async deleteTemplateAsync(id: string): Promise<void> {
    const builtIn = TEMPLATES.find((t) => t.id === id);
    if (builtIn) {
      throw new Error(`Cannot delete built-in template "${id}". Clone it first to create an editable copy.`);
    }
    const custom = this.loadCustomTemplates();
    const idx = custom.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Template "${id}" not found in custom store.`);
    custom.splice(idx, 1);
    this.saveCustomTemplates(custom);

    // Await deletion of associated PDF
    await deleteTemplatePdf(id);

    if (isSupabaseConfigured()) {
      await deleteCustomTemplateFromSupabase(id);
    }
  }

  /** Fetch reference PDF binary and metadata for a template */
  async getTemplatePdf(id: string) {
    return getTemplatePdf(id);
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

  async cloneTemplateAsync(sourceId: string, newId: string, newTitle: string): Promise<LegalTemplate> {
    const source = await this.getTemplateAsync(sourceId);
    if (!source) throw new Error(`Template "${sourceId}" not found.`);
    const cloned: LegalTemplate = {
      ...source,
      id: newId,
      title: newTitle,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return this.saveTemplateAsync(cloned);
  }
}

export const templateStore = new TemplateStore();
