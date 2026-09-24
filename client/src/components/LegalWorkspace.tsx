import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useCopilotReadable, useCopilotAction } from '@copilotkit/react-core';
import { CopilotTextarea } from '@copilotkit/react-textarea';
import '@copilotkit/react-textarea/styles.css';
import { useCopilotChatSuggestions } from '@copilotkit/react-ui';
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
  Monitor,
  Tablet,
  Smartphone,
  Sliders,
  PanelLeft,
  Menu,
  Wand2,
  Eraser,
} from 'lucide-react';
import { LegalTemplate, ClientFacts, ComplianceCheckResult, DocumentDraft } from '../types';
import { SettingsModal } from './SettingsModal';
import { ClientNotesModal } from './ClientNotesModal';
import { TemplateManagerModal } from './TemplateManagerModal';
import { FormWizardModal } from './FormWizardModal';
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

  // Dedicated Device Layout Mode state ('auto' | 'desktop' | 'tablet' | 'mobile')
  const [deviceMode, setDeviceMode] = useState<'auto' | 'desktop' | 'tablet' | 'mobile'>(() => {
    return (localStorage.getItem('juris_device_mode') as any) || 'auto';
  });

  // Track window dimensions for auto responsiveness
  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem('juris_device_mode', deviceMode);
  }, [deviceMode]);

  // Compute effective layout mode
  const effectiveDevice = useMemo(() => {
    if (deviceMode !== 'auto') return deviceMode;
    if (windowWidth < 768) return 'mobile';
    if (windowWidth < 1024) return 'tablet';
    return 'desktop';
  }, [deviceMode, windowWidth]);

  // Active tab for Tablet/Mobile touch view ('form' | 'canvas')
  const [tabletTab, setTabletTab] = useState<'form' | 'canvas'>('canvas');

  // Slide-over Form Drawer state for Tablet/Mobile modes
  const [isTabletDrawerOpen, setIsTabletDrawerOpen] = useState<boolean>(false);

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

  const replacePlaceholdersInHtml = (
    htmlText: string,
    currentFacts: ClientFacts,
    tmpl?: LegalTemplate
  ): string => {
    if (!htmlText) return '';
    let result = htmlText;

    const factsMap: Record<string, string> = {};
    if (currentFacts) {
      for (const [k, v] of Object.entries(currentFacts)) {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          factsMap[k] = String(v);
        }
      }
    }

    const effTmpl = tmpl || activeTemplate;

    // Default court fallbacks
    if (!factsMap.courtName) {
      factsMap.courtName = currentFacts?.courtName || effTmpl?.defaultCourt || 'मे. दिवाणी न्यायाधीश वरिष्ठ स्तर';
    }
    if (!factsMap.courtCity) {
      factsMap.courtCity = currentFacts?.courtCity || 'अमळनेर';
    }

    for (const [key, value] of Object.entries(factsMap)) {
      if (!key || typeof value !== 'string') continue;
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const charPattern = key.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(?:\\s*<[^>]*>)*');

      // Match {key} even if separated by inner HTML tags, HTML entities (&lbrace; &#123;) or styling
      const tagRegex = new RegExp(`(?:\\{|&lbrace;|&#123;|&#x7b;)(?:\\s*<[^>]*>)*\\s*${charPattern}\\s*(?:\\s*<[^>]*>)*(?:\\}|&rbrace;|&#125;|&#x7d;)`, 'gi');
      result = result.replace(tagRegex, value);

      const literalRegex = new RegExp(`\\{${escapedKey}\\}`, 'gi');
      result = result.replace(literalRegex, value);
    }

    return result;
  };

  const formatDocToHtml = (rawText: string, tmpl?: LegalTemplate): string => {
    if (!rawText) return '';
    let html = unescapeAllEntities(rawText);

    // Live replace all placeholders in HTML (courtName, courtCity, etc.)
    html = replacePlaceholdersInHtml(html, facts, tmpl);

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
      const copilotContainer =
        document.querySelector('.copilotKitSidebar') ||
        document.querySelector('.copilotKitWindow') ||
        document.body;
      if (!copilotContainer) return;

      const containerNodes = copilotContainer.querySelectorAll(
        '.copilotKitMessage, [class*="Message"], [class*="message"], code, pre'
      );
      containerNodes.forEach((node) => {
        let rawContent = node.innerHTML || node.textContent || '';
        rawContent = unescapeAllEntities(rawContent);

        if (rawContent.includes('[REVISED_DOCUMENT_START]') && rawContent.includes('[REVISED_DOCUMENT_END]')) {
          const match = rawContent.match(/\[REVISED_DOCUMENT_START\]([\s\S]*?)\[REVISED_DOCUMENT_END\]/);
          if (match && match[1]) {
            let revisedHtml = match[1].trim();
            revisedHtml = revisedHtml.replace(/^<code>|<\/code>$/gi, '').trim();
            revisedHtml = unescapeAllEntities(revisedHtml);

            // Clean the giant HTML block from the visible chat to prevent re-triggering and improve UI
            const updatedInnerHtml = node.innerHTML.replace(/\[REVISED_DOCUMENT_START\][\s\S]*?\[REVISED_DOCUMENT_END\]/g, '<div style="margin: 10px 0; padding: 10px; background: #e0f2fe; border-left: 4px solid #0284c7; border-radius: 4px; color: #0369a1; font-size: 13px;"><i>✅ Document updated directly in the editor</i></div>');
            node.innerHTML = updatedInnerHtml;

            setDocumentBody((prev) => {
              if (prev !== revisedHtml) {
                console.log('✅ Auto-synchronized formatted document draft from Copilot chat into editor!');
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
            // Use execCommand fontSize (1-7 scale) as a marker, then replace with exact pt size
            document.execCommand('fontSize', false, '7');
            const editor = docRichEditorRef.current;
            if (editor) {
              // Find all font elements with size="7" just inserted and replace with span style
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
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const isSwitchingRef = useRef<boolean>(false);

  const saveDraftToBackend = (draft: DocumentDraft) => {
    fetch('/api/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    }).catch((e) => console.error('Failed to save draft to backend:', e));
  };

  const deleteDraftFromBackend = (id: string) => {
    fetch(`/api/drafts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch((e) => console.error('Failed to delete draft from backend:', e));
  };

  // Sync server & telegram drafts live
  useEffect(() => {
    const syncServerDrafts = () => {
      fetch('/api/drafts')
        .then((res) => res.json())
        .then((serverDrafts: DocumentDraft[]) => {
          if (Array.isArray(serverDrafts) && serverDrafts.length > 0) {
            setDrafts((prev) => {
              const existingMap = new Map(prev.map((d) => [d.id, d]));
              let hasChanges = false;
              serverDrafts.forEach((sd) => {
                if (!existingMap.has(sd.id)) {
                  existingMap.set(sd.id, sd);
                  hasChanges = true;
                }
              });
              if (!hasChanges) return prev;
              return Array.from(existingMap.values());
            });
          }
        })
        .catch(() => {});
    };

    syncServerDrafts();
    const timer = setInterval(syncServerDrafts, 5000);
    return () => clearInterval(timer);
  }, []);

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

  const switchDraft = (draftId: string, targetTmpl?: LegalTemplate) => {
    const target = drafts.find((d) => d.id === draftId);
    if (target) {
      isSwitchingRef.current = true;
      setActiveDraftId(target.id);
      setFacts(target.facts || {});

      const tmpl = targetTmpl || templates.find((t) => t.id === target.templateId) || activeTemplate;
      let bodyToSet = target.documentBody || '';
      if ((!bodyToSet || (tmpl && target.templateId !== tmpl.id)) && tmpl) {
        bodyToSet = replacePlaceholdersInHtml(tmpl.templateText || '', target.facts || {}, tmpl);
      }

      setDocumentBody(bodyToSet);

      if (docRichEditorRef.current && docEditorMode === 'visual') {
        docRichEditorRef.current.innerHTML = formatDocToHtml(bodyToSet, tmpl);
      }

      setTimeout(() => {
        isSwitchingRef.current = false;
      }, 100);
    }
  };

  // Ensure active draft exists when selected template changes
  useEffect(() => {
    if (!selectedTemplateId || templates.length === 0) return;

    const targetTemplate = templates.find((t) => t.id === selectedTemplateId);
    if (!targetTemplate) return;

    const existingForTemplate = drafts.filter((d) => d.templateId === selectedTemplateId);

    if (existingForTemplate.length === 0) {
      isSwitchingRef.current = true;
      const newId = `draft_${Date.now()}`;

      // Initialize fresh facts for new template
      const freshFacts: ClientFacts = {};
      if (facts.advocateName) freshFacts.advocateName = facts.advocateName;
      if (facts.advocateAddress) freshFacts.advocateAddress = facts.advocateAddress;
      if (facts.advocateParty1) freshFacts.advocateParty1 = facts.advocateParty1;
      if (facts.courtCity) freshFacts.courtCity = facts.courtCity;
      if (facts.courtName) freshFacts.courtName = facts.courtName;

      if (targetTemplate.fields) {
        targetTemplate.fields.forEach((f) => {
          (freshFacts as any)[f.key] = f.defaultValue !== undefined ? f.defaultValue : '';
        });
      }

      const partyName = getDraftPartyName(freshFacts, targetTemplate.fields);
      const initialBody = replacePlaceholdersInHtml(targetTemplate.templateText || '', freshFacts, targetTemplate);
      const initialDraft: DocumentDraft = {
        id: newId,
        name: partyName ? `Draft #1 (${partyName})` : `Draft #1`,
        templateId: selectedTemplateId,
        facts: freshFacts,
        documentBody: initialBody,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setDrafts((prev) => [...prev, initialDraft]);
      setActiveDraftId(newId);
      setFacts(freshFacts);
      setDocumentBody(initialBody);

      if (docRichEditorRef.current && docEditorMode === 'visual') {
        docRichEditorRef.current.innerHTML = formatDocToHtml(initialBody, targetTemplate);
      }

      saveDraftToBackend(initialDraft);

      setTimeout(() => {
        isSwitchingRef.current = false;
      }, 100);
    } else {
      const activeForNewTemplate = existingForTemplate.find((d) => d.id === activeDraftId) || existingForTemplate[0];
      switchDraft(activeForNewTemplate.id, targetTemplate);
    }
  }, [selectedTemplateId, templates]);

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
    if (!activeDraftId || isSwitchingRef.current) return;
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

          const updatedDraft: DocumentDraft = {
            ...d,
            name: displayName,
            facts: cleanFacts,
            documentBody,
            updatedAt: new Date().toISOString(),
          };

          saveDraftToBackend(updatedDraft);
          return updatedDraft;
        }
        return d;
      })
    );
  }, [facts, documentBody, activeDraftId, activeTemplate]);

  const handleCreateNewDraft = (
    mode: 'duplicate' | 'fresh' = 'fresh',
    customPartyName?: string,
    initialBodyText?: string
  ) => {
    if (!selectedTemplateId || !activeTemplate) return;

    isSwitchingRef.current = true;
    const count = currentTemplateDrafts.length + 1;
    const newId = `draft_${Date.now()}`;

    let newFacts: ClientFacts;
    if (mode === 'duplicate') {
      newFacts = { ...facts };
    } else {
      const freshFacts: ClientFacts = {};
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
      if (customPartyName) {
        freshFacts.party1Name = customPartyName;
      }
      newFacts = freshFacts;
    }

    const partyName = customPartyName || getDraftPartyName(newFacts, activeTemplate.fields);
    const displayName = partyName ? `Draft #${count} (${partyName})` : `Draft #${count}`;

    const bodyToUse =
      initialBodyText !== undefined && initialBodyText !== null && initialBodyText.trim().length > 0
        ? initialBodyText
        : replacePlaceholdersInHtml(activeTemplate.templateText || '', newFacts);

    const newDraft: DocumentDraft = {
      id: newId,
      name: displayName,
      templateId: selectedTemplateId,
      facts: newFacts,
      documentBody: bodyToUse,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setDrafts((prev) => [...prev, newDraft]);
    setActiveDraftId(newId);
    setFacts(newFacts);
    setDocumentBody(bodyToUse);
    saveDraftToBackend(newDraft);
    setIsNewDraftModalOpen(false);

    setTimeout(() => {
      isSwitchingRef.current = false;
    }, 50);
  };

  const handleDeleteDraft = (draftId: string) => {
    const remaining = drafts.filter((d) => d.id !== draftId);
    setDrafts(remaining);
    deleteDraftFromBackend(draftId);

    const remainingForTemplate = remaining.filter((d) => d.templateId === selectedTemplateId);
    if (remainingForTemplate.length > 0) {
      const next = remainingForTemplate[remainingForTemplate.length - 1];
      switchDraft(next.id);
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

  // Audit compliance & render initial document body ONLY IF body is empty
  useEffect(() => {
    const checkComplianceAndInitialRender = async () => {
      if (!selectedTemplateId) return;
      try {
        const res = await fetch('/api/documents/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId: selectedTemplateId, facts }),
        });
        if (res.ok) {
          const data = await res.json();
          setCompliance(data.compliance);
          setDocumentBody((prev) => {
            if (!prev || !prev.trim()) {
              return replacePlaceholdersInHtml(data.text || '', facts);
            }
            return prev;
          });
        }
      } catch (err) {
        console.error('Failed to audit compliance:', err);
      }
    };
    checkComplianceAndInitialRender();
  }, [selectedTemplateId, facts]);

  // Keep documentTitle in sync with activeTemplate title
  useEffect(() => {
    if (activeTemplate?.title) {
      setDocumentTitle(activeTemplate.title);
    }
  }, [activeTemplate]);

  // 1. Give the Copilot context about the active legal document and client facts
  // NOTE: documentBody is trimmed to 8000 chars to prevent oversized context causing Gemini token errors
  useCopilotReadable({
    description: 'The active legal document draft, including template title, category, language, and current body text.',
    value: {
      templateId: selectedTemplateId,
      templateTitle: activeTemplate?.title || documentTitle,
      title: activeTemplate?.title || documentTitle,
      category: activeTemplate?.category,
      language: activeTemplate?.language,
      documentBody: documentBody ? documentBody.substring(0, 8000) : '',
      body: documentBody ? documentBody.substring(0, 8000) : '',
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

  // NOTE: apiKey is already passed via CopilotKit headers prop in App.tsx (x-gemini-api-key).
  // We also expose it in readable so the backend can extract it from the request body.
  useCopilotReadable({
    description: 'Gemini API key for AI Copilot chat service',
    value: { apiKey },
  });

  // 2. Register frontend actions the Copilot can perform directly on the UI
  useCopilotAction({
    name: 'createNewDraft',
    description: 'Creates a new draft within the active template for a client/party and immediately displays it in Split View / Draft View.',
    parameters: [
      {
        name: 'partyName',
        type: 'string',
        description: 'Primary party or complainant/applicant name for the new draft (e.g. Amit Mahajan)',
      },
      {
        name: 'documentText',
        type: 'string',
        description: 'Optional initial revised text or content for the new draft',
      },
    ],
    handler: async ({ partyName, documentText }) => {
      handleCreateNewDraft('fresh', partyName, documentText);
      return `New draft created and displayed in Split View / Draft View${partyName ? ` for ${partyName}` : ''}.`;
    },
  });

  useCopilotAction({
    name: 'updateDocumentBody',
    description: 'Updates or rewrites the active text content of the legal document directly in the editor. Always call this when you have revised document HTML.',
    parameters: [
      {
        name: 'newBodyText',
        type: 'string',
        description: 'The revised complete legal document HTML text.',
        required: true,
      },
    ],
    handler: async ({ newBodyText }) => {
      // Update React state
      setDocumentBody(newBodyText);
      // Also sync the contenteditable rich-text editor so the visual view updates immediately
      if (docRichEditorRef.current && docEditorMode === 'visual') {
        docRichEditorRef.current.innerHTML = newBodyText;
      }
      return 'Document updated in editor — changes are visible in the document panel.';
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
      const selection = window.getSelection();
      const selectedText = selection && selection.rangeCount > 0 ? selection.toString() : '';
      const textToTranslate = selectedText.trim().length > 0 ? selectedText : documentBody;
      
      const hasDevanagari = /[अ-ह\u0900-\u097F]/i.test(textToTranslate);
      const chosenLang = targetLang || (hasDevanagari ? 'en' : 'mr');
      const res = await fetch('/api/copilot/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentBody: textToTranslate,
          targetLanguage: chosenLang,
          apiKey
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.translated) {
          if (selectedText.trim().length > 0 && docEditorMode === 'visual') {
            document.execCommand('insertText', false, data.translated);
            if (docRichEditorRef.current) setDocumentBody(docRichEditorRef.current.innerHTML);
          } else {
            setDocumentBody(data.translated);
          }
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

  const [isCheckingGrammar, setIsCheckingGrammar] = useState(false);
  const handleGrammarCheck = async () => {
    if (!documentBody || isCheckingGrammar) return;
    setIsCheckingGrammar(true);
    try {
      const res = await fetch('/api/copilot/grammar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentBody, apiKey, templateTitle: activeTemplate?.title })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.corrected) {
          setDocumentBody(data.corrected);
          if (docRichEditorRef.current && docEditorMode === 'visual') {
            docRichEditorRef.current.innerHTML = data.corrected;
          }
          alert('Grammar and formal legal style check complete. Document updated.');
        }
      }
    } catch (err: any) {
      console.error(err);
      alert('Grammar check failed: ' + err.message);
    } finally {
      setIsCheckingGrammar(false);
    }
  };

  const handleClearHighlights = () => {
    const currentHtml = docEditorMode === 'visual' && docRichEditorRef.current ? docRichEditorRef.current.innerHTML : documentBody;
    const cleanHtml = currentHtml.replace(/<mark[^>]*>([\s\S]*?)<\/mark>/gi, '$1');
    setDocumentBody(cleanHtml);
    if (docRichEditorRef.current && docEditorMode === 'visual') {
      docRichEditorRef.current.innerHTML = cleanHtml;
    }
  };

  const [isDraftingClause, setIsDraftingClause] = useState(false);
  const handleDraftClause = async () => {
    const promptText = window.prompt("✍️ AI Marathi Clause Drafter\n\nDescribe the clause you want to generate (e.g., 'alimony waiver of 5 lakhs'):");
    if (!promptText || !promptText.trim()) return;
    
    setIsDraftingClause(true);
    try {
      const res = await fetch('/api/copilot/draft-clause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText, apiKey, templateTitle: activeTemplate?.title })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.clauseHTML) {
          if (docEditorMode === 'visual' && docRichEditorRef.current) {
            docRichEditorRef.current.focus();
            document.execCommand('insertHTML', false, data.clauseHTML);
            setDocumentBody(docRichEditorRef.current.innerHTML);
          } else {
            setDocumentBody(prev => prev + '\n\n' + data.clauseHTML);
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      alert('Failed to draft clause: ' + err.message);
    } finally {
      setIsDraftingClause(false);
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

  // 3. AI-powered smart chat suggestions — updates when active template changes
  const templateName = activeTemplate?.title || documentTitle;
  useCopilotChatSuggestions(
    {
      instructions: `You are JurisCopilot, an AI legal drafting assistant for Indian advocates.
Active template: "${templateName}".
Generate 4 highly specific, practical suggestions the advocate can click to use right now.
Examples for divorce: "Add alimony waiver clause", "Check Bombay HC compliance".
Examples for NDA: "Draft confidentiality clause", "Add governing law clause".
Always include: one to fill client details, one to audit compliance, one template-specific clause, one to translate.`,
    },
    [selectedTemplateId]
  );

  // 4. AI-powered statutory compliance audit action
  useCopilotAction({
    name: 'aiAuditDocument',
    description: 'Runs a deep AI-powered statutory compliance audit on the active legal document using Gemini and shows detailed pass/fail/warning results.',
    parameters: [],
    handler: async () => {
      if (!documentBody) return 'No document to audit. Please generate a draft first.';
      try {
        const res = await fetch('/api/copilot/ai-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: selectedTemplateId,
            templateTitle: activeTemplate?.title || documentTitle,
            documentBody,
            facts,
            apiKey
          })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return `⚠️ AI Audit failed: ${err.error || 'Unknown error'}`;
        }
        const data = await res.json();
        const lines: string[] = [];
        lines.push(`## 🔍 AI Compliance Audit — ${activeTemplate?.title || documentTitle}`);
        lines.push(`**Compliance Score: ${data.score ?? 0}/100**`);
        lines.push(`\n${data.summary || ''}`);
        if (data.passed?.length) lines.push(`\n### ✅ Passed (${data.passed.length})\n${data.passed.map((p: string) => `• ${p}`).join('\n')}`);
        if (data.warnings?.length) lines.push(`\n### ⚠️ Warnings (${data.warnings.length})\n${data.warnings.map((w: string) => `• ${w}`).join('\n')}`);
        if (data.failed?.length) lines.push(`\n### ❌ Missing/Failed (${data.failed.length})\n${data.failed.map((f: string) => `• ${f}`).join('\n')}`);
        return lines.join('\n');
      } catch (err: any) {
        return `⚠️ AI Audit error: ${err?.message || 'Failed to connect to backend'}`;
      }
    }
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
    if (!activeTemplate) return;
    const fieldsToSync = [...(activeTemplate.fields || [])];

    // Automatically inject courtCity & courtName if courtApplicable or referenced in templateText
    const text = activeTemplate.templateText || '';
    if (activeTemplate.courtApplicable !== false || text.includes('{courtName}') || text.includes('{courtCity}')) {
      if (!fieldsToSync.some((f) => f.key === 'courtCity')) {
        fieldsToSync.push({ key: 'courtCity', defaultValue: 'अमळनेर' } as any);
      }
      if (!fieldsToSync.some((f) => f.key === 'courtName')) {
        fieldsToSync.push({ key: 'courtName', defaultValue: activeTemplate.defaultCourt || 'मे. दिवाणी न्यायाधीश वरिष्ठ स्तर' } as any);
      }
    }

    setFacts((prev) => {
      const updated = { ...prev };
      let hasChanges = false;
      fieldsToSync.forEach((field) => {
        if ((updated[field.key] === undefined || updated[field.key] === '') && field.defaultValue !== undefined) {
          updated[field.key] = field.defaultValue;
          hasChanges = true;
        }
      });
      return hasChanges ? updated : prev;
    });
  }, [activeTemplate]);

  // Live auto-replace placeholders in documentBody whenever facts change or documentBody loads
  useEffect(() => {
    if (!documentBody || isSwitchingRef.current) return;
    const targetTmpl = templates.find((t) => t.id === selectedTemplateId) || activeTemplate;
    const cleaned = replacePlaceholdersInHtml(documentBody, facts, targetTmpl);
    if (cleaned !== documentBody) {
      setDocumentBody(cleaned);
      if (docRichEditorRef.current && docEditorMode === 'visual') {
        docRichEditorRef.current.innerHTML = formatDocToHtml(cleaned, targetTmpl);
      }
    }
  }, [facts, activeTemplate, documentBody, selectedTemplateId, templates]);

  // Dynamically group active template fields
  const fieldGroups = useMemo(() => {
    if (!activeTemplate?.fields) return [];

    const effectiveFields = [...activeTemplate.fields];
    const text = activeTemplate.templateText || '';

    // Automatically inject courtCity & courtName if courtApplicable or referenced in templateText
    if (activeTemplate.courtApplicable !== false || text.includes('{courtName}') || text.includes('{courtCity}')) {
      const hasCourtName = effectiveFields.some((f) => f.key === 'courtName');
      const hasCourtCity = effectiveFields.some((f) => f.key === 'courtCity');

      if (!hasCourtCity) {
        effectiveFields.unshift({
          key: 'courtCity',
          label: 'Court City',
          labelMr: 'कोर्टाचे शहर',
          type: 'text',
          required: true,
          defaultValue: 'अमळनेर',
          group: 'court',
        });
      }

      if (!hasCourtName) {
        effectiveFields.unshift({
          key: 'courtName',
          label: 'Court Name / Authority',
          labelMr: 'कोर्टाचे नाव',
          type: 'text',
          required: true,
          defaultValue: activeTemplate.defaultCourt || 'मे. दिवाणी न्यायाधीश वरिष्ठ स्तर',
          group: 'court',
        });
      }
    }

    const groupsMap: Record<string, typeof effectiveFields> = {};
    const customKeys: string[] = [];

    effectiveFields.forEach((field) => {
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

  const allWizardFields = useMemo(() => {
    return fieldGroups.flatMap((g) => g.fields);
  }, [fieldGroups]);

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
    const isTouchDevice = effectiveDevice === 'tablet' || effectiveDevice === 'mobile';
    const inputPaddingClass = isTouchDevice ? 'px-3 py-2 text-sm min-h-[44px]' : 'px-2.5 py-1.5 text-xs';
    const transliterateBtnClass = isTouchDevice
      ? 'text-xs px-2.5 py-1 min-h-[34px] min-w-[34px] flex items-center justify-center font-bold'
      : 'text-[11px] px-1.5 py-0.5';

    if (field.type === 'boolean') {
      return (
        <div key={field.key} className={`flex items-center gap-2.5 ${isTouchDevice ? 'py-2 min-h-[44px]' : 'py-1'}`}>
          <input
            type="checkbox"
            id={field.key}
            checked={Boolean(value)}
            onChange={(e) => handleFactChange(field.key, e.target.checked)}
            className={`rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500 cursor-pointer ${
              isTouchDevice ? 'w-5 h-5' : 'w-4 h-4'
            }`}
          />
          <label htmlFor={field.key} className={`${isTouchDevice ? 'text-sm' : 'text-xs'} text-slate-700 dark:text-slate-300 font-medium cursor-pointer select-none`}>
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
          <label className={`${isTouchDevice ? 'text-xs mb-1.5' : 'text-[11px] mb-1'} text-slate-600 dark:text-slate-400 block font-medium`}>
            {field.label} {field.labelMr && <span className="text-slate-500 dark:text-slate-500 font-marathi">({field.labelMr})</span>}
            {field.required && <span className="text-rose-500 ml-0.5">*</span>}
          </label>
          <select
            value={value}
            onChange={(e) => handleFactChange(field.key, e.target.value)}
            className={`w-full ${inputPaddingClass} bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 font-marathi`}
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
            <label className={`${isTouchDevice ? 'text-xs' : 'text-[11px]'} text-slate-600 dark:text-slate-400 font-medium`}>
              {field.label} {field.labelMr && <span className="text-slate-500 dark:text-slate-500 font-marathi">({field.labelMr})</span>}
              {field.required && <span className="text-rose-500 ml-0.5">*</span>}
            </label>
            <button
              type="button"
              onClick={() => handleTransliterateField(field.key, value)}
              disabled={transliteratingField === field.key || !value}
              className={`${transliterateBtnClass} bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 disabled:opacity-40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 rounded font-marathi shadow-sm transition cursor-pointer`}
              title="Convert English text to Marathi Devanagari (मराठीत रुपांतर करा)"
            >
              {transliteratingField === field.key ? '...' : 'म'}
            </button>
          </div>
          <textarea
            rows={isTouchDevice ? 3 : 2}
            value={value}
            onChange={(e) => handleFactChange(field.key, e.target.value)}
            placeholder={field.placeholder || ''}
            className={`w-full ${inputPaddingClass} bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-1 focus:ring-indigo-500 font-marathi`}
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
            <label className={`${isTouchDevice ? 'text-xs' : 'text-[11px]'} text-slate-600 dark:text-slate-400 font-medium`}>
              {field.label} {field.labelMr && <span className="text-slate-500 dark:text-slate-500 font-marathi">({field.labelMr})</span>}
              {field.required && <span className="text-rose-500 ml-0.5">*</span>}
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleTransliterateField(field.key, value)}
                disabled={transliteratingField === field.key || !value}
                className={`${transliterateBtnClass} bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 disabled:opacity-40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 rounded font-marathi shadow-sm transition cursor-pointer`}
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
              className={`w-full ${inputPaddingClass} bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-1 focus:ring-indigo-500 font-marathi`}
            />
            <div className="absolute right-2.5 pointer-events-none text-slate-400">
              <Calendar className={`${isTouchDevice ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />
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
              className="absolute right-1 w-8 h-8 opacity-0 cursor-pointer"
              title="Select Date from Calendar"
            />
          </div>
        </div>
      );
    }

    return (
      <div key={field.key}>
        <div className="flex items-center justify-between mb-1">
          <label className={`${isTouchDevice ? 'text-xs' : 'text-[11px]'} text-slate-600 dark:text-slate-400 font-medium`}>
            {field.label} {field.labelMr && <span className="text-slate-500 dark:text-slate-500 font-marathi">({field.labelMr})</span>}
            {field.required && <span className="text-rose-500 ml-0.5">*</span>}
          </label>
          <button
            type="button"
            onClick={() => handleTransliterateField(field.key, value)}
            disabled={transliteratingField === field.key || !value}
            className={`${transliterateBtnClass} bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 disabled:opacity-40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 rounded font-marathi shadow-sm transition cursor-pointer`}
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
          className={`w-full ${inputPaddingClass} bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-1 focus:ring-indigo-500 font-marathi`}
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
          {/* Device Mode Switcher (PC / Desktop, Tablet, Mobile, Auto) */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl border border-slate-300 dark:border-slate-700/80 text-xs shadow-inner">
            <button
              onClick={() => setDeviceMode('desktop')}
              className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition ${
                deviceMode === 'desktop'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
              title="PC / Desktop Mode (Side-by-side Resizable Split View)"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">PC / Desktop</span>
            </button>

            <button
              onClick={() => setDeviceMode('tablet')}
              className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition ${
                deviceMode === 'tablet'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
              title="Tablet Mode (Touch-friendly 44px targets, Segmented Switcher & Slide-over Drawer)"
            >
              <Tablet className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Tablet</span>
            </button>

            <button
              onClick={() => setDeviceMode('mobile')}
              className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition ${
                deviceMode === 'mobile'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
              title="Mobile Mode (Compact 1-Column Touch Layout)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Mobile</span>
            </button>

            <button
              onClick={() => setDeviceMode('auto')}
              className={`px-2 py-1.5 rounded-lg font-medium flex items-center gap-1 transition ${
                deviceMode === 'auto'
                  ? 'bg-slate-200 dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
              title={`Auto Responsive Sensing (Active: ${effectiveDevice.toUpperCase()})`}
            >
              <Sliders className="w-3 h-3 text-indigo-500" />
              <span className="text-[10px] uppercase font-bold tracking-wider">Auto</span>
            </button>
          </div>

          {/* Desktop Sub-View Mode Toggle (Split / Form / Preview) */}
          {effectiveDevice === 'desktop' && (
            <div className="hidden xl:flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-300 dark:border-slate-700 text-xs">
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
          )}

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

      {/* Touch-optimized Segmented Navigation Bar for Tablet & Mobile Modes */}
      {(effectiveDevice === 'tablet' || effectiveDevice === 'mobile') && (
        <div className="no-print bg-slate-900 border-b border-slate-800 px-3 py-2 flex items-center justify-between shrink-0 z-20 gap-2">
          <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl w-full max-w-md border border-slate-700">
            <button
              onClick={() => setTabletTab('form')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition min-h-[40px] ${
                tabletTab === 'form'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <FolderEdit className="w-4 h-4" />
              <span>Client Form Fields</span>
            </button>

            <button
              onClick={() => setTabletTab('canvas')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition min-h-[40px] ${
                tabletTab === 'canvas'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Document Canvas</span>
            </button>
          </div>

          <button
            onClick={() => setIsTabletDrawerOpen(true)}
            className="px-3.5 py-2 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/80 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow min-h-[40px] shrink-0 cursor-pointer"
            title="Open Slide-Over Client Form Drawer"
          >
            <PanelLeft className="w-4 h-4 text-indigo-400" />
            <span className="hidden sm:inline">Form Drawer</span>
          </button>
        </div>
      )}

      {/* Main Drafting Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Client & Case Facts Wizard */}
        {((effectiveDevice === 'desktop' && (viewMode === 'split' || viewMode === 'form')) ||
          ((effectiveDevice === 'tablet' || effectiveDevice === 'mobile') && tabletTab === 'form')) && (
          <div
            style={effectiveDevice === 'desktop' && viewMode === 'split' ? { width: `${formPaneWidth}px` } : undefined}
            className={`no-print border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-y-auto ${
              effectiveDevice !== 'desktop' || viewMode === 'form' ? 'w-full max-w-4xl mx-auto' : 'shrink-0'
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
                  <button
                    type="button"
                    onClick={() => setIsWizardOpen(true)}
                    className="px-2.5 py-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                    title="Fill client & case particulars field-by-field using the interactive Form Wizard"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Step-by-Step Wizard</span>
                  </button>
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
        {effectiveDevice === 'desktop' && viewMode === 'split' && (
          <div
            onMouseDown={handleMouseDownFormResize}
            className="no-print w-2 hover:w-2 bg-slate-800 hover:bg-indigo-500/50 cursor-col-resize z-20 flex items-center justify-center group transition-colors shrink-0"
            title="Drag left/right to adjust Form Wizard pane width"
          >
            <div className="w-0.5 h-8 bg-slate-600 group-hover:bg-indigo-300 rounded-full" />
          </div>
        )}

        {/* Center / Right Column: Live Legal Document Draft & Editor */}
        {((effectiveDevice === 'desktop' && (viewMode === 'split' || viewMode === 'preview')) ||
          ((effectiveDevice === 'tablet' || effectiveDevice === 'mobile') && tabletTab === 'canvas')) && (
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

                    {/* Font Size Dropdown */}
                    <select
                      title="Font Size"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleDocExecCommand('fontSizePt', e.target.value);
                        }
                      }}
                      className="h-[26px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer mr-1"
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

                    {/* Font Size Increase / Decrease buttons Removed as per request */}
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
                      <span>{isTranslating ? 'Translating...' : 'Translate'}</span>
                    </button>
                    <button
                      onClick={() => handleGrammarCheck()}
                      disabled={isCheckingGrammar}
                      className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/80 dark:hover:bg-amber-900 disabled:opacity-50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 rounded font-medium transition"
                      title="Check formal Marathi grammar and legal style"
                    >
                      <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                      <span>{isCheckingGrammar ? 'Checking...' : 'Grammar Check'}</span>
                    </button>
                    <button
                      onClick={() => handleClearHighlights()}
                      className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/80 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded font-medium transition"
                      title="Clear all yellow grammar highlights from the document"
                    >
                      <Eraser className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                      <span>Clear Highlights</span>
                    </button>
                    <button
                      onClick={() => handleDraftClause()}
                      disabled={isDraftingClause}
                      className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/80 dark:hover:bg-purple-900 disabled:opacity-50 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-700/60 rounded font-medium transition"
                      title="Draft a new Marathi clause using AI"
                    >
                      <PlusCircle className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                      <span>{isDraftingClause ? 'Drafting...' : 'AI Clause Drafter'}</span>
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
                  <CopilotTextarea
                    value={documentBody}
                    onChange={(e) => setDocumentBody(e.target.value)}
                    className="w-full h-auto min-h-[850px] resize-none outline-none border-none bg-transparent text-slate-900 font-mono text-xs md:text-sm leading-relaxed selection:bg-indigo-100 p-0 overflow-visible"
                    placeholder="Raw legal document draft code will appear here... (AI autocomplete enabled: Start typing and Copilot will suggest the rest of the legal clause!)"
                    autosuggestionsConfig={{
                      textareaPurpose: `You are an AI assistant helping a lawyer draft a ${activeTemplate?.title || documentTitle}. Suggest autocomplete completions for the HTML legal clauses based on the client facts.`,
                    }}
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

      <FormWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        fields={allWizardFields}
        facts={facts}
        onFactChange={handleFactChange}
        activeTemplateTitle={activeTemplate?.title || documentTitle}
        apiKey={apiKey}
      />

      {/* SLIDE-OVER CLIENT FORM DRAWER FOR TABLET / MOBILE MODE */}
      {isTabletDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-start bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 no-print">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md h-full border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 bg-indigo-600 dark:bg-indigo-700 text-white flex items-center justify-between shadow">
              <div className="flex items-center gap-2">
                <PanelLeft className="w-5 h-5" />
                <h3 className="font-bold text-sm sm:text-base">Client & Case Particulars Drawer</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTabletDrawerOpen(false)}
                className="p-1.5 hover:bg-indigo-700 dark:hover:bg-indigo-800 rounded-lg text-white transition cursor-pointer"
                title="Close Drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200">Active Template</p>
                  <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">{activeTemplate?.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsTabletDrawerOpen(false);
                    setIsNotesModalOpen(true);
                  }}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Notes
                </button>
              </div>

              {fieldGroups.length > 0 ? (
                fieldGroups.map((group) => {
                  const header = getGroupHeader(group.key);
                  return (
                    <div
                      key={`drawer-${group.key}`}
                      className="space-y-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex items-center justify-between">
                        <h5 className={`text-xs font-bold ${header.color}`}>
                          {header.title}
                        </h5>
                        {header.titleMr && (
                          <span className="text-[11px] text-slate-500 font-marathi">
                            {header.titleMr}
                          </span>
                        )}
                      </div>
                      <div className="space-y-3">
                        {group.fields.map((field: any) => renderField(field))}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/40 text-center text-xs text-slate-500">
                  No custom form fields for this template.
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Updates draft real-time</span>
              <button
                type="button"
                onClick={() => setIsTabletDrawerOpen(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow cursor-pointer"
              >
                Done Editing
              </button>
            </div>
          </div>
        </div>
      )}

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

