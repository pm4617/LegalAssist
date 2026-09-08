"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.templateStore = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const registry_js_1 = require("../templates/registry.js");
const DATA_FILE = path_1.default.join(__dirname, '../../data/custom-templates.json');
class TemplateStore {
    ensureDataFile() {
        const dir = path_1.default.dirname(DATA_FILE);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        if (!fs_1.default.existsSync(DATA_FILE))
            fs_1.default.writeFileSync(DATA_FILE, '[]', 'utf8');
    }
    loadCustomTemplates() {
        this.ensureDataFile();
        try {
            const raw = fs_1.default.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(raw);
        }
        catch {
            return [];
        }
    }
    saveCustomTemplates(templates) {
        this.ensureDataFile();
        fs_1.default.writeFileSync(DATA_FILE, JSON.stringify(templates, null, 2), 'utf8');
    }
    /** Returns built-in templates merged with custom (custom overrides built-in if same id) */
    getAllTemplates() {
        const custom = this.loadCustomTemplates();
        const customIds = new Set(custom.map((t) => t.id));
        const builtIns = registry_js_1.TEMPLATES.filter((t) => !customIds.has(t.id));
        return [...builtIns, ...custom];
    }
    getTemplate(id) {
        return this.getAllTemplates().find((t) => t.id === id);
    }
    /** Upsert a custom template. Saves over any previous custom entry with same id. */
    saveTemplate(template) {
        const custom = this.loadCustomTemplates();
        const existingIdx = custom.findIndex((t) => t.id === template.id);
        const now = new Date().toISOString();
        const updated = {
            ...template,
            isBuiltIn: false,
            updatedAt: now,
            createdAt: existingIdx >= 0 ? (custom[existingIdx].createdAt || now) : now,
        };
        if (existingIdx >= 0) {
            custom[existingIdx] = updated;
        }
        else {
            custom.push(updated);
        }
        this.saveCustomTemplates(custom);
        return updated;
    }
    /** Delete a custom template. Throws if it is a built-in template from registry. */
    deleteTemplate(id) {
        const builtIn = registry_js_1.TEMPLATES.find((t) => t.id === id);
        if (builtIn) {
            throw new Error(`Cannot delete built-in template "${id}". Clone it first to create an editable copy.`);
        }
        const custom = this.loadCustomTemplates();
        const idx = custom.findIndex((t) => t.id === id);
        if (idx === -1)
            throw new Error(`Template "${id}" not found in custom store.`);
        custom.splice(idx, 1);
        this.saveCustomTemplates(custom);
    }
    /** Clone a template as a new custom template with a new id */
    cloneTemplate(sourceId, newId, newTitle) {
        const source = this.getTemplate(sourceId);
        if (!source)
            throw new Error(`Template "${sourceId}" not found.`);
        const cloned = {
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
exports.templateStore = new TemplateStore();
