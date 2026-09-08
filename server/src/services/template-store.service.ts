import fs from 'fs';
import path from 'path';
import { TEMPLATES } from '../templates/registry.js';
import { LegalTemplate } from '../types/index.js';

const DATA_FILE = path.join(__dirname, '../../data/custom-templates.json');

class TemplateStore {
  private ensureDataFile(): void {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }

  loadCustomTemplates(): LegalTemplate[] {
    this.ensureDataFile();
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw) as LegalTemplate[];
    } catch {
      return [];
    }
  }

  saveCustomTemplates(templates: LegalTemplate[]): void {
    this.ensureDataFile();
    fs.writeFileSync(DATA_FILE, JSON.stringify(templates, null, 2), 'utf8');
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
