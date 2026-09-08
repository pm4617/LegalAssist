import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useCopilotReadable, useCopilotAction } from '@copilotkit/react-core';
import {
  Scale,
  FileText,
  Download,
  Printer,
  Sparkles,
  Settings,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Copy,
  Check,
  ChevronDown,
  RefreshCw,
  PlusCircle,
  Edit3,
  Columns,
  Maximize2,
  FolderEdit,
  Calendar,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Eye,
  Code,
  Trash2,
  X,
  Scissors,
  Languages,
  Pin,
  Indent,
  Outdent,
  Table,
  Paintbrush,
  Sun,
  Moon,
} from 'lucide-react';
import { LegalTemplate, ClientFacts, ComplianceCheckResult, DocumentDraft } from '../types';
import { SettingsModal } from './SettingsModal';
import { ClientNotesModal } from './ClientNotesModal';
import { TemplateManagerModal } from './TemplateManagerModal';
import { convertToDevanagari } from '../utils/transliterate';
import { formatToDDMMYYYY, formatToYYYYMMDD } from '../utils/date';
import { parseKeyValueNotes } from '../utils/keyValueParser';

interface LegalWorkspaceProps {
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  advocateName: string;
  onSaveAdvocateName: (name: string) => void;
  isCopilotPinned?: boolean;
  onTogglePinCopilot?: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const LegalWorkspace: React.FC<LegalWorkspaceProps> = ({
  apiKey,
  onSaveApiKey,
  advocateName,
  onSaveAdvocateName,
  isCopilotPinned = true,
  onTogglePinCopilot,
  theme = 'light',
  onToggleTheme,
}) => {
  const [templates, setTemplates] = useState<LegalTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('divorce-13b-mr');
  const [documentTitle, setDocumentTitle] = useState<string>('Section 13B Mutual Consent Divorce Petition');
  const [documentBody, setDocumentBody] = useState<string>('');
  const [viewMode, setViewMode] = useState<'split' | 'form' | 'preview'>('split');
  const [copied, setCopied] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [transliteratingField, setTransliteratingField] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);

  // Resizable Form Wizard Pane state & handler
  const [formPaneWidth, setFormPaneWidth] = useState<number>(() => {
    const saved = localStorage.getItem('juris_form_pane_width');
    return saved ? Number(saved) : 440;
  });

  useEffect(() => {
    localStorage.setItem('juris_form_pane_width', String(formPaneWidth));
  }, [formPaneWidth]);

  const handleMouseDownFormResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = formPaneWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.min(Math.max(startWidth + deltaX, 280), Math.floor(window.innerWidth * 0.6));
      setFormPaneWidth(newWidth);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Live Document Preview Visual Rich Text Editor state & helpers
  const [docEditorMode, setDocEditorMode] = useState<'visual' | 'code'>('visual');
  const [paperSize, setPaperSize] = useState<'legal' | 'a4'>('a4');
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
  const docRichEditorRef = useRef<HTMLDivElement>(null);
  const isSelfEditingRef = useRef<boolean>(false);

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

  // Dynamically calculate natural page break positions incorporating 1" bottom margin and 1" top margin (192px gap)
  const [naturalPageBreaks, setNaturalPageBreaks] = useState<{ y: number; pageNum: number }[]>([]);

