import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  Save,
  FileText,
  Settings,
  Layers,
  Code,
  AlertCircle,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Italic,
  Underline,
  Heading,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  ExternalLink,
  Search,
  Strikethrough,
  Quote,
  Minus,
  Type,
  Eye,
  Scissors,
  Indent,
  Outdent,
  Table,
  Rows,
  Paintbrush,
  Download,
  Upload,
  Copy,
  Sparkles,
} from 'lucide-react';
import { LegalTemplate, FieldDefinition, TemplateCategory, TemplateLanguage } from '../types';
import { convertToDevanagari } from '../utils/transliterate';

interface TemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (template: LegalTemplate) => Promise<void>;
  initialTemplate?: LegalTemplate | null;
  allTemplates?: LegalTemplate[];
}

export const TemplateEditorModal: React.FC<TemplateEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialTemplate,
  allTemplates = [],
}) => {
  const isEditing = !!initialTemplate;
  const bodyTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const richEditorRef = useRef<HTMLDivElement>(null);
  const editorFileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'basic' | 'body' | 'fields'>('basic');
  const [editorMode, setEditorMode] = useState<'visual' | 'code'>('visual');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transliteratingKey, setTransliteratingKey] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [placeholderSearch, setPlaceholderSearch] = useState('');

  // Form State
  const [id, setId] = useState(initialTemplate?.id || '');
  const [title, setTitle] = useState(initialTemplate?.title || '');
  const [titleMr, setTitleMr] = useState(initialTemplate?.titleMr || '');
  const [category, setCategory] = useState<TemplateCategory>(initialTemplate?.category || 'general');
  const [language, setLanguage] = useState<TemplateLanguage>(initialTemplate?.language || 'mr');
  const [description, setDescription] = useState(initialTemplate?.description || '');
  const [descriptionMr, setDescriptionMr] = useState(initialTemplate?.descriptionMr || '');
  const [courtApplicable, setCourtApplicable] = useState(initialTemplate?.courtApplicable ?? true);
  const [defaultCourt, setDefaultCourt] = useState(initialTemplate?.defaultCourt || 'मे. दिवाणी न्यायाधीश वरिष्ठ स्तर, अमळनेर');
  const [templateText, setTemplateText] = useState(initialTemplate?.templateText || '');
  const [statutoryRequirements, setStatutoryRequirements] = useState<string[]>(
    initialTemplate?.statutoryRequirements || []
  );

  const [fields, setFields] = useState<FieldDefinition[]>(initialTemplate?.fields || []);

  const handleDuplicateField = (idx: number) => {
    const target = fields[idx];
    if (!target) return;

    let baseKey = target.key || `field_${idx}`;
    let newKey = `${baseKey}_copy`;
    let counter = 2;
    while (fields.some((f) => f.key === newKey)) {
      newKey = `${baseKey}_copy${counter}`;
      counter++;
    }

    const duplicatedField: FieldDefinition = {
      ...JSON.parse(JSON.stringify(target)),
      key: newKey,
      label: target.label ? `${target.label} (Copy)` : 'Field Copy',
      labelMr: target.labelMr ? `${target.labelMr} (प्रत)` : '',
    };

    const updatedFields = [...fields];
    updatedFields.splice(idx + 1, 0, duplicatedField);
    setFields(updatedFields);
  };

  const handleExportJSON = () => {
    const templateToExport: LegalTemplate = {
      id: id.trim() || 'custom-template',
      title: title.trim() || 'Untitled Template',
      titleMr: titleMr.trim() || undefined,
      category,
      language,
      description: description.trim(),
      descriptionMr: descriptionMr.trim() || undefined,
      courtApplicable,
      defaultCourt: defaultCourt.trim() || undefined,
      fields,
      standardClauses: initialTemplate?.standardClauses || [],
      templateText,
      statutoryRequirements,
      isBuiltIn: false,
      updatedAt: new Date().toISOString(),
    };

    const jsonStr = JSON.stringify(templateToExport, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${templateToExport.id || 'template'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content) as Partial<LegalTemplate>;

        if (!parsed.title && !parsed.fields && !parsed.templateText) {
          throw new Error('Invalid template JSON file format.');
        }

        if (parsed.id) setId(parsed.id);
        if (parsed.title) setTitle(parsed.title);
        if (parsed.titleMr !== undefined) setTitleMr(parsed.titleMr || '');
        if (parsed.category) setCategory(parsed.category);
        if (parsed.language) setLanguage(parsed.language);
        if (parsed.description !== undefined) setDescription(parsed.description || '');
        if (parsed.descriptionMr !== undefined) setDescriptionMr(parsed.descriptionMr || '');
        if (parsed.courtApplicable !== undefined) setCourtApplicable(!!parsed.courtApplicable);
        if (parsed.defaultCourt !== undefined) setDefaultCourt(parsed.defaultCourt || '');
        if (parsed.templateText !== undefined) setTemplateText(parsed.templateText || '');
        if (Array.isArray(parsed.statutoryRequirements)) setStatutoryRequirements(parsed.statutoryRequirements);

        // AUTOMATICALLY CREATE FORM INPUT FIELDS
        if (Array.isArray(parsed.fields)) {
          setFields(parsed.fields);
        }

        setError(null);
        alert(`Successfully imported template "${parsed.title || file.name}" with ${parsed.fields?.length || 0} form input fields!`);
      } catch (err: any) {
        console.error('Import JSON error:', err);
        alert(`Failed to import template JSON: ${err.message}`);
      } finally {
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const formatKeyToLabel = (key: string): string => {
    if (!key) return '';
    const spaced = key
      .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
      .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
      .replace(/[_]/g, ' ')
      .trim();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  };

  const formatKeyToMarathiLabel = (key: string): string => {
    const cleanKey = key.toLowerCase();
    if (cleanKey.includes('party1') || cleanKey.includes('party 1')) return 'अर्जदार / प्रथम पक्षकार माहिती';
    if (cleanKey.includes('party2') || cleanKey.includes('party 2')) return 'सामनेवाला / द्वितीय पक्षकार माहिती';
    if (cleanKey.includes('party3') || cleanKey.includes('party 3')) return 'तृतीय पक्षकार नाव';
    if (cleanKey.includes('party4') || cleanKey.includes('party 4')) return 'चतुर्थ पक्षकार नाव';
    if (cleanKey.includes('party5') || cleanKey.includes('party 5')) return 'पाचवा पक्षकार नाव';
    if (cleanKey.includes('address')) return 'पत्ता';
    if (cleanKey.includes('age')) return 'वय';
    if (cleanKey.includes('date')) return 'दिनांक';
    if (cleanKey.includes('amount')) return 'रक्कम';
    if (cleanKey.includes('city')) return 'शहर';
    if (cleanKey.includes('name')) return 'नाव';
    return formatKeyToLabel(key);
  };

  const handleGenerateVariablesFromText = () => {
    const rawText = templateText || (richEditorRef.current ? richEditorRef.current.innerHTML : '');
    if (!rawText || !rawText.trim()) {
      alert('Please enter or paste template text first in the Body tab.');
      return;
    }

    const matches = rawText.match(/\{([a-zA-Z0-9_\-]+)\}/g);
    if (!matches || matches.length === 0) {
      alert('No {variableName} placeholders found in the template text.');
      return;
    }

    const existingKeys = new Set(fields.map((f) => f.key.trim().toLowerCase()));
    const newFieldsToCreate: FieldDefinition[] = [];
    const processedKeys = new Set<string>();

    for (const rawMatch of matches) {
      const key = rawMatch.replace(/[\{\}]/g, '').trim();
      if (!key || key.includes(' ') || key.includes('<') || key.includes('>')) continue;

      const lowerKey = key.toLowerCase();
      if (existingKeys.has(lowerKey) || processedKeys.has(lowerKey)) continue;

      processedKeys.add(lowerKey);

      const labelEn = formatKeyToLabel(key);
      const labelMr = formatKeyToMarathiLabel(key);
      const isDateField = key.toLowerCase().includes('date');
      const isNumberField = key.toLowerCase().includes('age') || key.toLowerCase().includes('year') || key.toLowerCase().includes('no');

      const newField: FieldDefinition = {
        key: key,
        label: labelEn,
        labelMr: labelMr,
        type: isDateField ? 'date' : isNumberField ? 'number' : 'text',
        required: false,
        group: key.toLowerCase().startsWith('party') ? 'parties' : 'general',
      };

      newFieldsToCreate.push(newField);
    }

    if (newFieldsToCreate.length === 0) {
      alert('All {variableName} placeholders in the text are already present in your Form Input Fields!');
      return;
    }

    setFields((prev) => [...prev, ...newFieldsToCreate]);
    alert(`Successfully generated ${newFieldsToCreate.length} new form input field(s):\n\n${newFieldsToCreate.map((f) => `• {${f.key}} → ${f.label}`).join('\n')}`);
  };

  const [newStatRequirement, setNewStatRequirement] = useState('');
  const [customSections, setCustomSections] = useState<string[]>([]);
  const [isSectionManagerOpen, setIsSectionManagerOpen] = useState(false);
  const [newSectionInput, setNewSectionInput] = useState('');
  const [editingSectionName, setEditingSectionName] = useState<{ oldName: string; newName: string } | null>(null);
  const [rawOptionsTextMap, setRawOptionsTextMap] = useState<Record<string | number, string>>({});

  // Dynamically calculate natural page break positions incorporating 1" bottom margin and 1" top margin (192px gap)
  const [naturalPageBreaks, setNaturalPageBreaks] = useState<{ y: number; pageNum: number }[]>([]);

  useEffect(() => {
    const computeNaturalBreaks = () => {
      const editorEl = richEditorRef.current;
      if (!editorEl) return;

      const printableHeight = 930; // A4 template editor standard printable height
      const totalPaperHeight = 1122;
      const topPadding = 96; // 1.0" top margin of Page 1
      const pageMarginGap = 192; // 1.0" bottom margin + 1.0" top margin = 2.0" (192px)

      const manualBreaks = Array.from(
        editorEl.querySelectorAll<HTMLElement>('.page-break, hr.page-break, div.page-break')
      );

      const positions: { y: number; pageNum: number }[] = [];
      let currentPageCounter = 1;

      if (manualBreaks.length === 0) {
        const contentHeight = editorEl.scrollHeight;
        let y = topPadding + printableHeight;
        while (y < contentHeight) {
          currentPageCounter++;
          positions.push({ y, pageNum: currentPageCounter });
          y += totalPaperHeight;
        }
      } else {
        // Section 0: before 1st manual page break
        const firstBreakTop = manualBreaks[0].offsetTop;
        let y0 = topPadding + printableHeight;
        while (y0 < firstBreakTop) {
          currentPageCounter++;
          positions.push({ y: y0, pageNum: currentPageCounter });
          y0 += totalPaperHeight;
        }

        // Sections after manual page breaks — accounts for 1" bottom margin + 1" top margin (192px gap)
        manualBreaks.forEach((mb, idx) => {
          currentPageCounter++; // Each manual page break forces a new printed page
          const newPageContentStart = mb.offsetTop + pageMarginGap;
          const nextBreakTop = idx < manualBreaks.length - 1 ? manualBreaks[idx + 1].offsetTop : editorEl.scrollHeight;

          let ySec = newPageContentStart + printableHeight;
          while (ySec < nextBreakTop) {
            currentPageCounter++;
            positions.push({ y: ySec, pageNum: currentPageCounter });
            ySec += totalPaperHeight;
          }
        });
      }

      setNaturalPageBreaks(positions);
    };

    computeNaturalBreaks();
    const timer = setTimeout(computeNaturalBreaks, 150);
    return () => clearTimeout(timer);
  }, [templateText, editorMode, activeTab]);

  // Compute all available sections (standard + custom) for dropdowns
  const availableSections = useMemo(() => {
    const standard = [
      { key: 'court', label: 'Court & Case Header' },
      { key: 'party1', label: 'Party 1 (Applicant / Deponent / Husband)' },
      { key: 'party2', label: 'Party 2 (Respondent / Deceased / Wife)' },
      { key: 'marriage', label: 'Marriage Details' },
      { key: 'terms', label: 'Terms & Special Clauses' },
      { key: 'general', label: 'General Information' },
    ];
    const standardKeys = new Set(standard.map((s) => s.key));
    const fieldCustoms = fields.map((f) => f.group).filter((g): g is string => !!g && !standardKeys.has(g));
    const allCustoms = Array.from(new Set([...customSections, ...fieldCustoms]));
    return { standard, customs: allCustoms };
  }, [fields, customSections]);

  const handleAddCustomSection = (name?: string) => {
    const targetName = (name || newSectionInput).trim();
    if (!targetName) return;
    if (!customSections.includes(targetName)) {
      setCustomSections([...customSections, targetName]);
    }
    setNewSectionInput('');
  };

  const handleRenameSection = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || oldName === trimmed) return;
    setFields(fields.map((f) => (f.group === oldName ? { ...f, group: trimmed } : f)));
    setCustomSections(customSections.map((s) => (s === oldName ? trimmed : s)));
    setEditingSectionName(null);
  };

  const handleDeleteSection = (sectionName: string) => {
    setFields(fields.map((f) => (f.group === sectionName ? { ...f, group: 'general' } : f)));
    setCustomSections(customSections.filter((s) => s !== sectionName));
  };

  // Compute all available placeholders (standard + current custom fields + other templates custom fields)
  const allAvailablePlaceholders = useMemo(() => {
    const standardKeys = [
      'courtCity', 'courtName', 'hmpNo', 'caseYear',
      'party1Name', 'party1Age', 'party1Occupation', 'party1Address',
      'party2Name', 'party2Age', 'party2Occupation', 'party2Address',
      'marriageDate', 'marriagePlace', 'separationDate', 'separationYears',
      'childrenDetails', 'alimonyAmount', 'alimonyWords', 'effectiveDate',
      'purpose', 'termYears', 'governingLaw', 'disputeCity', 'outstandingAmount',
      'invoiceDetails', 'noticeDays', 'advocateName', 'advocateAddress'
    ];
    const currentCustomKeys = fields.map((f) => f.key).filter((k) => k && k.trim());

    const otherTemplateKeys: string[] = [];
    (allTemplates || []).forEach((t) => {
      (t.fields || []).forEach((f) => {
        if (f.key && f.key.trim()) otherTemplateKeys.push(f.key.trim());
      });
      if (t.templateText) {
        const matches = t.templateText.match(/\{([a-zA-Z0-9_\-]+)\}/g);
        if (matches) {
          matches.forEach((m) => {
            const cleanKey = m.replace(/[\{\}]/g, '').trim();
            if (cleanKey && !cleanKey.includes(' ') && !cleanKey.includes('<')) {
              otherTemplateKeys.push(cleanKey);
            }
          });
        }
      }
    });

    return Array.from(new Set([...standardKeys, ...currentCustomKeys, ...otherTemplateKeys]));
  }, [fields, allTemplates]);

  // Group placeholders into categorized sections for sidebar view
  const groupedPlaceholders = useMemo(() => {
    const categories: { title: string; items: string[] }[] = [
      {
        title: 'Court & Filing',
        items: ['courtCity', 'courtName', 'hmpNo', 'caseYear'],
      },
      {
        title: 'Party 1 (Husband / Deponent)',
        items: ['party1Prefix', 'party1Name', 'party1Age', 'party1Occupation', 'party1Address', 'deponentOldName', 'deponentNewName'],
      },
      {
        title: 'Party 2 (Wife / Opponent)',
        items: ['party2Prefix', 'party2Name', 'party2MaidenName', 'party2Age', 'party2Occupation', 'party2Guardian', 'party2Address'],
      },
      {
        title: 'Marriage & Separation',
        items: ['marriageDate', 'marriagePlace', 'separationDate', 'separationYears', 'childrenDetails', 'alimonyAmount', 'alimonyWords'],
      },
      {
        title: 'Advocates & Notices',
        items: ['advocateName', 'advocateAddress', 'advocateParty1', 'advocateParty2', 'effectiveDate', 'outstandingAmount', 'invoiceDetails', 'noticeDays'],
      },
    ];

    const knownKeys = new Set(categories.flatMap((c) => c.items));
    const currentKeys = new Set(fields.map((f) => f.key).filter(Boolean));
    const customKeys = allAvailablePlaceholders.filter((ph) => !knownKeys.has(ph));

    const currentTemplateCustoms = customKeys.filter((ph) => currentKeys.has(ph));
    const otherTemplateCustoms = customKeys.filter((ph) => !currentKeys.has(ph));

    if (currentTemplateCustoms.length > 0) {
      categories.push({
        title: 'This Template Custom Fields ★',
        items: currentTemplateCustoms,
      });
    }

    if (otherTemplateCustoms.length > 0) {
      categories.push({
        title: 'Other Templates Custom Fields 🌐',
        items: otherTemplateCustoms,
      });
    }

    return categories;
  }, [allAvailablePlaceholders, fields]);

  // Filter placeholders by sidebar search query
  const filteredPlaceholderGroups = useMemo(() => {
    if (!placeholderSearch.trim()) return groupedPlaceholders;
    const query = placeholderSearch.toLowerCase();
    return groupedPlaceholders
      .map((group) => ({
        title: group.title,
        items: group.items.filter((k) => k.toLowerCase().includes(query)),
      }))
      .filter((group) => group.items.length > 0);
  }, [groupedPlaceholders, placeholderSearch]);

  // Convert plain template text to formatted HTML for rich visual editor
  const unescapeAllEntities = (str: string): string => {
    if (!str) return '';
    let prev = '';
    let curr = str;
    let iterations = 0;
    while (curr !== prev && iterations < 3 && (curr.includes('&lt;') || curr.includes('&gt;') || curr.includes('&amp;'))) {
      prev = curr;
      curr = curr
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
      iterations++;
    }
    return curr;
  };

  const textToHtml = (rawText: string) => {
    if (!rawText) return '<p><br></p>';
    let html = unescapeAllEntities(rawText);

    // Standardize all page break markers
    html = html
      .replace(/\[page-?break\]/gi, '<div class="page-break"></div><p><br></p>')
      .replace(/<!--\s*page-?break\s*-->/gi, '<div class="page-break"></div><p><br></p>')
      .replace(/<hr[^>]*class=["'][^"']*page-break[^"']*["'][^>]*\/?>/gi, '<div class="page-break"></div><p><br></p>')
      .replace(/<hr[^>]*style=["'][^"']*page-break[^"']*["'][^>]*\/?>/gi, '<div class="page-break"></div><p><br></p>');

    if (html.includes('<p') || html.includes('<div') || html.includes('<b') || html.includes('<u') || html.includes('<center>')) {
      return html
        .replace(/<center>([\s\S]*?)<\/center>/gi, '<div style="text-align: center;">$1</div>')
        .replace(/<p align=["']center["']>([\s\S]*?)<\/p>/gi, '<div style="text-align: center;">$1</div>')
        .replace(/<p align=["']right["']>([\s\S]*?)<\/p>/gi, '<div style="text-align: right;">$1</div>')
        .replace(/<p align=["']left["']>([\s\S]*?)<\/p>/gi, '<div style="text-align: left;">$1</div>')
        .replace(/<p align=["']justify["']>([\s\S]*?)<\/p>/gi, '<div style="text-align: justify;">$1</div>');
    }
    return html
      .split('\n')
      .map((line) => (line.trim() ? `<p>${line}</p>` : '<p><br></p>'))
      .join('');
  };

  // Populate contenteditable on mode change or template load
  useEffect(() => {
    if (editorMode === 'visual' && richEditorRef.current) {
      const html = textToHtml(templateText);
      richEditorRef.current.innerHTML = html;
    }
  }, [editorMode, isOpen, activeTab]);

  // Insert placeholder at exact cursor position (works in both Visual Rich Editor & Code View)
  const insertPlaceholderAtCursor = (phKey: string) => {
    const insertText = `{${phKey}}`;
    if (editorMode === 'visual' && richEditorRef.current) {
      richEditorRef.current.focus();
      document.execCommand('insertText', false, insertText);
      setTemplateText(richEditorRef.current.innerHTML);
    } else {
      const textarea = bodyTextAreaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentVal = templateText;
        const newVal = currentVal.substring(0, start) + insertText + currentVal.substring(end);
        setTemplateText(newVal);

        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + insertText.length, start + insertText.length);
        }, 0);
      } else {
        setTemplateText((prev) => `${prev} ${insertText}`);
      }
    }
  };

  // Clean all raw HTML alignment & formatting tags from entire document
  const cleanAllRawTags = () => {
    const cleaned = templateText
      .replace(/<\/?center>/gi, '')
      .replace(/<p align=["'][^"']+["']>/gi, '')
      .replace(/<\/p>/gi, '')
      .replace(/<\/?b>/gi, '')
      .replace(/<\/?u>/gi, '')
      .replace(/<\/?i>/gi, '')
      .replace(/<\/?strong>/gi, '')
      .replace(/<\/?ins>/gi, '')
      .replace(/<[^>]+>/g, '');
    setTemplateText(cleaned);
    if (richEditorRef.current) {
      richEditorRef.current.innerHTML = cleaned.replace(/\n/g, '<br/>');
    }
  };

  const [copiedFormat, setCopiedFormat] = useState<{
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    fontSize?: string;
    fontFamily?: string;
    lineHeight?: string;
    alignment?: string;
  } | null>(null);
  const [isFormatSticky, setIsFormatSticky] = useState<boolean>(false);

  // Pressing Escape cancels Format Painter mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && copiedFormat) {
        setCopiedFormat(null);
        setIsFormatSticky(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copiedFormat]);

  // Apply formatting to selection (supports visual contentEditable execCommand & code view textarea fallback)
  const handleExecCommand = (command: string, value: string = '', prefix: string = '', suffix: string = '') => {
    if (editorMode === 'visual' && richEditorRef.current) {
      richEditorRef.current.focus();
      if (command === 'align') {
        if (value === 'center') document.execCommand('justifyCenter');
        else if (value === 'right') document.execCommand('justifyRight');
        else if (value === 'left') document.execCommand('justifyLeft');
        else if (value === 'justify') document.execCommand('justifyFull');
      } else if (command === 'bold') {
        document.execCommand('bold');
      } else if (command === 'italic') {
        document.execCommand('italic');
      } else if (command === 'underline') {
        document.execCommand('underline');
      } else if (command === 'strikethrough') {
        document.execCommand('strikeThrough');
      } else if (command === 'bullet') {
        document.execCommand('insertUnorderedList');
      } else if (command === 'numbered') {
        document.execCommand('insertOrderedList');
      } else if (command === 'quote') {
        document.execCommand('formatBlock', false, 'blockquote');
      } else if (command === 'fontName') {
        document.execCommand('fontName', false, value);
      } else if (command === 'fontSizePt') {
        const pt = parseFloat(value);
        if (!isNaN(pt) && pt > 0) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
            // Use execCommand fontSize as a marker (size 7 = unique), then swap with exact pt span
            document.execCommand('fontSize', false, '7');
            const editor = richEditorRef.current;
            if (editor) {
              const fontEls = editor.querySelectorAll('font[size="7"]');
              fontEls.forEach((el) => {
                const span = document.createElement('span');
                span.style.fontSize = `${pt}pt`;
                span.innerHTML = el.innerHTML;
                el.parentNode?.replaceChild(span, el);
              });
            }
          } else {
            const parent = sel?.anchorNode?.parentElement?.closest('p, div, span, h1, h2, h3, td, th');
            if (parent) (parent as HTMLElement).style.fontSize = `${pt}pt`;
          }
        }
      } else if (command === 'formatBlock') {
        document.execCommand('formatBlock', false, value);
      } else if (command === 'increaseFontSize' || command === 'decreaseFontSize') {
        const delta = command === 'increaseFontSize' ? 1 : -1;
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const parent = sel.anchorNode?.parentElement;
          let currentSize = 12;
          if (parent) {
            const comp = window.getComputedStyle(parent).fontSize;
            if (comp && comp.endsWith('px')) {
              currentSize = Math.round(parseFloat(comp) * 0.75);
            } else if (comp && comp.endsWith('pt')) {
              currentSize = Math.round(parseFloat(comp));
            }
          }
          const newSize = Math.max(6, Math.min(96, currentSize + delta));
          if (!sel.isCollapsed) {
            const span = document.createElement('span');
            span.style.fontSize = `${newSize}pt`;
            try {
              const range = sel.getRangeAt(0);
              range.surroundContents(span);
            } catch {
              const target = sel.anchorNode?.parentElement?.closest('p, div, span, h1, h2, h3');
              if (target) (target as HTMLElement).style.fontSize = `${newSize}pt`;
            }
          } else {
            const target = parent?.closest('p, div, span, h1, h2, h3, td, th');
            if (target) (target as HTMLElement).style.fontSize = `${newSize}pt`;
          }
        }
      } else if (command === 'indent') {
        document.execCommand('indent');
      } else if (command === 'outdent') {
        document.execCommand('outdent');
      } else if (command === 'lineSpacing') {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const container = richEditorRef.current;
          const range = sel.getRangeAt(0);
          const blocks = container
            ? Array.from(container.querySelectorAll('p, div, h1, h2, h3, blockquote, li, td, th'))
            : [];
          const selectedBlocks = blocks.filter((b) => range.intersectsNode(b));
          if (selectedBlocks.length > 0) {
            selectedBlocks.forEach((b) => {
              (b as HTMLElement).style.lineHeight = value;
            });
          } else {
            const block = sel.anchorNode?.parentElement?.closest('p, div, h1, h2, h3, blockquote, td, th');
            if (block) {
              (block as HTMLElement).style.lineHeight = value;
            } else {
              document.execCommand('formatBlock', false, 'p');
              const newBlock = sel.anchorNode?.parentElement?.closest('p, div');
              if (newBlock) (newBlock as HTMLElement).style.lineHeight = value;
            }
          }
        }
      } else if (command === 'insertTable') {
        const tableHtml = `<table style="width: 100%; border-collapse: collapse; margin: 12px 0;"><thead><tr><th style="border: 1px solid #000; padding: 6px; background-color: #f1f5f9; text-align: center;">अ. क्र.</th><th style="border: 1px solid #000; padding: 6px; background-color: #f1f5f9; text-align: center;">तपशील / विवरण</th><th style="border: 1px solid #000; padding: 6px; background-color: #f1f5f9; text-align: center;">रक्कम / नोंद</th></tr></thead><tbody><tr><td style="border: 1px solid #000; padding: 6px; text-align: center;">१</td><td style="border: 1px solid #000; padding: 6px;">-</td><td style="border: 1px solid #000; padding: 6px; text-align: center;">-</td></tr><tr><td style="border: 1px solid #000; padding: 6px; text-align: center;">२</td><td style="border: 1px solid #000; padding: 6px;">-</td><td style="border: 1px solid #000; padding: 6px; text-align: center;">-</td></tr></tbody></table><p><br></p>`;
        document.execCommand('insertHTML', false, tableHtml);
      } else if (command === 'insertClause') {
        document.execCommand('insertText', false, value);
      } else if (command === 'insertPageBreak') {
        const pbHtml = '<div class="page-break" style="page-break-after:always;break-after:page;"></div><p><br></p>';
        document.execCommand('insertHTML', false, pbHtml);
      } else if (command === 'copyFormat') {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const parent = sel.anchorNode?.parentElement;
          if (parent) {
            const comp = window.getComputedStyle(parent);
            setCopiedFormat({
              bold: document.queryCommandState('bold'),
              italic: document.queryCommandState('italic'),
              underline: document.queryCommandState('underline'),
              fontSize: comp.fontSize ? `${Math.round(parseFloat(comp.fontSize) * 0.75)}pt` : undefined,
              fontFamily: comp.fontFamily || undefined,
              lineHeight: comp.lineHeight || undefined,
              alignment: comp.textAlign || undefined,
            });
            setIsFormatSticky(value === 'sticky');
          }
        }
      } else if (command === 'applyFormat') {
        if (copiedFormat) {
          const sel = window.getSelection();
          const container = richEditorRef.current;

          if (copiedFormat.bold !== undefined && document.queryCommandState('bold') !== copiedFormat.bold) {
            document.execCommand('bold');
          }
          if (copiedFormat.italic !== undefined && document.queryCommandState('italic') !== copiedFormat.italic) {
            document.execCommand('italic');
          }
          if (copiedFormat.underline !== undefined && document.queryCommandState('underline') !== copiedFormat.underline) {
            document.execCommand('underline');
          }
          if (copiedFormat.fontSize) {
            const pt = parseFloat(copiedFormat.fontSize);
            if (!isNaN(pt)) {
              if (sel && sel.rangeCount > 0 && !sel.isCollapsed && container) {
                const range = sel.getRangeAt(0);
                const blocks = Array.from(container.querySelectorAll('p, div, span, h1, h2, h3, td, th'));
                const selectedBlocks = blocks.filter((b) => range.intersectsNode(b));
                if (selectedBlocks.length > 0) {
                  selectedBlocks.forEach((b) => ((b as HTMLElement).style.fontSize = `${pt}pt`));
                } else {
                  const target = sel.anchorNode?.parentElement?.closest('p, div, span, h1, h2, h3, td, th');
                  if (target) (target as HTMLElement).style.fontSize = `${pt}pt`;
                }
              }
            }
          }
          if (copiedFormat.fontFamily) {
            document.execCommand('fontName', false, copiedFormat.fontFamily);
          }
          if (copiedFormat.lineHeight) {
            if (sel && sel.rangeCount > 0 && container) {
              const range = sel.getRangeAt(0);
              const blocks = Array.from(container.querySelectorAll('p, div, h1, h2, h3, blockquote, li, td, th'));
              const selectedBlocks = blocks.filter((b) => range.intersectsNode(b));
              if (selectedBlocks.length > 0) {
                selectedBlocks.forEach((b) => ((b as HTMLElement).style.lineHeight = copiedFormat.lineHeight!));
              } else {
                const target = sel.anchorNode?.parentElement?.closest('p, div, h1, h2, h3, blockquote, td, th');
                if (target) (target as HTMLElement).style.lineHeight = copiedFormat.lineHeight;
              }
            }
          }
          if (copiedFormat.alignment) {
            if (copiedFormat.alignment === 'center') document.execCommand('justifyCenter');
            else if (copiedFormat.alignment === 'right') document.execCommand('justifyRight');
            else if (copiedFormat.alignment === 'left') document.execCommand('justifyLeft');
            else if (copiedFormat.alignment === 'justify') document.execCommand('justifyFull');
          }
          if (!isFormatSticky) {
            setCopiedFormat(null);
            setIsFormatSticky(false);
          }
        }
      }
      setTemplateText(richEditorRef.current.innerHTML);
    } else {
      if (command === 'insertPageBreak') {
        // Insert page-break marker in code view at cursor position
        const pbTag = '\n<div class="page-break" style="page-break-after:always;"></div>\n';
        const textarea = bodyTextAreaRef.current;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const newVal = templateText.substring(0, start) + pbTag + templateText.substring(end);
          setTemplateText(newVal);
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + pbTag.length, start + pbTag.length);
          }, 0);
        } else {
          setTemplateText((prev) => `${prev}${pbTag}`);
        }
      } else {
        applyFormattingToSelection(prefix, suffix);
      }
    }
  };

  // Legacy formatting fallback for Code View textarea
  const applyFormattingToSelection = (prefix: string, suffix: string = '') => {
    const textarea = bodyTextAreaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      let selectedText = templateText.substring(start, end);

      if (prefix.includes('<center>') || prefix.includes('align=')) {
        selectedText = selectedText
          .replace(/<\/?center>/gi, '')
          .replace(/<p align=["'][^"']+["']>/gi, '')
          .replace(/<\/p>/gi, '')
          .trim();
      }

      const replacement = selectedText ? `${prefix}${selectedText}${suffix}` : `${prefix}${suffix}`;
      const newVal = templateText.substring(0, start) + replacement + templateText.substring(end);
      setTemplateText(newVal);

      setTimeout(() => {
        textarea.focus();
        const newCursorPos = selectedText ? start + replacement.length : start + prefix.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    } else {
      setTemplateText((prev) => `${prev}${prefix}${suffix}`);
    }
  };

  // Convert field property to Devanagari Marathi
  const handleTransliterateProp = async (
    idx: number | null,
    propName: string,
    currentText: string,
    onSuccess?: (converted: string) => void
  ) => {
    if (!currentText || !currentText.trim()) return;
    const keyId = idx !== null ? `${idx}-${propName}` : propName;
    setTransliteratingKey(keyId);
    try {
      const result = await convertToDevanagari(currentText);
      if (result) {
        if (onSuccess) {
          onSuccess(result);
        } else if (idx !== null) {
          const next = [...fields];
          next[idx] = { ...next[idx], [propName]: result };
          setFields(next);
        }
      }
    } catch (e) {
      console.error('Transliterate error:', e);
    } finally {
      setTransliteratingKey(null);
    }
  };

  // Sync form state whenever initialTemplate or isOpen changes
  useEffect(() => {
    if (isOpen) {
      setId(initialTemplate?.id || '');
      setTitle(initialTemplate?.title || '');
      setTitleMr(initialTemplate?.titleMr || '');
      setCategory(initialTemplate?.category || 'general');
      setLanguage(initialTemplate?.language || 'mr');
      setDescription(initialTemplate?.description || '');
      setDescriptionMr(initialTemplate?.descriptionMr || '');
      setCourtApplicable(initialTemplate?.courtApplicable ?? true);
      setDefaultCourt(initialTemplate?.defaultCourt || 'मे. दिवाणी न्यायाधीश वरिष्ठ स्तर, अमळनेर');
      setTemplateText(initialTemplate?.templateText || '');
      setStatutoryRequirements(initialTemplate?.statutoryRequirements || []);
      setFields(initialTemplate?.fields || []);
      setNewStatRequirement('');
      setError(null);
      setActiveTab('basic');
    }
  }, [isOpen, initialTemplate]);

  if (!isOpen) return null;

  const handleAddField = () => {
    const newField: FieldDefinition = {
      key: `field_${Date.now()}`,
      label: 'New Field',
      labelMr: 'नवीन क्षेत्र',
      type: 'text',
      required: false,
      group: 'terms',
      defaultValue: '',
    };
    setFields([...fields, newField]);
  };

  const handleUpdateField = (index: number, updated: FieldDefinition) => {
    const next = [...fields];
    next[index] = updated;
    setFields(next);
  };

  const handleRemoveField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleAddStatRequirement = () => {
    if (!newStatRequirement.trim()) return;
    setStatutoryRequirements([...statutoryRequirements, newStatRequirement.trim()]);
    setNewStatRequirement('');
  };

  const handleRemoveStatRequirement = (index: number) => {
    setStatutoryRequirements(statutoryRequirements.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim()) {
      setError('Template Identifier (ID) is required.');
      setActiveTab('basic');
      return;
    }
    if (!title.trim()) {
      setError('Template Title is required.');
      setActiveTab('basic');
      return;
    }
    const bodyContent = editorMode === 'visual' && richEditorRef.current
      ? richEditorRef.current.innerHTML
      : templateText;

    if (!bodyContent.trim()) {
      setError('Template Draft Text is required.');
      setActiveTab('body');
      return;
    }

    // Standardize slug ID
    const cleanId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');

    setError(null);
    setIsSaving(true);
    try {
      await onSave({
        id: cleanId,
        title: title.trim(),
        titleMr: titleMr.trim() || undefined,
        category,
        language,
        description: description.trim(),
        descriptionMr: descriptionMr.trim() || undefined,
        courtApplicable,
        defaultCourt: courtApplicable ? defaultCourt.trim() : undefined,
        statutoryRequirements,
        fields,
        standardClauses: initialTemplate?.standardClauses || [],
        templateText: bodyContent.trim(),
        isBuiltIn: false,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all overflow-hidden ${isMaximized ? 'p-0' : 'p-4'}`}>
      <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl overflow-hidden transition-all text-slate-900 dark:text-white ${
        isMaximized
          ? 'w-screen h-screen max-w-none max-h-none rounded-none border-none'
          : 'w-full max-w-6xl h-[90vh] rounded-2xl'
      }`}>
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-200 dark:border-indigo-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                {isEditing ? `Edit Template: ${initialTemplate.title}` : 'Create New Legal Template'}
                {isMaximized && (
                  <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-700/60 font-normal">
                    Full Window View
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEditing ? 'Modify template text, statutory rules, and form fields' : 'Design custom legal draft, automated fields, and statutory rules'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="file"
              ref={editorFileInputRef}
              accept=".json"
              onChange={handleImportJSON}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => editorFileInputRef.current?.click()}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Import Template JSON (Automatically creates Form Input Fields)"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Import JSON
            </button>
            <button
              type="button"
              onClick={handleExportJSON}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Export Template JSON file"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Export JSON
            </button>

            {/* Maximize / Restore Toggle */}
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition"
              title={isMaximized ? 'Restore Normal Window' : 'Maximize Full Window'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Pop-out / Full Screen Editor */}
            <button
              type="button"
              onClick={() => {
                setIsMaximized(true);
                setActiveTab('body');
              }}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition"
              title="Expand Pop-out Editor (Full Window)"
            >
              <ExternalLink className="w-4 h-4" />
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex gap-4 text-xs font-semibold shrink-0">
          <button
            onClick={() => setActiveTab('basic')}
            className={`py-3 border-b-2 flex items-center gap-2 transition ${
              activeTab === 'basic'
                ? 'border-indigo-600 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Settings className="w-4 h-4" />
            1. Basic Metadata
          </button>
          <button
            onClick={() => setActiveTab('body')}
            className={`py-3 border-b-2 flex items-center gap-2 transition ${
              activeTab === 'body'
                ? 'border-indigo-600 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Code className="w-4 h-4" />
            2. Template Draft Body
          </button>
          <button
            onClick={() => setActiveTab('fields')}
            className={`py-3 border-b-2 flex items-center gap-2 transition ${
              activeTab === 'fields'
                ? 'border-indigo-600 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            3. Client Form Fields ({fields.length})
          </button>
        </div>

        {/* Form Error Banner */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Modal Body / Tab Contents */}
        <div className={`p-6 flex-1 min-h-0 ${activeTab === 'body' ? 'flex flex-col overflow-hidden space-y-3' : 'overflow-y-auto space-y-6'}`}>
          {/* TAB 1: BASIC METADATA */}
          {activeTab === 'basic' && (
            <div className="space-y-5 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                    Template Identifier ID <span className="text-red-500 dark:text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={isEditing}
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    placeholder="e.g. rent-agreement-mr or bail-application-mr"
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 font-mono text-xs placeholder-slate-400 dark:placeholder-slate-500"
                  />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Unique slug. Lowercase letters, numbers, and hyphens.</p>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                    Category <span className="text-red-500 dark:text-red-400">*</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="family">Family Court (कौटुंबिक/विवाह)</option>
                    <option value="commercial">Commercial / Agreements (कराराचे कागदपत्र)</option>
                    <option value="litigation">Litigation & Civil (दावे व अर्ज)</option>
                    <option value="notices">Legal Notices (कायदेशीर नोटीस)</option>
                    <option value="general">General Affidavits & Misc (प्रतिज्ञापत्र व इतर)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                    Title (English) <span className="text-red-500 dark:text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Leave and License Agreement"
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-700 dark:text-slate-300 font-medium">Title (Marathi / देवनागरी)</label>
                    <button
                      type="button"
                      onClick={() => handleTransliterateProp(null, 'titleMr', titleMr || title, (res) => setTitleMr(res))}
                      disabled={transliteratingKey === 'titleMr' || (!titleMr && !title)}
                      className="text-[10px] px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 rounded font-bold font-marathi shadow-sm transition"
                      title="Convert English Title to Marathi Devanagari"
                    >
                      {transliteratingKey === 'titleMr' ? '...' : 'म'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={titleMr}
                    onChange={(e) => setTitleMr(e.target.value)}
                    placeholder="उदा. भाडेकरार / रजा व परवाना करार"
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-marathi"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as TemplateLanguage)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="mr">Marathi (मराठी)</option>
                    <option value="en">English</option>
                    <option value="bilingual">Bilingual (द्विभाषिक)</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    id="courtApplicable"
                    checked={courtApplicable}
                    onChange={(e) => setCourtApplicable(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="courtApplicable" className="text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                    Requires Court Header (न्यायालयीन अर्ज आहे)
                  </label>
                </div>
              </div>

              {courtApplicable && (
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Default Court Designation</label>
                  <input
                    type="text"
                    value={defaultCourt}
                    onChange={(e) => setDefaultCourt(e.target.value)}
                    placeholder="उदा. मे. दिवाणी न्यायाधीश वरिष्ठ स्तर, अमळनेर"
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Description (English)</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short explanation of when to use this template"
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-700 dark:text-slate-300 font-medium">Description (Marathi)</label>
                  <button
                    type="button"
                    onClick={() => handleTransliterateProp(null, 'descriptionMr', descriptionMr || description, (res) => setDescriptionMr(res))}
                    disabled={transliteratingKey === 'descriptionMr' || (!descriptionMr && !description)}
                    className="text-[10px] px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 rounded font-bold font-marathi shadow-sm transition"
                    title="Convert Description to Marathi Devanagari"
                  >
                    {transliteratingKey === 'descriptionMr' ? '...' : 'म'}
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={descriptionMr}
                  onChange={(e) => setDescriptionMr(e.target.value)}
                  placeholder="सदर टेम्पलेट वापरण्याबाबत सविस्तर माहिती..."
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-marathi"
                />
              </div>

              {/* Statutory Requirements Audit Checklist */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50 dark:bg-slate-950/40">
                <label className="block text-slate-800 dark:text-slate-300 font-semibold mb-2">
                  Statutory & Compliance Rules Checklist (AI Legal Audit)
                </label>
                <div className="space-y-2 mb-3">
                  {statutoryRequirements.map((req, index) => (
                    <div key={index} className="flex items-center justify-between bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                      <span className="text-slate-800 dark:text-slate-300 text-xs">✓ {req}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveStatRequirement(index)}
                        className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newStatRequirement}
                    onChange={(e) => setNewStatRequirement(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddStatRequirement();
                      }
                    }}
                    placeholder="Add mandatory statutory rule (e.g. Minimum 1 year separation required)..."
                    className="flex-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-1.5 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddStatRequirement}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-lg text-xs font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Rule
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TEMPLATE BODY */}
          {activeTab === 'body' && (
            <div className="flex-1 flex flex-col space-y-3 text-xs min-h-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    Legal Document Body Text Editor
                    {editorMode === 'visual' ? (
                      <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-700/60 font-semibold flex items-center gap-1">
                        <Eye className="w-3 h-3" /> Rich Text Visual Mode
                      </span>
                    ) : (
                      <span className="text-[10px] bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-700/60 font-semibold flex items-center gap-1">
                        <Code className="w-3 h-3" /> Code View (Tags Mode)
                      </span>
                    )}
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                    {editorMode === 'visual'
                      ? 'Format text visually without raw HTML tags. Text alignment and styling display live as formatted.'
                      : 'Edit raw template code and HTML tags directly.'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Mode Switcher */}
                  <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        if (editorMode === 'code' && richEditorRef.current) {
                          richEditorRef.current.innerHTML = textToHtml(templateText);
                        }
                        setEditorMode('visual');
                      }}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition flex items-center gap-1.5 ${
                        editorMode === 'visual'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Visual Rich Text
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (editorMode === 'visual' && richEditorRef.current) {
                          setTemplateText(richEditorRef.current.innerHTML);
                        }
                        setEditorMode('code');
                      }}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition flex items-center gap-1.5 ${
                        editorMode === 'code'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <Code className="w-3.5 h-3.5" />
                      Code View (Tags)
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen((prev) => !prev)}
                    className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                  >
                    <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    {isSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
                  </button>
                </div>
              </div>

              {/* Split View Container */}
              <div className="flex-1 flex gap-3 min-h-0 h-full overflow-hidden">
                {/* Main Text Editor + MS Word Ribbon Toolbar */}
                <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full">
                  {/* Format Ribbon Toolbar */}
                  <div className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-t-xl p-2 flex flex-wrap items-center gap-1.5 z-10 relative shrink-0">
                    {/* Style / Heading Selector */}
                    <div className="pr-2 border-r border-slate-300 dark:border-slate-800">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleExecCommand('quote', '', e.target.value);
                            e.target.value = '';
                          }
                        }}
                        className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                        defaultValue=""
                      >
                        <option value="" disabled>Text Style / Heading</option>
                        <option value="### ">Heading 1 (###)</option>
                        <option value="#### ">Heading 2 (####)</option>
                        <option value="##### ">Heading 3 (#####)</option>
                        <option value="> ">Blockquote (&gt;)</option>
                      </select>
                    </div>

                    {/* Font & Style Controls */}
                    <div className="flex items-center gap-1 px-2 border-r border-slate-300 dark:border-slate-800 flex-wrap">
                      {/* Block Style */}
                      <select
                        onChange={(e) => handleExecCommand('formatBlock', e.target.value)}
                        className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-[11px] rounded border border-slate-300 dark:border-slate-700 px-1.5 py-1 focus:outline-none focus:border-indigo-500"
                        title="Style / Heading"
                        defaultValue="p"
                      >
                        <option value="p">Normal (p)</option>
                        <option value="h1">Heading 1</option>
                        <option value="h2">Heading 2</option>
                        <option value="h3">Heading 3</option>
                      </select>

                      {/* Font Family */}
                      <select
                        onChange={(e) => handleExecCommand('fontName', e.target.value)}
                        className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-[11px] rounded border border-slate-300 dark:border-slate-700 px-1.5 py-1 focus:outline-none focus:border-indigo-500 max-w-[105px]"
                        title="Font Family"
                        defaultValue="Mangal"
                      >
                        <option value="Mangal">Mangal</option>
                        <option value="Mukta">Mukta</option>
                        <option value="Times New Roman">Times New</option>
                        <option value="Arial">Arial</option>
                        <option value="Merriweather">Merriweather</option>
                        <option value="Courier New">Monospace</option>
                      </select>

                      {/* Manual Font Size Input in pt */}
                      {/* Font Size Dropdown */}
                      <select
                        title="Font Size"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleExecCommand('fontSizePt', e.target.value);
                          }
                        }}
                        className="h-[26px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                      >
                        <option value="" disabled>Size</option>
                        <option value="8">8 pt</option>
                        <option value="9">9 pt</option>
                        <option value="10">10 pt</option>
                        <option value="11">11 pt</option>
                        <option value="12">12 pt</option>
                        <option value="13">13 pt</option>
                        <option value="14">14 pt</option>
                        <option value="16">16 pt</option>
                        <option value="18">18 pt</option>
                        <option value="20">20 pt</option>
                        <option value="22">22 pt</option>
                        <option value="24">24 pt</option>
                        <option value="28">28 pt</option>
                        <option value="32">32 pt</option>
                        <option value="36">36 pt</option>
                        <option value="48">48 pt</option>
                        <option value="72">72 pt</option>
                      </select>

                      {/* Font Size Increase / Decrease buttons */}
                      <button
                        type="button"
                        onClick={() => handleExecCommand('increaseFontSize')}
                        className="px-1.5 py-0.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-200 hover:bg-slate-300 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded transition"
                        title="Increase Font Size +1pt (A+)"
                      >
                        A+
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExecCommand('decreaseFontSize')}
                        className="px-1.5 py-0.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-200 hover:bg-slate-300 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded transition"
                        title="Decrease Font Size -1pt (A-)"
                      >
                        A-
                      </button>
                    </div>

                    {/* Text Formatting */}
                    <div className="flex items-center gap-0.5 px-2 border-r border-slate-300 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleExecCommand('bold', '', '<b>', '</b>')}
                        className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition font-bold"
                        title="Bold"
                      >
                        <Bold className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExecCommand('italic', '', '<i>', '</i>')}
                        className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition italic"
                        title="Italic"
                      >
                        <Italic className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExecCommand('underline', '', '<u>', '</u>')}
                        className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition underline"
                        title="Underline"
                      >
                        <Underline className="w-4 h-4" />
                      </button>
                      {/* Format Painter */}
                      <button
                        type="button"
                        onClick={() => {
                          if (copiedFormat) {
                            const selStr = window.getSelection()?.toString().trim();
                            if (selStr && selStr.length > 0) {
                              handleExecCommand('applyFormat');
                            } else {
                              setCopiedFormat(null);
                              setIsFormatSticky(false);
                            }
                          } else {
                            handleExecCommand('copyFormat', 'single');
                          }
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          handleExecCommand('copyFormat', 'sticky');
                        }}
                        className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-medium transition cursor-pointer select-none ${
                          copiedFormat
                            ? isFormatSticky
                              ? 'bg-amber-400 text-black font-extrabold ring-2 ring-amber-200 shadow-md'
                              : 'bg-amber-500 text-black font-bold ring-2 ring-amber-300 animate-pulse'
                            : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-700'
                        }`}
                        title={
                          copiedFormat
                            ? isFormatSticky
                              ? 'Sticky Format Painter Active! Select text anywhere to format continuously. Click or press Esc to exit.'
                              : 'Click to Apply Format. Double-click Format Painter button to lock sticky for multiple applies.'
                            : 'Format Painter: Single click to copy & apply once. Double-click to lock sticky for multiple applies.'
                        }
                      >
                        <Paintbrush className={`w-3.5 h-3.5 ${copiedFormat ? 'text-slate-950 font-bold' : 'text-amber-500 dark:text-amber-400'}`} />
                        <span>
                          {copiedFormat
                            ? isFormatSticky
                              ? 'Sticky Painter 📌'
                              : 'Apply Format'
                            : 'Format Painter'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExecCommand('strikethrough', '', '~~', '~~')}
                        className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                        title="Strikethrough"
                      >
                        <Strikethrough className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Alignment */}
                    <div className="flex items-center gap-0.5 px-2 border-r border-slate-300 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleExecCommand('align', 'left', '<p align="left">', '</p>')}
                        className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                        title="Align Left"
                      >
                        <AlignLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExecCommand('align', 'center', '<center>', '</center>')}
                        className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                        title="Align Center"
                      >
                        <AlignCenter className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExecCommand('align', 'right', '<p align="right">', '</p>')}
                        className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                        title="Align Right"
                      >
                        <AlignRight className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExecCommand('align', 'justify', '<p align="justify">', '</p>')}
                        className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                        title="Align Justify"
                      >
                        <AlignJustify className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Structure & Lists */}
                    <div className="flex items-center gap-0.5 px-2 border-r border-slate-300 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleExecCommand('bullet', '', '- ')}
                        className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                        title="Bullet List"
                      >
                        <List className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExecCommand('numbered', '', '१. ')}
                        className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                        title="Numbered List"
                      >
                        <ListOrdered className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExecCommand('quote', '', '> ')}
                        className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                        title="Blockquote"
                      >
                        <Quote className="w-4 h-4" />
                      </button>
                      {/* Manual Line Spacing Input */}
                      <div className="flex items-center gap-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5" title="Type exact Line Spacing (e.g. 1.0, 1.2, 1.5, 1.6, 2.0)">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Line:</span>
                        <input
                          type="number"
                          min="0.5"
                          max="5.0"
                          step="0.1"
                          defaultValue="1.6"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleExecCommand('lineSpacing', (e.target as HTMLInputElement).value);
                            }
                          }}
                          onBlur={(e) => handleExecCommand('lineSpacing', e.target.value)}
                          className="w-10 bg-transparent text-slate-900 dark:text-slate-200 text-xs font-semibold focus:outline-none text-center"
                        />
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">x</span>
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              const input = e.target.previousElementSibling?.previousElementSibling as HTMLInputElement;
                              if (input) input.value = e.target.value;
                              handleExecCommand('lineSpacing', e.target.value);
                            }
                          }}
                          className="bg-transparent text-slate-600 dark:text-slate-400 text-[10px] focus:outline-none cursor-pointer border-l border-slate-300 dark:border-slate-700 pl-1"
                          defaultValue=""
                        >
                          <option value="" disabled>▾</option>
                          <option value="1.0">1.0x (Single)</option>
                          <option value="1.15">1.15x</option>
                          <option value="1.5">1.5x</option>
                          <option value="1.6">1.6x (Court Standard)</option>
                          <option value="2.0">2.0x (Double)</option>
                        </select>
                      </div>

                      {/* Increase / Decrease Indent */}
                      <button
                        type="button"
                        onClick={() => handleExecCommand('outdent')}
                        className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                        title="Decrease Indent / Outdent Left"
                      >
                        <Outdent className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExecCommand('indent')}
                        className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                        title="Increase Indent / Tab Right"
                      >
                        <Indent className="w-4 h-4" />
                      </button>

                      {/* Insert Table */}
                      <button
                        type="button"
                        onClick={() => handleExecCommand('insertTable')}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/80 dark:hover:bg-emerald-900 border border-emerald-200 dark:border-emerald-700/60 rounded-md transition"
                        title="Insert Legal Table into Document"
                      >
                        <Table className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        Table
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExecCommand('hr', '', '\n---\n')}
                        className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                        title="Horizontal Rule Line"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      {/* Page Break Button */}
                      <button
                        type="button"
                        onClick={() => handleExecCommand('insertPageBreak')}
                        className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-700/60 rounded-md transition ml-0.5"
                        title="Insert Page Break — Forces new page in Screen Preview, Print & Word Export"
                      >
                        <Scissors className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        Page Break
                      </button>
                    </div>

                    {/* Legal Document Quick Shortcuts */}
                    <div className="flex items-center gap-1 pl-1.5">
                      <button
                        type="button"
                        onClick={() => handleExecCommand('insertClause', ' (१) ', ' (१) ')}
                        className="px-2 py-0.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-700/60 rounded-md transition"
                        title="Insert Clause (१)"
                      >
                        (१)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExecCommand('insertClause', ' (अ) ', ' (अ) ')}
                        className="px-2 py-0.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-700/60 rounded-md transition"
                        title="Insert Subclause (अ)"
                      >
                        (अ)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExecCommand('insertClause', '\n\nसत्यप्रतिज्ञेवर कथन :- \n', '\n\nसत्यप्रतिज्ञेवर कथन :- \n')}
                        className="px-2 py-0.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-700/60 rounded-md transition font-marathi"
                        title="Insert Verification Clause Header"
                      >
                        सत्यप्रतिज्ञा
                      </button>
                      <button
                        type="button"
                        onClick={cleanAllRawTags}
                        className="px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/80 dark:hover:bg-amber-900 border border-amber-200 dark:border-amber-800/60 rounded-md transition flex items-center gap-1 ml-1"
                        title="Clean raw HTML tags (e.g. remove <center> tags)"
                      >
                        Clean Raw Tags
                      </button>
                      <button
                        type="button"
                        onClick={handleGenerateVariablesFromText}
                        className="px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/80 dark:hover:bg-emerald-900 border border-emerald-300 dark:border-emerald-700/80 rounded-md transition flex items-center gap-1 ml-1 shadow-sm"
                        title="Scan template text for {variableName} placeholders and automatically create missing form input fields"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        Generate Variables
                      </button>
                    </div>
                  </div>

                  {/* Body Editor (Visual Rich Text vs Code View Textarea) */}
                  {editorMode === 'visual' ? (
                    <div className="w-full flex-1 bg-slate-200/80 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-b-xl rounded-t-none p-4 md:p-6 overflow-y-auto flex flex-col items-center min-h-0">
                      <div className="w-full max-w-3xl relative shrink-0">
                        <div
                          ref={richEditorRef}
                          contentEditable
                          suppressContentEditableWarning
                          onMouseUp={() => {
                            if (isFormatSticky && copiedFormat) {
                              const selStr = window.getSelection()?.toString().trim();
                              if (selStr && selStr.length > 0) {
                                handleExecCommand('applyFormat');
                              }
                            }
                          }}
                          onInput={() => {
                            if (richEditorRef.current) {
                              setTemplateText(richEditorRef.current.innerHTML);
                            }
                          }}
                          onBlur={() => {
                            if (richEditorRef.current) {
                              setTemplateText(richEditorRef.current.innerHTML);
                            }
                          }}
                          className="w-full document-page paper-a4 rounded-xl border border-slate-300/40 relative bg-white text-slate-900 font-marathi text-sm md:text-base leading-relaxed selection:bg-indigo-100 shadow-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 p-0 overflow-visible shrink-0"
                          style={{ minHeight: isMaximized ? '850px' : '550px' }}
                        />

                        {/* Dynamic Natural Page Break Indicators (simple dashed line) */}
                        {editorMode === 'visual' && naturalPageBreaks.map((nb, idx) => (
                          <div
                            key={`nat-break-${idx}`}
                            className="no-print natural-page-indicator"
                            style={{ top: `${nb.y}px` }}
                          >
                            <div className="natural-page-line" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <textarea
                      ref={bodyTextAreaRef}
                      rows={isMaximized ? 28 : 20}
                      value={templateText}
                      onChange={(e) => setTemplateText(e.target.value)}
                      placeholder={`समक्ष : {courtCity} येथील {courtName} यांचे कोर्टात...\n\n{party1Name} ....... अर्जदार क्र. १\n\nविरुद्ध\n\n{party2Name} ....... अर्जदार क्र. २`}
                      className="w-full flex-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-b-xl rounded-t-none p-4 text-slate-900 dark:text-slate-100 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed resize-y"
                    />
                  )}
                </div>

                {/* Right Placeholders & Fields Sidebar */}
                {isSidebarOpen && (
                  <div className="w-72 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col shadow-inner shrink-0 min-h-0 h-full overflow-hidden">
                    <div className="mb-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-semibold text-slate-900 dark:text-white text-xs">Available Fields & Placeholders</h4>
                        <span className="text-[10px] text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded font-mono border border-indigo-200 dark:border-indigo-800">
                          {allAvailablePlaceholders.length}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">Click any field to insert at cursor:</p>

                      {/* Filter Search */}
                      <div className="relative">
                        <input
                          type="text"
                          value={placeholderSearch}
                          onChange={(e) => setPlaceholderSearch(e.target.value)}
                          placeholder="Search field or placeholder..."
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg pl-7 pr-2 py-1.5 text-slate-900 dark:text-slate-200 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400"
                        />
                        <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2 top-2" />
                      </div>
                    </div>

                    {/* Placeholders List */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                      {filteredPlaceholderGroups.map((group) => (
                        <div key={group.title} className="space-y-1">
                          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                            {group.title}
                          </div>
                          <div className="flex flex-col gap-1">
                            {group.items.map((ph) => {
                              const isCustom = fields.some((f) => f.key === ph);
                              return (
                                <button
                                  key={ph}
                                  type="button"
                                  onClick={() => insertPlaceholderAtCursor(ph)}
                                  className={`w-full text-left px-2 py-1 rounded-md border font-mono text-[10px] flex items-center justify-between group transition ${
                                    isCustom
                                      ? 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900/90 border-indigo-200 dark:border-indigo-700/60 text-indigo-700 dark:text-indigo-300'
                                      : 'bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                                  }`}
                                  title={`Click to insert {${ph}} at cursor`}
                                >
                                  <span className="truncate">{`{${ph}}`}</span>
                                  <span className="text-[9px] opacity-0 group-hover:opacity-100 text-indigo-600 dark:text-indigo-400 font-bold transition">
                                    +Insert
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CLIENT FORM FIELDS */}
          {activeTab === 'fields' && (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">Form Input Fields</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                    Define the form input controls that appear in the advocate workspace for this template.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateVariablesFromText}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-xs flex items-center gap-1.5 transition shadow-sm"
                    title="Scan template text for {variableName} placeholders and automatically create missing form input fields"
                  >
                    <Sparkles className="w-4 h-4" /> Auto-Generate from Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSectionManagerOpen(true)}
                    className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/80 dark:hover:bg-purple-900 text-purple-700 dark:text-purple-200 border border-purple-200 dark:border-purple-700/60 rounded-xl font-medium text-xs flex items-center gap-1.5 transition"
                  >
                    <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400" /> Manage Group Sections
                  </button>
                  <button
                    type="button"
                    onClick={handleAddField}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium flex items-center gap-1.5 transition"
                  >
                    <Plus className="w-4 h-4" /> Add Form Field
                  </button>
                </div>
              </div>

              {fields.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-950/30">
                  <Layers className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-600 dark:text-slate-400 font-medium">No custom form fields defined yet.</p>
                  <p className="text-slate-500 dark:text-slate-500 text-[11px] mb-4">Click "Add Form Field" above to configure inputs.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {fields.map((field, idx) => (
                    <div key={idx} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-2">
                        <span className="font-mono text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
                          #{idx + 1} — key: {'{' + field.key + '}'}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDuplicateField(idx)}
                            className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-400 text-[11px] rounded-md font-medium flex items-center gap-1 transition"
                            title="Duplicate this form input field with all settings"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveField(idx)}
                            className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 p-1 transition"
                            title="Delete field"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-slate-600 dark:text-slate-400 text-[10px] mb-1">Variable Key (Placeholder)</label>
                          <input
                            type="text"
                            value={field.key}
                            onChange={(e) => handleUpdateField(idx, { ...field, key: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-600 dark:text-slate-400 text-[10px] mb-1">Label (English)</label>
                          <input
                            type="text"
                            value={field.label}
                            onChange={(e) => handleUpdateField(idx, { ...field, label: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-slate-600 dark:text-slate-400 text-[10px]">Label (Marathi)</label>
                            <button
                              type="button"
                              onClick={() => handleTransliterateProp(idx, 'labelMr', field.labelMr || field.label || '')}
                              disabled={transliteratingKey === `${idx}-labelMr` || (!field.labelMr && !field.label)}
                              className="text-[10px] px-1 py-0.2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 rounded font-bold font-marathi shadow-sm transition"
                              title="Convert Label to Marathi Devanagari"
                            >
                              {transliteratingKey === `${idx}-labelMr` ? '...' : 'म'}
                            </button>
                          </div>
                          <input
                            type="text"
                            value={field.labelMr || ''}
                            onChange={(e) => handleUpdateField(idx, { ...field, labelMr: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-marathi"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-600 dark:text-slate-400 text-[10px] mb-1">Input Type</label>
                          <select
                            value={field.type}
                            onChange={(e) => handleUpdateField(idx, { ...field, type: e.target.value as any })}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="text">Text Input</option>
                            <option value="textarea">Textarea (Long Text)</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                            <option value="select">Dropdown Select</option>
                            <option value="boolean">Checkbox (Yes/No)</option>
                          </select>
                        </div>
                      </div>

                      {/* Dropdown Options Editor when type === 'select' */}
                      {field.type === 'select' && (() => {
                        const fieldKey = field.key || `field_${idx}`;
                        const currentText = rawOptionsTextMap[fieldKey] !== undefined
                          ? rawOptionsTextMap[fieldKey]
                          : rawOptionsTextMap[idx] !== undefined
                          ? rawOptionsTextMap[idx]
                          : (field.options || []).map((o: any) => (typeof o === 'string' ? o : o.label)).join(', ');

                        return (
                          <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 rounded-xl space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="block text-indigo-800 dark:text-indigo-300 text-xs font-semibold flex items-center gap-1.5">
                                <List className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                Dropdown Options (Enter choices separated by commas or lines, e.g. kids count)
                              </label>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!currentText.trim()) return;
                                  try {
                                    setTransliteratingKey(`${idx}-options`);
                                    const res = await convertToDevanagari(currentText);
                                    if (res) {
                                      setRawOptionsTextMap((prev) => ({ ...prev, [fieldKey]: res, [idx]: res }));
                                      const newOpts = res
                                        .split(/,|\n/)
                                        .map((s) => s.trim())
                                        .filter(Boolean)
                                        .map((s) => ({ label: s, value: s }));
                                      handleUpdateField(idx, { ...field, options: newOpts });
                                    }
                                  } catch (e) {
                                    console.error('Transliterate options error:', e);
                                  } finally {
                                    setTransliteratingKey(null);
                                  }
                                }}
                                disabled={transliteratingKey === `${idx}-options` || !currentText.trim()}
                                className="text-[10px] px-1 py-0.2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 rounded font-bold font-marathi shadow-sm transition cursor-pointer"
                                title="Convert Option Choices to Devanagari Marathi"
                              >
                                {transliteratingKey === `${idx}-options` ? '...' : 'म'}
                              </button>
                            </div>

                            <textarea
                              rows={2}
                              value={currentText}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                              }}
                              onChange={(e) => {
                                const textVal = e.target.value;
                                setRawOptionsTextMap((prev) => ({ ...prev, [fieldKey]: textVal, [idx]: textVal }));
                                const parsed = textVal
                                  .split(/,|\n/)
                                  .map((item) => item.trim())
                                  .filter(Boolean)
                                  .map((item) => ({ label: item, value: item }));
                                handleUpdateField(idx, { ...field, options: parsed });
                              }}
                              placeholder="e.g. No kids (कोणतेही अपत्य नाही), 1 Child (१ अपत्य), 2 Children (२ अपत्ये), 3 Children (३ अपत्ये)"
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-marathi"
                            />

                            {/* Options Badges Preview */}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 self-center mr-1">Preview ({field.options?.length || 0} options):</span>
                              {(field.options || []).map((opt: any, oIdx: number) => {
                                const lbl = typeof opt === 'string' ? opt : opt.label;
                                return (
                                  <span
                                    key={oIdx}
                                    className="text-[11px] px-2.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700/60 rounded-full font-marathi flex items-center gap-1"
                                  >
                                    {lbl}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updatedOpts = (field.options || []).filter((_: any, i: number) => i !== oIdx);
                                        const newStr = updatedOpts.map((o: any) => typeof o === 'string' ? o : o.label).join(', ');
                                        setRawOptionsTextMap((prev) => ({ ...prev, [fieldKey]: newStr, [idx]: newStr }));
                                        handleUpdateField(idx, { ...field, options: updatedOpts });
                                      }}
                                      className="text-indigo-500 dark:text-indigo-400 hover:text-red-500 dark:hover:text-red-400 font-bold ml-0.5 cursor-pointer"
                                      title="Remove option"
                                    >
                                      ×
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-slate-600 dark:text-slate-400 text-[10px] mb-1 flex items-center justify-between">
                            <span>Form Group Section</span>
                            {field.group && !['court', 'party1', 'party2', 'marriage', 'terms', 'general'].includes(field.group) && (
                              <span className="text-[9px] text-purple-600 dark:text-purple-400 font-semibold">★ Custom</span>
                            )}
                          </label>
                          <div className="space-y-1.5">
                            <select
                              value={field.group || 'general'}
                              onChange={(e) => {
                                if (e.target.value === '__add_new__') {
                                  setIsSectionManagerOpen(true);
                                } else {
                                  handleUpdateField(idx, { ...field, group: e.target.value });
                                }
                              }}
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-marathi"
                            >
                              <optgroup label="Standard Sections">
                                {availableSections.standard.map((s) => (
                                  <option key={s.key} value={s.key}>
                                    {s.label}
                                  </option>
                                ))}
                              </optgroup>

                              {availableSections.customs.length > 0 && (
                                <optgroup label="Custom Sections ★">
                                  {availableSections.customs.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </optgroup>
                              )}

                              <option value="__add_new__">➕ Add / Manage Form Sections...</option>
                            </select>

                            {(!field.group || !['court', 'party1', 'party2', 'marriage', 'terms', 'general'].includes(field.group)) && (
                              <input
                                type="text"
                                value={field.group || ''}
                                onChange={(e) => handleUpdateField(idx, { ...field, group: e.target.value })}
                                placeholder="e.g. Property Details / वारसदार तपशील"
                                className="w-full bg-white dark:bg-slate-950 border border-purple-300 dark:border-purple-800/80 rounded-lg px-2.5 py-1 text-purple-900 dark:text-purple-200 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-slate-400 dark:placeholder:text-slate-600 font-medium font-marathi"
                              />
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-slate-600 dark:text-slate-400 text-[10px]">Default Value</label>
                            <button
                              type="button"
                              onClick={() => handleTransliterateProp(idx, 'defaultValue', field.defaultValue || '')}
                              disabled={transliteratingKey === `${idx}-defaultValue` || !field.defaultValue}
                              className="text-[10px] px-1 py-0.2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 rounded font-bold font-marathi shadow-sm transition"
                              title="Convert Default Value to Marathi Devanagari"
                            >
                              {transliteratingKey === `${idx}-defaultValue` ? '...' : 'म'}
                            </button>
                          </div>
                          <input
                            type="text"
                            value={field.defaultValue || ''}
                            onChange={(e) => handleUpdateField(idx, { ...field, defaultValue: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-marathi"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-slate-600 dark:text-slate-400 text-[10px]">Placeholder Text</label>
                            <button
                              type="button"
                              onClick={() => handleTransliterateProp(idx, 'placeholder', field.placeholder || '')}
                              disabled={transliteratingKey === `${idx}-placeholder` || !field.placeholder}
                              className="text-[10px] px-1 py-0.2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 rounded font-bold font-marathi shadow-sm transition"
                              title="Convert Placeholder Text to Marathi Devanagari"
                            >
                              {transliteratingKey === `${idx}-placeholder` ? '...' : 'म'}
                            </button>
                          </div>
                          <input
                            type="text"
                            value={field.placeholder || ''}
                            onChange={(e) => handleUpdateField(idx, { ...field, placeholder: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-marathi"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-medium flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving Template...' : isEditing ? 'Save Changes' : 'Create Template'}
          </button>
        </div>
      </div>

      {/* SECTION MANAGER MODAL */}
      {isSectionManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                Form Group Section Manager
              </h3>
              <button
                type="button"
                onClick={() => setIsSectionManagerOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Create, rename, or delete custom form group sections for this template. Renaming a section automatically updates all assigned form fields.
            </p>

            {/* Add New Section */}
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={newSectionInput}
                  onChange={(e) => setNewSectionInput(e.target.value)}
                  placeholder="New Section Name (e.g. Property Details / वारसदार तपशील)"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl pl-3 pr-9 py-2 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 font-marathi"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomSection();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    handleTransliterateProp(null, 'newSectionInput', newSectionInput, (converted) =>
                      setNewSectionInput(converted)
                    )
                  }
                  disabled={transliteratingKey === 'newSectionInput' || !newSectionInput.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 rounded font-bold font-marathi shadow-sm transition disabled:opacity-50"
                  title="Convert Section Name to Marathi Devanagari"
                >
                  {transliteratingKey === 'newSectionInput' ? '...' : 'म'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleAddCustomSection()}
                disabled={!newSectionInput.trim()}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition shrink-0"
              >
                <Plus className="w-4 h-4" /> Add Section
              </button>
            </div>

            {/* Active Custom Sections List */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              <h4 className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Custom Sections ({availableSections.customs.length})</h4>
              {availableSections.customs.length === 0 ? (
                <p className="text-slate-500 text-xs italic py-2">No custom sections added yet.</p>
              ) : (
                availableSections.customs.map((secName) => {
                  const fieldCount = fields.filter((f) => f.group === secName).length;
                  const isEditing = editingSectionName?.oldName === secName;

                  return (
                    <div key={secName} className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-xl px-3 py-2 text-xs">
                      {isEditing ? (
                        <div className="flex-1 flex gap-2 items-center mr-2">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              value={editingSectionName.newName}
                              onChange={(e) => setEditingSectionName({ ...editingSectionName, newName: e.target.value })}
                              className="w-full bg-white dark:bg-slate-900 border border-purple-500 rounded pl-2 pr-7 py-1 text-slate-900 dark:text-white text-xs font-marathi"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleTransliterateProp(
                                  null,
                                  'renameSectionInput',
                                  editingSectionName.newName,
                                  (converted) =>
                                    setEditingSectionName({ ...editingSectionName, newName: converted })
                                )
                              }
                              disabled={transliteratingKey === 'renameSectionInput' || !editingSectionName.newName.trim()}
                              className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] px-1 py-0.2 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950 dark:hover:bg-purple-900 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700/60 rounded font-bold font-marathi shadow-sm transition disabled:opacity-50"
                              title="Convert Section Name to Marathi Devanagari"
                            >
                              {transliteratingKey === 'renameSectionInput' ? '...' : 'म'}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRenameSection(secName, editingSectionName.newName)}
                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSectionName(null)}
                            className="px-2 py-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded text-[10px]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-purple-700 dark:text-purple-300 font-marathi">{secName}</span>
                            <span className="text-[10px] text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-800">
                              {fieldCount} field{fieldCount !== 1 ? 's' : ''}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingSectionName({ oldName: secName, newName: secName })}
                              className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-slate-200 dark:hover:bg-slate-900 rounded"
                              title="Rename Section"
                            >
                              <Type className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSection(secName)}
                              className="p-1 text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-slate-200 dark:hover:bg-slate-900 rounded"
                              title="Delete Section"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsSectionManagerOpen(false)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-xl text-xs font-semibold transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
