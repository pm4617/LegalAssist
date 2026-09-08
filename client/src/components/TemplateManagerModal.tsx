import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Edit,
  Copy,
  FileText,
  Search,
  ShieldCheck,
  Tag,
  AlertTriangle,
  CheckCircle,
  Type,
} from 'lucide-react';
import { LegalTemplate, TemplateCategory } from '../types';
import { TemplateEditorModal } from './TemplateEditorModal';

interface TemplateManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: LegalTemplate[];
  onTemplatesChanged: () => void;
  onSelectTemplate: (templateId: string) => void;
}

export const TemplateManagerModal: React.FC<TemplateManagerModalProps> = ({
  isOpen,
  onClose,
  templates,
  onTemplatesChanged,
  onSelectTemplate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<LegalTemplate | null>(null);

  // Editor Modal State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<LegalTemplate | null>(null);

  // Error / Info Message
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  // Selected preview template default
  const activePreview = selectedTemplate || templates[0] || null;

  // Filter templates
  const filteredTemplates = templates.filter((t) => {
    const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
    const matchesSearch =
      searchQuery === '' ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.titleMr && t.titleMr.toLowerCase().includes(searchQuery.toLowerCase())) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleCreateNew = () => {
    setEditingTemplate(null);
    setIsEditorOpen(true);
  };

  const handleEdit = (tmpl: LegalTemplate) => {
    if (tmpl.isBuiltIn) {
      setActionError(`"${tmpl.title}" is a built-in template. Use "Clone" to create an editable copy.`);
      setTimeout(() => setActionError(null), 4000);
      return;
    }
    setEditingTemplate(tmpl);
    setIsEditorOpen(true);
  };

  const handleClone = async (tmpl: LegalTemplate) => {
    const newId = `${tmpl.id}-copy-${Date.now().toString().slice(-4)}`;
    const newTitle = `${tmpl.title} (Custom Copy)`;

    try {
      const res = await fetch(`/api/templates/${tmpl.id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newId, newTitle }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to clone template');
      }
      setActionSuccess(`Cloned "${tmpl.title}" as "${newTitle}". You can now edit it.`);
      setTimeout(() => setActionSuccess(null), 4000);
      onTemplatesChanged();
    } catch (err: any) {
      setActionError(err.message);
      setTimeout(() => setActionError(null), 4000);
    }
  };

  const handleRename = async (tmpl: LegalTemplate) => {
    if (tmpl.isBuiltIn) {
      setActionError(`Cannot rename built-in template "${tmpl.title}". Clone it first.`);
      setTimeout(() => setActionError(null), 4000);
      return;
    }

    const newTitle = window.prompt('Enter new title for custom template (English):', tmpl.title);
    if (!newTitle || !newTitle.trim()) return;

    const newTitleMr = window.prompt('Enter new title (Marathi Devanagari):', tmpl.titleMr || tmpl.title);

    try {
      const updated: LegalTemplate = {
        ...tmpl,
        title: newTitle.trim(),
        titleMr: newTitleMr ? newTitleMr.trim() : tmpl.titleMr,
      };

      const res = await fetch(`/api/templates/${tmpl.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to rename template');
      }

      const saved = await res.json();
      setActionSuccess(`Renamed template to "${saved.title}".`);
      setTimeout(() => setActionSuccess(null), 4000);
      onTemplatesChanged();
      setSelectedTemplate(saved);
    } catch (err: any) {
      setActionError(err.message);
      setTimeout(() => setActionError(null), 4000);
    }
  };

  const handleDelete = async (tmpl: LegalTemplate) => {
    if (tmpl.isBuiltIn) {
      setActionError(`Cannot delete built-in template "${tmpl.title}".`);
      setTimeout(() => setActionError(null), 4000);
      return;
    }

    if (!window.confirm(`Are you sure you want to delete template "${tmpl.title}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/templates/${tmpl.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete template');
      }
      setActionSuccess(`Deleted template "${tmpl.title}".`);
      setTimeout(() => setActionSuccess(null), 4000);
      if (selectedTemplate?.id === tmpl.id) {
        setSelectedTemplate(null);
      }
      onTemplatesChanged();
    } catch (err: any) {
      setActionError(err.message);
      setTimeout(() => setActionError(null), 4000);
    }
  };

  const handleSaveTemplate = async (templateToSave: LegalTemplate) => {
    const isEdit = !!editingTemplate;
    const url = isEdit ? `/api/templates/${editingTemplate.id}` : '/api/templates';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(templateToSave),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to save template');
    }

    const saved = await res.json();
    setActionSuccess(`${isEdit ? 'Updated' : 'Created'} template "${saved.title}".`);
    setTimeout(() => setActionSuccess(null), 4000);
    onTemplatesChanged();
    setSelectedTemplate(saved);
  };

  const getCategoryLabel = (cat: TemplateCategory) => {
    switch (cat) {
      case 'family':
        return 'Family Court (कौटुंबिक)';
      case 'commercial':
        return 'Commercial (कराराचे)';
      case 'litigation':
        return 'Litigation (दावे)';
      case 'notices':
        return 'Notices (नोटीस)';
      default:
        return 'General / Affidavits (इतर)';
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-6xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/20">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  Legal Template Library & Manager
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-normal">
                    {templates.length} Templates Available
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Manage, create, clone, and edit Marathi & English legal petitions, court applications, and commercial agreements
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreateNew}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition"
              >
                <Plus className="w-4 h-4" /> Create New Template
              </button>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Action Notifications */}
          {actionError && (
            <div className="mx-6 mt-3 p-3 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}
          {actionSuccess && (
            <div className="mx-6 mt-3 p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {/* Main Layout: Left Search + Sidebar List, Right Detail Preview */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Sidebar List */}
            <div className="w-full md:w-5/12 border-r border-slate-800 flex flex-col bg-slate-950/40">
              {/* Search & Category Filter */}
              <div className="p-4 border-b border-slate-800 space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search templates by title or key..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-[11px]">
                  {['all', 'family', 'commercial', 'litigation', 'notices', 'general'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg capitalize whitespace-nowrap transition ${
                        selectedCategory === cat
                          ? 'bg-indigo-600 text-white font-medium'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template Items */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
                {filteredTemplates.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">No templates match your search.</div>
                ) : (
                  filteredTemplates.map((tmpl) => {
                    const isSelected = activePreview?.id === tmpl.id;
                    return (
                      <div
                        key={tmpl.id}
                        onClick={() => setSelectedTemplate(tmpl)}
                        className={`p-4 cursor-pointer transition flex flex-col gap-2 ${
                          isSelected ? 'bg-indigo-950/40 border-l-4 border-indigo-500' : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-white text-xs leading-snug">{tmpl.title}</h4>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-mono shrink-0 ${
                              tmpl.isBuiltIn
                                ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            }`}
                          >
                            {tmpl.isBuiltIn ? 'Built-in' : 'Custom'}
                          </span>
                        </div>

                        {tmpl.titleMr && <p className="text-[11px] text-indigo-300/80 font-serif">{tmpl.titleMr}</p>}

                        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                          <span className="flex items-center gap-1">
                            <Tag className="w-3 h-3 text-slate-500" /> {getCategoryLabel(tmpl.category)}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">{tmpl.fields.length} fields</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Detail Preview */}
            <div className="hidden md:flex flex-1 flex-col overflow-hidden bg-slate-900/60">
              {activePreview ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Top Bar */}
                  <div className="p-5 border-b border-slate-800 flex items-start justify-between bg-slate-900">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
                          ID: {activePreview.id}
                        </span>
                        {activePreview.isBuiltIn ? (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-indigo-400" /> System Built-in
                          </span>
                        ) : (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                            Custom Template
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-white">{activePreview.title}</h3>
                      {activePreview.titleMr && <p className="text-xs text-indigo-300 font-serif mt-0.5">{activePreview.titleMr}</p>}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          onSelectTemplate(activePreview.id);
                          onClose();
                        }}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition"
                      >
                        Use Template
                      </button>

                      <button
                        onClick={() => handleClone(activePreview)}
                        title="Clone Template"
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs flex items-center gap-1 transition"
                      >
                        <Copy className="w-4 h-4" /> Clone
                      </button>

                      <button
                        onClick={() => handleRename(activePreview)}
                        disabled={activePreview.isBuiltIn}
                        title={activePreview.isBuiltIn ? 'Cannot rename built-in template. Clone it first.' : 'Rename Custom Template'}
                        className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-xl text-xs flex items-center gap-1 transition"
                      >
                        <Type className="w-4 h-4" /> Rename
                      </button>

                      <button
                        onClick={() => handleEdit(activePreview)}
                        disabled={activePreview.isBuiltIn}
                        title={activePreview.isBuiltIn ? 'Cannot edit built-in template. Clone it first.' : 'Edit Template'}
                        className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-xl text-xs flex items-center gap-1 transition"
                      >
                        <Edit className="w-4 h-4" /> Edit
                      </button>

                      {!activePreview.isBuiltIn && (
                        <button
                          onClick={() => handleDelete(activePreview)}
                          title="Delete Template"
                          className="p-2 bg-red-950/60 hover:bg-red-900/80 text-red-300 rounded-xl text-xs transition border border-red-800/40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Detail Body */}
                  <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs">
                    <div>
                      <h4 className="font-semibold text-slate-300 mb-1">Description</h4>
                      <p className="text-slate-400 leading-relaxed">{activePreview.description || 'No description provided.'}</p>
                      {activePreview.descriptionMr && (
                        <p className="text-indigo-300/80 mt-1 leading-relaxed">{activePreview.descriptionMr}</p>
                      )}
                    </div>

                    {/* Statutory Requirements */}
                    {activePreview.statutoryRequirements && activePreview.statutoryRequirements.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-slate-300 mb-2">Statutory & Statutory Requirements</h4>
                        <div className="space-y-1.5">
                          {activePreview.statutoryRequirements.map((req, idx) => (
                            <div key={idx} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 flex items-center gap-2">
                              <span className="text-emerald-400 text-xs">✓</span> {req}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dynamic Fields List */}
                    <div>
                      <h4 className="font-semibold text-slate-300 mb-2">Form Inputs ({activePreview.fields.length})</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {activePreview.fields.map((f, i) => (
                          <div key={i} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px]">
                            <div className="text-indigo-400 font-bold">{'{' + f.key + '}'}</div>
                            <div className="text-slate-300 font-sans text-xs mt-0.5">{f.label} {f.labelMr ? `(${f.labelMr})` : ''}</div>
                            <div className="text-slate-500 text-[10px] mt-1 font-sans capitalize">Type: {f.type} • Group: {f.group || 'general'}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Template Text Preview */}
                    <div>
                      <h4 className="font-semibold text-slate-300 mb-2">Draft Template Text (Visual Preview)</h4>
                      <div
                        className="bg-white text-slate-900 p-5 rounded-xl border border-slate-300 font-marathi text-xs leading-relaxed max-h-80 overflow-y-auto shadow-inner"
                        dangerouslySetInnerHTML={{
                          __html: (activePreview.templateText || '')
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/&quot;/g, '"')
                            .replace(/&#39;/g, "'")
                            .replace(/&amp;/g, '&')
                            .replace(/<center>([\s\S]*?)<\/center>/gi, '<div style="text-align: center;">$1</div>')
                            .replace(/<p align=["']center["']>([\s\S]*?)<\/p>/gi, '<div style="text-align: center;">$1</div>')
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">Select a template to view details</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Template Editor Modal */}
      <TemplateEditorModal
        key={editingTemplate ? editingTemplate.id : 'new-template'}
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSave={handleSaveTemplate}
        initialTemplate={editingTemplate}
      />
    </>
  );
};