  useEffect(() => {
    const computeNaturalBreaks = () => {
      const editorEl = docRichEditorRef.current;
      if (!editorEl) return;

      const isA4 = paperSize === 'a4';
      const printableHeight = isA4 ? 930 : 1152; // 9.69" A4 / 12.0" Legal content height
      const totalPaperHeight = isA4 ? 1122 : 1344; // 11.69" A4 / 14.0" Legal full paper sheet
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
  }, [documentBody, paperSize, docEditorMode]);

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

  const formatDocToHtml = (rawText: string): string => {
    if (!rawText) return '';
    let html = unescapeAllEntities(rawText);

    // Standardize all page break syntax (markdown [page-break], html comments, hr tags) to visual page break div
    html = html
      .replace(/\[page-?break\]/gi, '<div class="page-break"></div><p><br></p>')
      .replace(/<!--\s*page-?break\s*-->/gi, '<div class="page-break"></div><p><br></p>')
      .replace(/<hr[^>]*class=["'][^"']*page-break[^"']*["'][^>]*\/?>/gi, '<div class="page-break"></div><p><br></p>')
      .replace(/<hr[^>]*style=["'][^"']*page-break[^"']*["'][^>]*\/?>/gi, '<div class="page-break"></div><p><br></p>')
      .replace(/--- COURT PAGE BREAK ---/g, '')
      .replace(/<div class="page-break"[^>]*>([\s\S]*?)<\/div>/gi, '<div class="page-break"></div>');

    html = html
      .replace(/<center>([\s\S]*?)<\/center>/gi, '<p style="text-align: center;">$1</p>')
      .replace(/<p align=["']center["']>([\s\S]*?)<\/p>/gi, '<p style="text-align: center;">$1</p>')
      .replace(/<p align=["']right["']>([\s\S]*?)<\/p>/gi, '<p style="text-align: right;">$1</p>')
      .replace(/<p align=["']left["']>([\s\S]*?)<\/p>/gi, '<p style="text-align: left;">$1</p>')
      .replace(/<p align=["']justify["']>([\s\S]*?)<\/p>/gi, '<p style="text-align: justify;">$1</p>');

    if (!/<(div|p|br|table|tr|td|h[1-6])[\s/>]/i.test(html)) {
      html = html
        .split('\n')
        .map((line) => (line.trim() ? `<p>${line}</p>` : '<p><br></p>'))
        .join('');
    }
    return html;
  };

  useEffect(() => {
    if (docEditorMode === 'visual' && docRichEditorRef.current) {
      if (isSelfEditingRef.current) {
        isSelfEditingRef.current = false;
        return;
      }
      const formatted = formatDocToHtml(documentBody);
      docRichEditorRef.current.innerHTML = formatted;
    }
  }, [documentBody, docEditorMode, selectedTemplateId]);

  // Auto-intercept REVISED_DOCUMENT_START markers in Copilot sidebar DOM to guarantee instant UI update
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const copilotContainer = document.querySelector('.copilotKitSidebar') || document.querySelector('.copilotKitWindow') || document.body;
      if (!copilotContainer) return;

      const containerNodes = copilotContainer.querySelectorAll('.copilotKitMessage, [class*="Message"], [class*="message"], div');
      containerNodes.forEach((node) => {
        const text = node.textContent || '';
        if (text.includes('[REVISED_DOCUMENT_START]') && text.includes('[REVISED_DOCUMENT_END]')) {
          const match = text.match(/\[REVISED_DOCUMENT_START\]([\s\S]*?)\[REVISED_DOCUMENT_END\]/);
          if (match && match[1]) {
            const rawHtml = match[1].trim();
            const revisedHtml = unescapeAllEntities(rawHtml);
            setDocumentBody((prev) => {
              if (prev !== revisedHtml) {
                console.log('✅ Auto-synchronized updated document draft from Copilot chat into editor!');
                return revisedHtml;
              }
              return prev;
            });
          }
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  const handleDocExecCommand = (command: string, value: string = '') => {
    if (docEditorMode === 'visual' && docRichEditorRef.current) {
      docRichEditorRef.current.focus();
      if (command === 'insertPageBreak') {
        const pbHtml = `<div class="page-break"></div><p><br></p>`;
        document.execCommand('insertHTML', false, pbHtml);
      } else if (command === 'fontSizePt') {
        const pt = parseFloat(value);
        if (!isNaN(pt) && pt > 0) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
            const span = document.createElement('span');
            span.style.fontSize = `${pt}pt`;
            try {
              const range = sel.getRangeAt(0);
              range.surroundContents(span);
            } catch {
              const parent = sel.anchorNode?.parentElement?.closest('p, div, span, h1, h2, h3');
              if (parent) (parent as HTMLElement).style.fontSize = `${pt}pt`;
            }
          } else {
            const parent = sel?.anchorNode?.parentElement?.closest('p, div, span, h1, h2, h3, td, th');
            if (parent) (parent as HTMLElement).style.fontSize = `${pt}pt`;
          }
        }
      } else if (command === 'fontName') {
        document.execCommand('fontName', false, value);
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
          const container = docRichEditorRef.current;
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
      } else if (command === 'align') {
        if (value === 'center') document.execCommand('justifyCenter');
        else if (value === 'right') document.execCommand('justifyRight');
        else if (value === 'left') document.execCommand('justifyLeft');
        else if (value === 'justify') document.execCommand('justifyFull');
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
          const container = docRichEditorRef.current;

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
      } else {
        document.execCommand(command, false, value);
      }
      setDocumentBody(docRichEditorRef.current.innerHTML);
    }
  };

  const handleTransliterateField = async (fieldKey: string, textToConvert: string) => {
    if (!textToConvert || !textToConvert.trim()) return;
    setTransliteratingField(fieldKey);
    try {
      const result = await convertToDevanagari(textToConvert, apiKey);
      if (result) {
        handleFactChange(fieldKey, result);
      }
    } catch (err) {
      console.error('Transliterate error:', err);
    } finally {
      setTransliteratingField(null);
    }
  };

  // Client Facts State
  const [facts, setFacts] = useState<ClientFacts>({
    courtCity: 'अमळनेर',
    courtName: 'मे. दिवाणी न्यायाधीश वरिष्ठ स्तर',
    hmpNo: '',
    caseYear: '२०२६',
    party1Prefix: 'श्री.',
    party1Name: 'नितीन मधुकर महाजन',
    party1Age: '३५',
    party1Occupation: 'सेवा (नोकरी)',
    party1Address: 'रा. अमळनेर, ता. अमळनेर, जि. जळगाव',
    party2Prefix: 'सौ.',
    party2Name: 'संजीवनी नितीन महाजन',
    party2MaidenName: 'संजीवनी राधेश्याम महाजन',
    party2Age: '३०',
    party2Occupation: 'गृहिणी',
    party2Guardian: 'राधेश्याम महाजन',
    party2Address: 'रा. द्वारा राधेश्याम महाजन, मु. अकुलखेडा, ता. चोपडा, जि. जळगाव',
    marriageDate: '०१/०५/२०२१',
    marriagePlace: 'जळगाव',
    childrenDetails: 'कोणतेही अपत्य नाही',
    separationDate: '१५/०६/२०२२',
    separationYears: '३ वर्षांपेक्षा जास्त कालावधी',
    alimonyNil: false,
    alimonyAmount: '२,००,०००',
    alimonyWords: 'रुपये दोन लाख मात्र',
    custodyWith: 'na',
    advocateParty1: advocateName || 'ॲड. सचिन मधुकर महाजन',
    advocateParty2: '. . . . . . . . . . . . . . . . .',
    effectiveDate: '03/09/2026',
    disputeCity: 'Mumbai',
    governingLaw: 'Laws of India',
    outstandingAmount: 'Rs. 4,50,000/-',
  });

  // Multi-Document Draft Manager State
  const LOCAL_STORAGE_DRAFTS_KEY = 'juris_copilot_drafts_v1';
  const [drafts, setDrafts] = useState<DocumentDraft[]>(() => {
    try {
      const saved = localStorage.getItem('juris_copilot_drafts_v1');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load saved drafts:', e);
    }
    return [];
  });
  const [activeDraftId, setActiveDraftId] = useState<string>('');
  const [isNewDraftModalOpen, setIsNewDraftModalOpen] = useState<boolean>(false);

  // Active Template
  const activeTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId);
  }, [templates, selectedTemplateId]);

  // Active template drafts list
  const currentTemplateDrafts = useMemo(() => {
    return drafts.filter((d) => d.templateId === selectedTemplateId);
  }, [drafts, selectedTemplateId]);

  // Helper to extract party/client display name for draft title
  const getDraftPartyName = (currentFacts: ClientFacts, fields?: any[]): string => {
    if (!currentFacts) return '';

    // 1. First, check non-empty values of template fields in order
    if (fields && fields.length > 0) {
      for (const f of fields) {
        const keyLower = (f.key || '').toLowerCase();
        const labelLower = (f.label || '').toLowerCase();
        const labelMr = (f.labelMr || '').toLowerCase();

        const isNameField =
          keyLower.includes('name') ||
          labelLower.includes('name') ||
          labelMr.includes('नाव') ||
          keyLower.includes('party') ||
          labelLower.includes('party') ||
          labelMr.includes('पक्ष') ||
          keyLower.includes('client') ||
          keyLower.includes('applicant') ||
          keyLower.includes('deponent') ||
          keyLower.includes('deceased') ||
          labelMr.includes('अर्जदार') ||
          labelMr.includes('मयत');

        if (isNameField) {
          const val = (currentFacts as any)[f.key];
          if (val && typeof val === 'string' && val.trim().length > 0 && val.trim() !== 'मयत नाव' && val.trim() !== '________________________') {
            return val.trim();
          }
        }
      }
    }

    // 2. Next, check standard party names
    if (currentFacts.party1Name && currentFacts.party1Name.trim() && currentFacts.party1Name !== '________________________') {
      return currentFacts.party1Name.trim();
    }
    if (currentFacts.party2Name && currentFacts.party2Name.trim() && currentFacts.party2Name !== '________________________') {
      return currentFacts.party2Name.trim();
    }
    if ((currentFacts as any).deponentNewName && String((currentFacts as any).deponentNewName).trim()) {
      return String((currentFacts as any).deponentNewName).trim();
    }
    if ((currentFacts as any).applicantName && String((currentFacts as any).applicantName).trim()) {
      return String((currentFacts as any).applicantName).trim();
    }
    if ((currentFacts as any).clientName && String((currentFacts as any).clientName).trim()) {
      return String((currentFacts as any).clientName).trim();
    }
    if ((currentFacts as any).fatherOrHusbandName && String((currentFacts as any).fatherOrHusbandName).trim()) {
      return String((currentFacts as any).fatherOrHusbandName).trim();
    }
    if ((currentFacts as any).deceasedName && String((currentFacts as any).deceasedName).trim() && String((currentFacts as any).deceasedName).trim() !== 'मयत नाव') {
      return String((currentFacts as any).deceasedName).trim();
    }

    return '';
  };

  // Ensure active draft exists when selected template changes
  useEffect(() => {
    if (!selectedTemplateId) return;

    const existingForTemplate = drafts.filter((d) => d.templateId === selectedTemplateId);

    if (existingForTemplate.length === 0) {
      const newId = `draft_${Date.now()}`;
      const partyName = getDraftPartyName(facts, activeTemplate?.fields);
      const initialDraft: DocumentDraft = {
        id: newId,
        name: partyName ? `Draft #1 (${partyName})` : `Draft #1`,
        templateId: selectedTemplateId,
        facts: { ...facts },
        documentBody: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setDrafts((prev) => [...prev, initialDraft]);
      setActiveDraftId(newId);
    } else {
      const active = existingForTemplate.find((d) => d.id === activeDraftId);
      if (!active) {
        const first = existingForTemplate[0];
        setActiveDraftId(first.id);
        setFacts(first.facts);
        if (first.documentBody) setDocumentBody(first.documentBody);
      }
    }
  }, [selectedTemplateId]);

  // Persist drafts array in localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_DRAFTS_KEY, JSON.stringify(drafts));
    } catch (e) {
      console.error('Failed to save drafts:', e);
    }
  }, [drafts]);

  // Auto-sync active draft's facts & documentBody whenever facts or documentBody change
  useEffect(() => {
    if (!activeDraftId) return;
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id === activeDraftId) {
          const partyName = getDraftPartyName(facts, activeTemplate?.fields);
          const tmplDrafts = prev.filter((item) => item.templateId === d.templateId);
          const index = tmplDrafts.findIndex((item) => item.id === d.id);
          const baseName = `Draft #${index >= 0 ? index + 1 : 1}`;
          const displayName = partyName ? `${baseName} (${partyName})` : baseName;

          const cleanFacts = { ...facts };
          delete (cleanFacts as any).id;
          delete (cleanFacts as any).templateId;
          delete (cleanFacts as any).name;
          delete (cleanFacts as any).createdAt;
          delete (cleanFacts as any).updatedAt;
          delete (cleanFacts as any).template;

          return {
            ...d,
            id: d.id,
            templateId: d.templateId,
            name: displayName,
            facts: cleanFacts,
            documentBody,
            updatedAt: new Date().toISOString(),
          };
        }
        return d;
      })
    );
  }, [facts, documentBody, activeDraftId, activeTemplate]);

  const switchDraft = (draftId: string) => {
    const target = drafts.find((d) => d.id === draftId);
    if (target) {
      setActiveDraftId(target.id);
      setFacts(target.facts);
      if (target.documentBody) setDocumentBody(target.documentBody);
    }
  };

  const handleCreateNewDraft = (mode: 'duplicate' | 'fresh') => {
    if (!selectedTemplateId || !activeTemplate) return;

    const count = currentTemplateDrafts.length + 1;
    const newId = `draft_${Date.now()}`;

    let newFacts: ClientFacts;
    if (mode === 'duplicate') {
      newFacts = { ...facts };
    } else {
      const freshFacts: ClientFacts = {};
      // Preserve default advocate & court defaults if present
      if (facts.advocateName) freshFacts.advocateName = facts.advocateName;
      if (facts.advocateAddress) freshFacts.advocateAddress = facts.advocateAddress;
      if (facts.advocateParty1) freshFacts.advocateParty1 = facts.advocateParty1;
      if (facts.courtCity) freshFacts.courtCity = facts.courtCity;
      if (facts.courtName) freshFacts.courtName = facts.courtName;

      if (activeTemplate.fields) {
        activeTemplate.fields.forEach((f) => {
          (freshFacts as any)[f.key] = f.defaultValue !== undefined ? f.defaultValue : '';
        });
      }
      newFacts = freshFacts;
    }

    const partyName = getDraftPartyName(newFacts, activeTemplate.fields);
    const newDraft: DocumentDraft = {
      id: newId,
      name: partyName ? `Draft #${count} (${partyName})` : `Draft #${count}`,
      templateId: selectedTemplateId,
      facts: newFacts,
      documentBody: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setDrafts((prev) => [...prev, newDraft]);
    setActiveDraftId(newId);
    setFacts(newFacts);
    setDocumentBody('');
    setIsNewDraftModalOpen(false);
  };

  const handleDeleteDraft = (draftId: string) => {
    const remaining = drafts.filter((d) => d.id !== draftId);
    setDrafts(remaining);

    const remainingForTemplate = remaining.filter((d) => d.templateId === selectedTemplateId);
    if (remainingForTemplate.length > 0) {
      const next = remainingForTemplate[remainingForTemplate.length - 1];
      setActiveDraftId(next.id);
      setFacts(next.facts);
      if (next.documentBody) setDocumentBody(next.documentBody);
    }
  };

  const [compliance, setCompliance] = useState<ComplianceCheckResult>({
    passed: false,
    totalChecks: 0,
    passedChecks: 0,
    checks: [],
  });

  // Load Templates from Backend
  const reloadTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  useEffect(() => {
    reloadTemplates();
  }, []);

  // Re-merge document body whenever active template or facts change
  useEffect(() => {
    const mergeDoc = async () => {
      if (!selectedTemplateId) return;
      try {
        const res = await fetch('/api/documents/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId: selectedTemplateId, facts }),
        });
        if (res.ok) {
          const data = await res.json();
          setDocumentBody(data.text);
          setCompliance(data.compliance);
        }
      } catch (err) {
        console.error('Failed to render template:', err);
      }
    };
    mergeDoc();
  }, [selectedTemplateId, facts]);

  // Keep documentTitle in sync with activeTemplate title
  useEffect(() => {
    if (activeTemplate?.title) {
      setDocumentTitle(activeTemplate.title);
    }
  }, [activeTemplate]);

  // 1. Give the Copilot context about the active legal document and client facts
  useCopilotReadable({
    description: 'The active legal document draft, including template title, category, language, and current body text.',
    value: {
      templateId: selectedTemplateId,
      templateTitle: activeTemplate?.title || documentTitle,
      title: activeTemplate?.title || documentTitle,
      category: activeTemplate?.category,
      language: activeTemplate?.language,
      documentBody: documentBody,
      body: documentBody,
    },
  });

  useCopilotReadable({
    description: 'The current client and case facts entered into the legal drafting wizard.',
    value: facts,
  });

  useCopilotReadable({
    description: 'Current statutory and court compliance checklist results.',
    value: compliance,
  });

  useCopilotReadable({
    description: 'Gemini API key for AI Copilot chat service',
    value: { apiKey },
  });

  // 2. Register frontend actions the Copilot can perform directly on the UI
  useCopilotAction({
    name: 'updateDocumentBody',
    description: 'Updates or rewrites the active text content of the legal document directly in the editor.',
    parameters: [
      {
        name: 'newBodyText',
        type: 'string',
        description: 'The revised complete legal document text.',
        required: true,
      },
    ],
    handler: async ({ newBodyText }) => {
      setDocumentBody(newBodyText);
      return 'Document body updated successfully in-place.';
    },
  });

  useCopilotAction({
    name: 'populateClientForm',
    description: 'Populates client and case details into the wizard form fields and updates the document.',
    parameters: [
      {
        name: 'party1Name',
        type: 'string',
        description: 'Husband / Applicant 1 full name',
      },
      {
        name: 'party2Name',
        type: 'string',
        description: 'Wife / Applicant 2 married name',
      },
      {
        name: 'party2MaidenName',
        type: 'string',
        description: 'Wife maiden name before marriage',
      },
      {
        name: 'marriageDate',
        type: 'string',
        description: 'Date of marriage (dd/mm/yyyy)',
      },
      {
        name: 'separationDate',
        type: 'string',
        description: 'Date or duration of separation',
      },
      {
        name: 'alimonyAmount',
        type: 'string',
        description: 'Alimony amount agreed in figures',
      },
      {
        name: 'alimonyNil',
        type: 'boolean',
        description: 'True if wife waives alimony permanently',
      },
      {
        name: 'courtCity',
        type: 'string',
        description: 'Court jurisdiction city e.g. Amalner or Jalgaon',
      },
    ],
    handler: async (extractedFields) => {
      setFacts((prev) => ({
        ...prev,
        ...extractedFields,
      }));
      return 'Client details updated in form successfully.';
    },
  });

  useCopilotAction({
    name: 'insertLegalClause',
    description: 'Inserts a standard or custom legal clause into the active document draft.',
    parameters: [
      {
        name: 'clauseTitle',
        type: 'string',
        description: 'Title of the clause being inserted',
        required: true,
      },
      {
        name: 'clauseText',
        type: 'string',
        description: 'The exact legal clause text to insert',
        required: true,
      },
    ],
    handler: async ({ clauseTitle, clauseText }) => {
      setDocumentBody((prev) => `${prev}\n\n/* ${clauseTitle} */\n${clauseText}`);
      return `Clause "${clauseTitle}" appended to draft successfully.`;
    },
  });

  const handleTranslateDocument = async (targetLang?: 'en' | 'mr') => {
    if (!documentBody || isTranslating) return;

    if (!apiKey || apiKey.trim().length < 5) {
      alert('Please configure your Gemini API key in Settings (⚙️) to perform Gemini 3.7 Flash document translation.');
      setIsSettingsOpen(true);
      return;
    }

    setIsTranslating(true);
    try {
      const hasDevanagari = /[अ-ह\u0900-\u097F]/i.test(documentBody);
      const chosenLang = targetLang || (hasDevanagari ? 'en' : 'mr');
      const res = await fetch('/api/copilot/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentBody,
          targetLanguage: chosenLang,
          apiKey
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.translated) {
          setDocumentBody(data.translated);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Gemini 3.7 Flash Translation Error: ${errData.error || errData.details || 'Failed to translate document'}`);
      }
    } catch (err: any) {
      console.error('Translation error:', err);
      alert(`Translation Error: ${err?.message || 'Failed to connect to backend'}`);
    } finally {
      setIsTranslating(false);
    }
  };

  useCopilotAction({
    name: 'translateDocument',
    description: 'Translates the active legal document between English and Marathi (Devanagari) while preserving HTML formatting.',
    parameters: [
      {
        name: 'targetLanguage',
        type: 'string',
        description: 'The target language: "en" for English or "mr" for Marathi',
        required: true,
      },
    ],
    handler: async ({ targetLanguage }) => {
      const lang = targetLanguage === 'mr' ? 'mr' : 'en';
      await handleTranslateDocument(lang);
      return `Document translated into ${lang === 'en' ? 'English' : 'Marathi'} successfully.`;
    },
  });

  useCopilotAction({
    name: 'selectTemplate',
    description: 'Switches the active legal template (e.g. divorce-13b-mr, period-waive-mr, mutual-nda, legal-notice-recovery).',
    parameters: [
      {
        name: 'templateId',
        type: 'string',
        description: 'The ID of the template to activate',
        required: true,
      },
    ],
    handler: async ({ templateId }) => {
      setSelectedTemplateId(templateId);
      return `Template changed to ${templateId}.`;
    },
  });

  // Handle Input Changes in Facts Form
  const handleFactChange = (key: keyof ClientFacts, value: any) => {
    setFacts((prev) => {
      const updated = { ...prev, [key]: value };

      // Intelligently sync custodyWith when childrenDetails is modified
      if (key === 'childrenDetails') {
        const valStr = String(value || '').trim().toLowerCase();
        const hasKids = valStr.length > 0 &&
          !valStr.includes('नाही') &&
          !valStr.includes('no') &&
          !valStr.includes('nil') &&
          !valStr.includes('none') &&
          !valStr.includes('शून्य');

        if (hasKids && (prev.custodyWith === 'na' || !prev.custodyWith)) {
          updated.custodyWith = 'wife'; // Default to mother when kids are specified
        } else if (!hasKids && prev.custodyWith !== 'na') {
          updated.custodyWith = 'na'; // Set to N/A when no children
        }
      }

      return updated;
    });
  };

  // Extract from Notes Handler & Immediate Draft Regeneration
  const handleExtractNotes = async (rawNotes: string) => {
    setIsExtracting(true);
    try {
      // 1. Direct deterministic key-value extraction from notes lines
      const localFacts = parseKeyValueNotes(rawNotes, activeTemplate?.fields);

      // 2. Call backend copilot extract (AI + regex)
      let backendFacts: Record<string, any> = {};
      try {
        const res = await fetch('/api/copilot/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawNotes, apiKey, templateId: selectedTemplateId }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.facts) {
            backendFacts = data.facts;
          }
        }
      } catch (e) {
        console.warn('Backend copilot extract failed, using local facts:', e);
      }

      // Merge current facts, backend facts, and explicit local key-value edits
      const mergedFacts = { ...facts, ...backendFacts, ...localFacts };
      delete (mergedFacts as any).id;
      delete (mergedFacts as any).templateId;
      delete (mergedFacts as any).name;
      delete (mergedFacts as any).createdAt;
      delete (mergedFacts as any).updatedAt;
      delete (mergedFacts as any).template;
      delete (mergedFacts as any).draftId;

      setFacts(mergedFacts);

      // Force immediate re-render of document draft with newly extracted facts
      const renderRes = await fetch('/api/documents/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplateId, facts: mergedFacts }),
      });
      if (renderRes.ok) {
        const renderData = await renderRes.json();
        setDocumentBody(renderData.text);
        setCompliance(renderData.compliance);
      }
    } catch (err) {
      console.error('Failed to extract facts:', err);
    } finally {
      setIsExtracting(false);
    }
  };

  // Export to Word .docx
  const handleExportDocx = async () => {
    setIsExporting(true);
    try {
      const contentToExport =
        docEditorMode === 'visual' && docRichEditorRef.current
          ? docRichEditorRef.current.innerHTML
          : documentBody;

      const res = await fetch('/api/documents/export/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activeTemplate?.title || documentTitle,
          content: contentToExport,
          isDevanagari: activeTemplate?.language === 'mr',
          paperSize,
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = `${(activeTemplate?.id || 'Legal_Doc')}_${facts.party1Name || 'draft'}.docx`.replace(/[^a-zA-Z0-9_.]/g, '_');
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Copy to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(documentBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Print Document
  const handlePrint = () => {
    if (paperSize === 'legal') {
      document.body.classList.add('paper-legal-print');
      document.body.classList.remove('paper-a4-print');
    } else {
      document.body.classList.add('paper-a4-print');
      document.body.classList.remove('paper-legal-print');
    }
    if (docEditorMode === 'code') {
      if (docRichEditorRef.current) {
        docRichEditorRef.current.innerHTML = formatDocToHtml(documentBody);
      }
      setDocEditorMode('visual');
    }
    if (docRichEditorRef.current) {
      const pbEls = docRichEditorRef.current.querySelectorAll('.page-break');
      pbEls.forEach((el) => {
        el.removeAttribute('style');
        el.innerHTML = '';
      });
    }
    setTimeout(() => {
      window.print();
    }, 150);
  };


  // Sync default field values whenever selected template changes
  useEffect(() => {
    if (!activeTemplate?.fields) return;
    setFacts((prev) => {
      const updated = { ...prev };
      let hasChanges = false;
      activeTemplate.fields.forEach((field) => {
        if (updated[field.key] === undefined && field.defaultValue !== undefined) {
          updated[field.key] = field.defaultValue;
          hasChanges = true;
        }
      });
      return hasChanges ? updated : prev;
    });
  }, [activeTemplate]);

  // Dynamically group active template fields
  const fieldGroups = useMemo(() => {
    if (!activeTemplate?.fields) return [];

    const groupsMap: Record<string, typeof activeTemplate.fields> = {};
    const customKeys: string[] = [];

    activeTemplate.fields.forEach((field) => {
      const g = field.group || 'general';
      if (!groupsMap[g]) {
        groupsMap[g] = [];
        if (!['court', 'party1', 'party2', 'marriage', 'terms', 'general'].includes(g)) {
          customKeys.push(g);
        }
      }
      groupsMap[g].push(field);
    });

    const standardOrder = ['court', 'party1', 'party2', 'marriage', 'terms', 'general'];
    const allKeys = [
      ...standardOrder.filter((g) => groupsMap[g] && groupsMap[g].length > 0),
      ...customKeys.filter((g) => groupsMap[g] && groupsMap[g].length > 0),
    ];

    return allKeys.map((g) => ({
      key: g,
      fields: groupsMap[g],
    }));
  }, [activeTemplate]);

  const getGroupHeader = (groupKey: string) => {
    const isFamily = activeTemplate?.category === 'family';
    const titleLower = (activeTemplate?.title || '').toLowerCase();
    const titleMrLower = (activeTemplate?.titleMr || '').toLowerCase();
    const idLower = (activeTemplate?.id || '').toLowerCase();

    const isNameChange = (idLower.includes('name-change') || titleLower.includes('name change') || titleMrLower.includes('नावात बदल')) &&
      !titleLower.includes('heirship') && !titleMrLower.includes('वारस');
    const isAffidavit = idLower.includes('affidavit') || titleLower.includes('affidavit') || titleMrLower.includes('प्रतिज्ञापत्र');
    const isNotice = idLower.includes('notice') || titleLower.includes('notice') || titleMrLower.includes('नोटीस');
    const isCommercial = activeTemplate?.category === 'commercial';
    const hasDeceased = activeTemplate?.fields.some(f => f.key.toLowerCase().includes('deceased') || (f.labelMr && f.labelMr.includes('मयत')));

    switch (groupKey) {
      case 'court':
        return {
          title: isCommercial ? 'Governing Jurisdiction' : 'Court & Filing Authority',
          titleMr: isCommercial ? 'अधिकारक्षेत्र' : 'न्यायालय व अधिकारक्षेत्र',
          color: 'text-indigo-400',
        };
      case 'party1':
        if (isFamily) return { title: 'Applicant No. 1 (Husband)', titleMr: 'अर्जदार क्र. १ (पतीचे तपशील)', color: 'text-blue-400' };
        if (hasDeceased) return { title: 'Applicant / Heir Particulars', titleMr: 'अर्जदार / कायदेशीर वारस तपशील', color: 'text-blue-400' };
        if (isNameChange || isAffidavit) return { title: 'Deponent Particulars', titleMr: 'प्रतिज्ञापत्र देणाराचे तपशील', color: 'text-blue-400' };
        if (isNotice) return { title: 'Client (Creditor)', titleMr: 'तक्रारदार / पक्षकार तपशील', color: 'text-blue-400' };
        if (isCommercial) return { title: 'First Party (Disclosing Entity)', titleMr: 'प्रथम पक्षकार', color: 'text-blue-400' };
        return { title: 'Party 1 Details', titleMr: 'पक्षकार १', color: 'text-blue-400' };
      case 'party2':
        if (hasDeceased) return { title: 'Deceased Person Particulars', titleMr: 'मयत व्यक्तीचे तपशील', color: 'text-rose-400' };
        if (isFamily) return { title: 'Applicant No. 2 (Wife)', titleMr: 'अर्जदार क्र. २ (पत्नीचे तपशील)', color: 'text-rose-400' };
        if (isNotice) return { title: 'Recipient (Debtor / Defaulter)', titleMr: 'नोटीस घेणारा (सामनेवाले)', color: 'text-rose-400' };
        if (isCommercial) return { title: 'Second Party (Receiving Entity)', titleMr: 'द्वितीय पक्षकार', color: 'text-rose-400' };
        return { title: 'Party 2 Details', titleMr: 'पक्षकार २', color: 'text-rose-400' };
      case 'marriage':
        return { title: 'Marriage & Cohabitation Facts', titleMr: 'विवाह व विभक्त तपशील', color: 'text-amber-400' };
      case 'terms':
        if (isFamily) return { title: 'Settlement & Alimony Terms', titleMr: 'समजोता व पोटगी अटी', color: 'text-emerald-400' };
        if (isNameChange) return { title: 'Name Change Specifics & Reason', titleMr: 'नाव बदल तपशील व कारण', color: 'text-emerald-400' };
        if (isCommercial) return { title: 'Agreement Scope & Covenants', titleMr: 'कराराच्या अटी व नियम', color: 'text-emerald-400' };
        if (isNotice) return { title: 'Claim Specifics & Cure Period', titleMr: 'थकबाकी व मुदत तपशील', color: 'text-emerald-400' };
        return { title: 'Case Particulars & Terms', titleMr: 'अटी, शर्ती व विशेष तपशील', color: 'text-emerald-400' };
      case 'general':
        return { title: 'General & Advocate Particulars', titleMr: 'वकील व सर्वसाधारण माहिती', color: 'text-slate-400' };
      default:
        // Format custom user-defined section keys cleanly
        const cleanTitle = groupKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return {
          title: cleanTitle,
          titleMr: groupKey,
          color: 'text-purple-400',
        };
    }
  };

  const renderField = (field: any) => {
    const value = facts[field.key] ?? (field.defaultValue ?? '');

    if (field.type === 'boolean') {
      return (
        <div key={field.key} className="flex items-center gap-2 py-1">
          <input
            type="checkbox"
            id={field.key}
            checked={Boolean(value)}
            onChange={(e) => handleFactChange(field.key, e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
          />
          <label htmlFor={field.key} className="text-xs text-slate-700 dark:text-slate-300 font-medium cursor-pointer select-none">
            {field.label} {field.labelMr && <span className="text-slate-500 dark:text-slate-400 font-marathi">({field.labelMr})</span>}
          </label>
        </div>
      );
    }

    if (field.type === 'select') {
      const opts = (field.options || []).map((opt: any) => {
        if (typeof opt === 'string') return { label: opt, value: opt };
        return opt;
      });

      return (
        <div key={field.key}>
          <label className="text-[11px] text-slate-600 dark:text-slate-400 block mb-1 font-medium">
            {field.label} {field.labelMr && <span className="text-slate-500 dark:text-slate-500 font-marathi">({field.labelMr})</span>}
            {field.required && <span className="text-rose-500 ml-0.5">*</span>}
          </label>
          <select
            value={value}
            onChange={(e) => handleFactChange(field.key, e.target.value)}
            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 font-marathi"
          >
            {(!value || opts.length === 0) && <option value="">-- पर्याय निवडा (Select Option) --</option>}
            {opts.map((opt: any, oIdx: number) => (
              <option key={opt.value || oIdx} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === 'textarea') {
      return (
        <div key={field.key}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
              {field.label} {field.labelMr && <span className="text-slate-500 dark:text-slate-500 font-marathi">({field.labelMr})</span>}
              {field.required && <span className="text-rose-500 ml-0.5">*</span>}
            </label>
            <button
              type="button"
              onClick={() => handleTransliterateField(field.key, value)}
              disabled={transliteratingField === field.key || !value}
              className="text-[11px] px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 disabled:opacity-40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 rounded font-bold font-marathi shadow-sm transition flex items-center gap-1 cursor-pointer"
              title="Convert English text to Marathi Devanagari (मराठीत रुपांतर करा)"
            >
              {transliteratingField === field.key ? '...' : 'म'}
            </button>
          </div>
          <textarea
            rows={2}
            value={value}
            onChange={(e) => handleFactChange(field.key, e.target.value)}
            placeholder={field.placeholder || ''}
            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-1 focus:ring-indigo-500 font-marathi"
          />
        </div>
      );
    }

    if (field.type === 'date') {
      const isoVal = formatToYYYYMMDD(String(value || ''));
      const displayVal = formatToDDMMYYYY(String(value || ''));

      return (
        <div key={field.key}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
              {field.label} {field.labelMr && <span className="text-slate-500 dark:text-slate-500 font-marathi">({field.labelMr})</span>}
              {field.required && <span className="text-rose-500 ml-0.5">*</span>}
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleTransliterateField(field.key, value)}
                disabled={transliteratingField === field.key || !value}
                className="text-[11px] px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 disabled:opacity-40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 rounded font-bold font-marathi shadow-sm transition flex items-center gap-1 cursor-pointer"
                title="Convert Date text to Marathi Devanagari numerals (मराठीत रुपांतर करा)"
              >
                {transliteratingField === field.key ? '...' : 'म'}
              </button>
              <span className="text-[9px] text-indigo-600 dark:text-indigo-400 font-mono">DD/MM/YYYY</span>
            </div>
          </div>
          <div className="relative flex items-center">
            <input
              type="text"
              value={displayVal}
              onChange={(e) => handleFactChange(field.key, e.target.value)}
              placeholder="DD/MM/YYYY (उदा. 03/09/2026)"
              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-1 focus:ring-indigo-500 font-marathi"
            />
            <div className="absolute right-2.5 pointer-events-none text-slate-400">
              <Calendar className="w-3.5 h-3.5" />
            </div>
            <input
              type="date"
              value={isoVal}
              onChange={(e) => {
                if (e.target.value) {
                  const formatted = formatToDDMMYYYY(e.target.value);
                  handleFactChange(field.key, formatted);
                }
              }}
              className="absolute right-1 w-7 h-7 opacity-0 cursor-pointer"
              title="Select Date from Calendar"
            />
          </div>
        </div>
      );
    }

    return (
      <div key={field.key}>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
            {field.label} {field.labelMr && <span className="text-slate-500 dark:text-slate-500 font-marathi">({field.labelMr})</span>}
            {field.required && <span className="text-rose-500 ml-0.5">*</span>}
          </label>
          <button
            type="button"
            onClick={() => handleTransliterateField(field.key, value)}
            disabled={transliteratingField === field.key || !value}
            className="text-[11px] px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 disabled:opacity-40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 rounded font-bold font-marathi shadow-sm transition flex items-center gap-1 cursor-pointer"
            title="Convert English text to Marathi Devanagari (मराठीत रुपांतर करा)"
          >
            {transliteratingField === field.key ? '...' : 'म'}
          </button>
        </div>
        <input
          type={field.type === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(e) => handleFactChange(field.key, e.target.value)}
          placeholder={field.placeholder || ''}
          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-1 focus:ring-indigo-500 font-marathi"
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
      {/* Top Navbar */}
      <header className="no-print h-16 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur px-4 lg:px-6 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <Scale className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-slate-900 dark:text-white tracking-tight text-base sm:text-lg">JurisCopilot</h1>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-medium">
                Legal AI Copilot
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
              Advocate Studio & Intelligent Document Drafter
            </p>
          </div>
        </div>

        {/* Center: Template Picker */}
        <div className="flex items-center gap-2 max-w-xs sm:max-w-md w-full mx-2">
          <div className="relative w-full">
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 text-slate-900 dark:text-white text-xs sm:text-sm rounded-xl py-2 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none font-medium truncate transition cursor-pointer"
            >
              {templates.map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                  {tmpl.title} {tmpl.language === 'mr' ? ' [मराठी]' : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* View Mode Toggle (Mobile / Desktop) */}
          <div className="hidden md:flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-300 dark:border-slate-700 text-xs">
            <button
              onClick={() => setViewMode('split')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                viewMode === 'split' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Split View
            </button>
            <button
              onClick={() => setViewMode('form')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                viewMode === 'form' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Form Wizard
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                viewMode === 'preview' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Draft Preview
            </button>
          </div>

          {/* Quick AI Extract Notes */}
          <button
            onClick={() => setIsNotesModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-600/20 dark:hover:bg-indigo-600/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/50 rounded-xl text-xs sm:text-sm font-medium transition shadow-sm"
            title="Paste client notes to auto-populate draft"
          >
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="hidden sm:inline">Extract Notes</span>
          </button>

          {/* Export Word (.docx) */}
          <button
            onClick={handleExportDocx}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-medium transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
            title="Download court-formatted Word document (.docx)"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export .docx</span>
          </button>

          {/* Print / PDF */}
          <button
            onClick={handlePrint}
            className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 transition"
            title="Print or Save as PDF"
          >
            <Printer className="w-4 h-4" />
          </button>

          {/* Template Manager */}
          <button
            onClick={() => setIsTemplateManagerOpen(true)}
            className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 transition"
            title="Manage, Create, Edit & Delete Legal Templates"
          >
            <FolderEdit className="w-4 h-4" />
          </button>

          {/* Theme Mode Switcher */}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 transition"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600" />
              )}
            </button>
          )}

          {/* Settings */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 transition"
            title="Configure Gemini API Key & Firm Profile"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Drafting Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Client & Case Facts Wizard */}
        {(viewMode === 'split' || viewMode === 'form') && (
          <div
            style={viewMode === 'split' ? { width: `${formPaneWidth}px` } : undefined}
            className={`no-print border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-y-auto ${
              viewMode === 'form' ? 'w-full max-w-4xl mx-auto' : 'shrink-0'
            }`}
          >
            <div className="p-4 sm:p-5 space-y-6">
              {/* Active Template Header Info & Multi-Document Draft Manager */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-gradient-to-br dark:from-slate-800/80 dark:to-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-semibold tracking-wider text-indigo-600 dark:text-indigo-400">
                    Active Template
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium">
                    {activeTemplate?.category.toUpperCase()}
                  </span>
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                  {activeTemplate?.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                  {activeTemplate?.description}
                </p>

                {/* Multi-Draft Session Controls */}
                <div className="pt-2.5 border-t border-slate-200 dark:border-slate-700/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      Document Drafts ({currentTemplateDrafts.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsNewDraftModalOpen(true)}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow transition cursor-pointer"
                      title="Create a new document draft from this template"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> + New Document
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <select
                      value={activeDraftId}
                      onChange={(e) => switchDraft(e.target.value)}
                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200 text-xs rounded-xl py-1.5 px-2.5 focus:outline-none focus:border-indigo-500 font-medium truncate cursor-pointer font-marathi"
                    >
                      {currentTemplateDrafts.map((d, index) => (
                        <option key={d.id} value={d.id}>
                          {d.name || `Draft #${index + 1}`}
                        </option>
                      ))}
                    </select>

                    {currentTemplateDrafts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteDraft(activeDraftId)}
                        className="p-1.5 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-300 dark:border-slate-700/80 rounded-xl transition cursor-pointer"
                        title="Delete current document draft"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Form Input Groups */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Client & Case Particulars
                  </h4>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Updates draft automatically</span>
                </div>

                {/* Dynamic Form Input Groups based on activeTemplate.fields */}
                {fieldGroups.length > 0 ? (
                  fieldGroups.map((group) => {
                    const header = getGroupHeader(group.key);
                    return (
                      <div
                        key={group.key}
                        className="space-y-3 p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800"
                      >
                        <div className="flex items-center justify-between">
                          <h5 className={`text-xs font-semibold ${header.color}`}>
                            {header.title}
                          </h5>
                          {header.titleMr && (
                            <span className="text-[11px] text-slate-500 font-marathi">
                              {header.titleMr}
                            </span>
                          )}
                        </div>
                        <div className="space-y-2.5">
                          {group.fields.map((field: any) => renderField(field))}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/40 text-center text-xs text-slate-500 dark:text-slate-400">
                    No custom fields required for this template.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Draggable Splitter handle for Form Wizard vs Draft Preview */}
        {viewMode === 'split' && (
          <div
            onMouseDown={handleMouseDownFormResize}
            className="no-print w-2 hover:w-2 bg-slate-800 hover:bg-indigo-500/50 cursor-col-resize z-20 flex items-center justify-center group transition-colors shrink-0"
            title="Drag left/right to adjust Form Wizard pane width"
          >
            <div className="w-0.5 h-8 bg-slate-600 group-hover:bg-indigo-300 rounded-full" />
          </div>
        )}

        {/* Center / Right Column: Live Legal Document Draft & Editor */}
        {(viewMode === 'split' || viewMode === 'preview') && (
          <div className="flex-1 flex flex-col bg-slate-100 dark:bg-slate-950 overflow-hidden relative">
            {/* Document Action Toolbar */}
            <div className="no-print border-b border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[180px] sm:max-w-none">
                  {activeTemplate?.title || documentTitle}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hidden sm:inline border border-slate-200 dark:border-slate-700">
                  {documentBody.length} chars
                </span>

                {/* View Mode Toggle: Visual Rich Text vs Code View */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-300 dark:border-slate-700 ml-2">
                  <button
                    onClick={() => {
                      if (docEditorMode === 'code' && docRichEditorRef.current) {
                        docRichEditorRef.current.innerHTML = formatDocToHtml(documentBody);
                      }
                      setDocEditorMode('visual');
                    }}
                    className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded font-medium transition ${
                      docEditorMode === 'visual'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    title="Render document draft as Visual Rich Text (HTML formatted)"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Visual Rich Text</span>
                  </button>
                  <button
                    onClick={() => {
                      if (docEditorMode === 'visual' && docRichEditorRef.current) {
                        setDocumentBody(docRichEditorRef.current.innerHTML);
                      }
                      setDocEditorMode('code');
                    }}
                    className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded font-medium transition ${
                      docEditorMode === 'code'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    title="View and edit raw HTML tags directly"
                  >
                    <Code className="w-3 h-3" />
                    <span>Code View</span>
                  </button>
                </div>

                {/* Paper Size Selector: Legal (8.5x14) vs A4 (8.27x11.69) */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-300 dark:border-slate-700 ml-1.5">
                  <button
                    onClick={() => setPaperSize('legal')}
                    className={`text-[11px] px-2.5 py-1 rounded font-medium transition ${
                      paperSize === 'legal'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    title="Legal Paper (8.5 x 14 in) - Standard Indian District & High Court Petitions"
                  >
                    Legal (8.5" × 14")
                  </button>
                  <button
                    onClick={() => setPaperSize('a4')}
                    className={`text-[11px] px-2.5 py-1 rounded font-medium transition ${
                      paperSize === 'a4'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    title="A4 Paper (8.27 x 11.69 in) - Standard Notices & Agreements"
                  >
                    A4 (8.27" × 11.69")
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Visual Rich Text Formatting Controls */}
                {docEditorMode === 'visual' && (
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg border border-slate-300 dark:border-slate-700/80 mr-2">
                    <button
                      onClick={() => handleDocExecCommand('bold')}
                      className="p-1 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                      title="Bold Selection (Ctrl+B)"
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDocExecCommand('italic')}
                      className="p-1 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                      title="Italic Selection (Ctrl+I)"
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDocExecCommand('underline')}
                      className="p-1 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                      title="Underline Selection (Ctrl+U)"
                    >
                      <Underline className="w-3.5 h-3.5" />
                    </button>
                    {/* Format Painter (🎨) */}
                    <button
                      type="button"
                      onClick={() => {
                        if (copiedFormat) {
                          const selStr = window.getSelection()?.toString().trim();
                          if (selStr && selStr.length > 0) {
                            handleDocExecCommand('applyFormat');
                          } else {
                            setCopiedFormat(null);
                            setIsFormatSticky(false);
                          }
                        } else {
                          handleDocExecCommand('copyFormat', 'single');
                        }
                      }}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        handleDocExecCommand('copyFormat', 'sticky');
                      }}
                      className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-medium transition cursor-pointer select-none ${
                        copiedFormat
                          ? isFormatSticky
                            ? 'bg-amber-400 text-black font-extrabold ring-2 ring-amber-200 shadow-md'
                            : 'bg-amber-500 text-black font-bold ring-2 ring-amber-300 animate-pulse'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-700'
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
                    <div className="h-3 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />
                    <button
                      onClick={() => handleDocExecCommand('align', 'left')}
                      className="p-1 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                      title="Align Left"
                    >
                      <AlignLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDocExecCommand('align', 'center')}
                      className="p-1 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                      title="Align Center"
                    >
                      <AlignCenter className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDocExecCommand('align', 'right')}
                      className="p-1 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                      title="Align Right"
                    >
                      <AlignRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDocExecCommand('align', 'justify')}
                      className="p-1 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                      title="Align Justify"
                    >
                      <AlignJustify className="w-3.5 h-3.5" />
                    </button>
                    <div className="h-3 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />

                    {/* Manual Font Size Input in pt */}
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 mr-1" title="Type exact Font Size in pt (e.g. 12, 14, 18)">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Size:</span>
                      <input
                        type="number"
                        min="6"
                        max="96"
                        step="0.5"
                        defaultValue="12"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleDocExecCommand('fontSizePt', (e.target as HTMLInputElement).value);
                          }
                        }}
                        onBlur={(e) => handleDocExecCommand('fontSizePt', e.target.value)}
                        className="w-9 bg-transparent text-slate-900 dark:text-slate-200 text-xs font-semibold focus:outline-none text-center"
                      />
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">pt</span>
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            const input = e.target.previousElementSibling?.previousElementSibling as HTMLInputElement;
                            if (input) input.value = e.target.value;
                            handleDocExecCommand('fontSizePt', e.target.value);
                          }
                        }}
                        className="bg-transparent text-slate-500 dark:text-slate-400 text-[10px] focus:outline-none cursor-pointer border-l border-slate-300 dark:border-slate-700 pl-0.5"
                        defaultValue=""
                      >
                        <option value="" disabled>▾</option>
                        <option value="10">10 pt</option>
                        <option value="11">11 pt</option>
                        <option value="12">12 pt (Court)</option>
                        <option value="14">14 pt</option>
                        <option value="16">16 pt</option>
                        <option value="18">18 pt</option>
                        <option value="24">24 pt</option>
                      </select>
                    </div>

                    {/* Font Size Increase / Decrease buttons */}
                    <button
                      onClick={() => handleDocExecCommand('increaseFontSize')}
                      className="px-1.5 py-0.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded transition"
                      title="Increase Font Size +1pt (A+)"
                    >
                      A+
                    </button>
                    <button
                      onClick={() => handleDocExecCommand('decreaseFontSize')}
                      className="px-1.5 py-0.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded transition"
                      title="Decrease Font Size -1pt (A-)"
                    >
                      A-
                    </button>

                    <div className="h-3 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />

                    {/* Manual Line Spacing Input */}
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 mr-1" title="Type exact Line Spacing (e.g. 1.0, 1.2, 1.5, 1.6, 2.0)">
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
                            handleDocExecCommand('lineSpacing', (e.target as HTMLInputElement).value);
                          }
                        }}
                        onBlur={(e) => handleDocExecCommand('lineSpacing', e.target.value)}
                        className="w-9 bg-transparent text-slate-900 dark:text-slate-200 text-xs font-semibold focus:outline-none text-center"
                      />
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">x</span>
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            const input = e.target.previousElementSibling?.previousElementSibling as HTMLInputElement;
                            if (input) input.value = e.target.value;
                            handleDocExecCommand('lineSpacing', e.target.value);
                          }
                        }}
                        className="bg-transparent text-slate-500 dark:text-slate-400 text-[10px] focus:outline-none cursor-pointer border-l border-slate-300 dark:border-slate-700 pl-0.5"
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
                      onClick={() => handleDocExecCommand('outdent')}
                      className="p-1 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                      title="Decrease Indent / Outdent Left"
                    >
                      <Outdent className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDocExecCommand('indent')}
                      className="p-1 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                      title="Increase Indent / Tab Right"
                    >
                      <Indent className="w-3.5 h-3.5" />
                    </button>

                    {/* Insert Table */}
                    <button
                      onClick={() => handleDocExecCommand('insertTable')}
                      className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/80 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 rounded font-medium transition"
                      title="Insert Legal Table into Document"
                    >
                      <Table className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      <span>Table</span>
                    </button>

                    <div className="h-3 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />
                    <button
                      onClick={() => handleDocExecCommand('insertPageBreak')}
                      className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700/60 rounded font-medium transition"
                      title="Insert Page Break (Forces Page Break in Screen Preview, Print & Word Exporter)"
                    >
                      <Scissors className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                      <span>Page Break</span>
                    </button>
                    <button
                      onClick={() => handleTranslateDocument()}
                      disabled={isTranslating}
                      className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900 disabled:opacity-50 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700/60 rounded font-medium transition"
                      title="Translate active document draft between English and Marathi (Devanagari)"
                    >
                      <Languages className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                      <span>{isTranslating ? 'Translating...' : 'Translate (EN/MR)'}</span>
                    </button>
                  </div>
                )}

                {/* Standard Clauses Quick Insert */}
                {activeTemplate?.standardClauses && activeTemplate.standardClauses.length > 0 && (
                  <div className="hidden lg:flex items-center gap-1.5">
                    {activeTemplate.standardClauses.map((clause) => (
                      <button
                        key={clause.id}
                        onClick={() => {
                          const textToInsert = clause.contentMr || clause.content;
                          if (docEditorMode === 'visual' && docRichEditorRef.current) {
                            docRichEditorRef.current.focus();
                            document.execCommand('insertHTML', false, `<p>${textToInsert}</p>`);
                            setDocumentBody(docRichEditorRef.current.innerHTML);
                          } else {
                            setDocumentBody((prev) => `${prev}\n\n${textToInsert}`);
                          }
                        }}
                        className="text-[11px] px-2 py-0.5 rounded bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-300 border border-slate-300 dark:border-slate-700 transition flex items-center gap-1"
                        title={clause.content}
                      >
                        <PlusCircle className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                        {clause.titleMr || clause.title}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Document Content View */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col items-center bg-slate-200/80 dark:bg-slate-950/70">
              <div className={`w-full max-w-3xl document-page paper-${paperSize} rounded-xl border border-slate-300/40 relative h-auto bg-white text-slate-900 font-marathi mb-16 shadow-2xl shrink-0`}>
                
                {/* Dynamic Natural Page Break Indicators (simple dashed line) */}
                {docEditorMode === 'visual' && naturalPageBreaks.map((nb, idx) => (
                  <div
                    key={`nat-break-${idx}`}
                    className="no-print natural-page-indicator"
                    style={{ top: `${nb.y}px` }}
                  >
                    <div className="natural-page-line" />
                  </div>
                ))}

                {docEditorMode === 'visual' ? (
                  <div
                    ref={docRichEditorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onMouseUp={() => {
                      if (isFormatSticky && copiedFormat) {
                        const selStr = window.getSelection()?.toString().trim();
                        if (selStr && selStr.length > 0) {
                          handleDocExecCommand('applyFormat');
                        }
                      }
                    }}
                    onInput={() => {
                      if (docRichEditorRef.current) {
                        isSelfEditingRef.current = true;
                        setDocumentBody(docRichEditorRef.current.innerHTML);
                      }
                    }}
                    onBlur={() => {
                      if (docRichEditorRef.current) {
                        isSelfEditingRef.current = true;
                        setDocumentBody(docRichEditorRef.current.innerHTML);
                      }
                    }}
                    className="w-full h-auto min-h-[850px] outline-none border-none bg-transparent text-slate-900 font-marathi text-sm md:text-base leading-relaxed selection:bg-indigo-100 p-0 overflow-visible"
                  />
                ) : (
                  <textarea
                    value={documentBody}
                    onChange={(e) => setDocumentBody(e.target.value)}
                    className="w-full h-auto min-h-[850px] resize-none outline-none border-none bg-transparent text-slate-900 font-mono text-xs md:text-sm leading-relaxed selection:bg-indigo-100 p-0 overflow-visible"
                    placeholder="Raw legal document draft code will appear here..."
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <ClientNotesModal
        isOpen={isNotesModalOpen}
        onClose={() => setIsNotesModalOpen(false)}
        onExtract={handleExtractNotes}
        isLoading={isExtracting}
        activeTemplate={activeTemplate}
        facts={facts}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKey={apiKey}
        onSaveApiKey={onSaveApiKey}
        advocateName={advocateName}
        onSaveAdvocateName={onSaveAdvocateName}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <TemplateManagerModal
        isOpen={isTemplateManagerOpen}
        onClose={() => setIsTemplateManagerOpen(false)}
        templates={templates}
        onTemplatesChanged={reloadTemplates}
        onSelectTemplate={(tmplId) => setSelectedTemplateId(tmplId)}
      />

      {/* NEW DOCUMENT DRAFT MODAL */}
      {isNewDraftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Create New Document Draft
              </h3>
              <button
                type="button"
                onClick={() => setIsNewDraftModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              Select how you want to initialize your new document draft for <strong className="text-indigo-600 dark:text-indigo-300">{activeTemplate?.title}</strong>:
            </p>

            <div className="space-y-3">
              {/* Option A: Keep current inputs / Duplicate */}
              <button
                type="button"
                onClick={() => handleCreateNewDraft('duplicate')}
                className="w-full text-left p-3.5 bg-slate-50 hover:bg-indigo-50 dark:bg-slate-950 dark:hover:bg-indigo-950/40 border border-slate-200 hover:border-indigo-500 dark:border-slate-800 dark:hover:border-indigo-600/80 rounded-xl transition group flex items-start gap-3 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-700/60 flex items-center justify-center text-indigo-600 dark:text-indigo-300 shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition">
                  <Copy className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-white">
                    Keep Current Inputs (Duplicate Draft)
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    Spawns a new document copy keeping all entered client details, addresses, and court facts intact. Great for related parties or similar case filings.
                  </p>
                </div>
              </button>

              {/* Option B: Start fresh */}
              <button
                type="button"
                onClick={() => handleCreateNewDraft('fresh')}
                className="w-full text-left p-3.5 bg-slate-50 hover:bg-purple-50 dark:bg-slate-950 dark:hover:bg-purple-950/40 border border-slate-200 hover:border-purple-500 dark:border-slate-800 dark:hover:border-purple-600/80 rounded-xl transition group flex items-start gap-3 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-700/60 flex items-center justify-center text-purple-600 dark:text-purple-300 shrink-0 group-hover:bg-purple-600 group-hover:text-white transition">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-slate-200 group-hover:text-white">
                    Start Fresh Draft (Reset Inputs)
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Resets all client form inputs back to template defaults to start drafting for a brand new client case.
                  </p>
                </div>
              </button>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsNewDraftModalOpen(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

