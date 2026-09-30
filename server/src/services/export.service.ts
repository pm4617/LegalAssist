import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { pathToFileURL } from 'url';
import PDFDocument from 'pdfkit';
import {
  Document, Paragraph, TextRun, AlignmentType, LineRuleType, Packer, PageBreak,
  Table, TableRow, TableCell, BorderStyle, WidthType, VerticalAlign,
} from 'docx';
import { getEmbeddedDevanagariRegular, getEmbeddedDevanagariBold } from '../assets/fonts/embedded-fonts.js';

export interface PdfExportOptions {
  title: string;
  content: string;
  paperSize?: 'a4' | 'legal';
  engine?: 'auto' | 'browser' | 'node';
}

export interface DocxExportOptions {
  title: string;
  content: string;
  isDevanagari?: boolean;
  paperSize?: 'a4' | 'legal';
  defaultLineSpacing?: number;
  defaultFontFamily?: string;
  defaultFontSizePt?: number;
}

interface StyleState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontSize?: number;
  fontFamily?: string;
}

interface HtmlBlock {
  html: string;        // Inner HTML content of the block (for paragraphs)
  openTag: string;     // Wrapper opening tag HTML (for inline style extraction)
  tableHtml: string;   // Full raw HTML of a <table> element (for table blocks)
  alignment: string;   // 'left' | 'right' | 'center' | 'justify' | ''
  isPageBreak: boolean;
  isHeading: boolean;
  isTable: boolean;
}

function unescapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#8203;/gi, '');
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractTableData(tableHtml: string): string[][] {
  const rows: string[][] = [];
  const trMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trMatches) {
    const cells: string[] = [];
    const cellMatches = tr.match(/<(td|th)[\s\S]*?<\/\1>/gi) || [];
    for (const cell of cellMatches) {
      const text = unescapeHtml(cell.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim());
      cells.push(text);
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function getParagraphAlignment(blockHtml: string, rawText: string): any {
  if (
    /style=["'][^"']*text-align:\s*center/i.test(blockHtml) ||
    /<center>/i.test(blockHtml) ||
    /align=["']center["']/i.test(blockHtml) ||
    /\[center\]/i.test(blockHtml) ||
    /class=["'][^"']*text-center/i.test(blockHtml)
  ) {
    return AlignmentType.CENTER;
  }
  if (
    /style=["'][^"']*text-align:\s*right/i.test(blockHtml) ||
    /align=["']right["']/i.test(blockHtml) ||
    /\[right\]/i.test(blockHtml) ||
    /class=["'][^"']*text-right/i.test(blockHtml)
  ) {
    return AlignmentType.RIGHT;
  }
  if (
    /style=["'][^"']*text-align:\s*left/i.test(blockHtml) ||
    /align=["']left["']/i.test(blockHtml) ||
    /\[left\]/i.test(blockHtml) ||
    /class=["'][^"']*text-left/i.test(blockHtml)
  ) {
    return AlignmentType.LEFT;
  }
  if (
    /style=["'][^"']*text-align:\s*justify/i.test(blockHtml) ||
    /align=["']justify["']/i.test(blockHtml) ||
    /class=["'][^"']*text-justify/i.test(blockHtml)
  ) {
    return AlignmentType.JUSTIFIED;
  }

  if (/^#+\s+/.test(rawText.trim())) {
    return AlignmentType.CENTER;
  }

  const clean = rawText.trim();
  if (
    (clean.includes('येथील') && (clean.includes('कोर्टात') || clean.includes('न्यायालय'))) ||
    clean.startsWith('HMP') ||
    clean.includes('MUTUAL NON-DISCLOSURE') ||
    clean.includes('LEGAL NOTICE') ||
    clean.includes('प्रतिज्ञापत्र') ||
    clean.includes('प्रतिज्ञालेख')
  ) {
    return AlignmentType.CENTER;
  }

  return AlignmentType.JUSTIFIED;
}

function sanitizeAndMarkupHtml(raw: string): string {
  let s = raw.replace(/<([^>]*)>/g, (_match, inner) => {
    const collapsed = inner.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return `<${collapsed}>`;
  });

  // Strip HTML comments (e.g. Word conditionals <!--[if !supportLists]-->)
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // Clean Word XML tags like <o:p></o:p>
  s = s.replace(/<\/?o:p[^>]*>/gi, '');

  return s;
}

export interface ParsedRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontSize?: number; // in points
  fontFamily?: string;
  break?: number;
}

export interface ParsedTableCell {
  isHeader: boolean;
  colspan: number;
  rowspan: number;
  hasTopBorder: boolean;
  align: 'left' | 'center' | 'right' | 'justify';
  cellInner: string;
  plainText: string;
  runs: ParsedRun[];
}

export interface ParsedTableRow {
  cells: ParsedTableCell[];
  minHeightPt?: number;
}

function mergeEquivalentRuns(runs: ParsedRun[]): ParsedRun[] {
  const merged: ParsedRun[] = [];

  for (const run of runs) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      !previous.break &&
      !run.break &&
      previous.bold === run.bold &&
      previous.italic === run.italic &&
      previous.underline === run.underline &&
      previous.fontSize === run.fontSize
    ) {
      previous.text += run.text;
    } else {
      merged.push({ ...run });
    }
  }

  return merged;
}

function parseParagraphToRuns(
  blockHtml: string,
  defaultFont: string,
  defaultFontSizePt: number
): ParsedRun[] {
  const runs: ParsedRun[] = [];
  const unescaped = unescapeHtml(blockHtml);
  const sanitized = sanitizeAndMarkupHtml(unescaped);
  const tokens = sanitized.split(/(<[^>]+>)/g);

  const styleStack: StyleState[] = [{ bold: false, italic: false, underline: false }];
  let currentStyle: StyleState = { bold: false, italic: false, underline: false };
  let pendingBreak = 0;

  const plainTextOnly = sanitized.replace(/<[^>]+>/g, '').trim();
  const isMdHeading = /^#+\s+/.test(plainTextOnly);

  for (const token of tokens) {
    if (!token) continue;

    if (token.startsWith('<') && token.endsWith('>')) {
      const tagLower = token.toLowerCase();

      if (/^<br[\s/]?>/.test(tagLower)) {
        pendingBreak++;
      } else if (/^<div[\s>]/i.test(tagLower)) {
        pendingBreak++;
      } else if (/^<\/?(?:div|p|table|tbody|thead|tfoot|tr|td|th|center|blockquote|hr|li|ul|ol|section|article|figure)\b/i.test(tagLower)) {
        continue;
      } else if (/^<b[\s>]|^<strong[\s>]/.test(tagLower)) {
        currentStyle = { ...currentStyle, bold: true };
        styleStack.push(currentStyle);
      } else if (/^<\/b>|^<\/strong>/.test(tagLower)) {
        if (styleStack.length > 1) styleStack.pop();
        currentStyle = styleStack[styleStack.length - 1];
      } else if (/^<i[\s>]|^<em[\s>]/.test(tagLower)) {
        currentStyle = { ...currentStyle, italic: true };
        styleStack.push(currentStyle);
      } else if (/^<\/i>|^<\/em>/.test(tagLower)) {
        if (styleStack.length > 1) styleStack.pop();
        currentStyle = styleStack[styleStack.length - 1];
      } else if (/^<u[\s>]/.test(tagLower)) {
        currentStyle = { ...currentStyle, underline: true };
        styleStack.push(currentStyle);
      } else if (/^<\/u>/.test(tagLower)) {
        if (styleStack.length > 1) styleStack.pop();
        currentStyle = styleStack[styleStack.length - 1];
      } else if (/^<span[\s>]|^<font[\s>]/.test(tagLower)) {
        const isBold = /font-weight:\s*(bold|700|600)/i.test(token);
        const isItalic = /font-style:\s*italic/i.test(token);
        const isUnderline = /text-decoration:\s*underline/i.test(token);

        let fontSize: number | undefined = currentStyle.fontSize;
        const sizeMatch = /font-size:\s*([\d.]+)(pt|px)?/i.exec(token);
        if (sizeMatch) {
          const val = parseFloat(sizeMatch[1]);
          const unit = (sizeMatch[2] || 'pt').toLowerCase();
          if (!isNaN(val) && val > 0) {
            fontSize = unit === 'px' ? val * 0.75 : val;
          }
        }

        let fontFamily: string | undefined = currentStyle.fontFamily;
        const fontMatch = /font-family:\s*['"]?([^;'"]+)['"]?/i.exec(token) || /face=['"]?([^'"]+)['"]?/i.exec(token);
        if (fontMatch && fontMatch[1]) {
          fontFamily = fontMatch[1].trim();
        }

        currentStyle = {
          bold: currentStyle.bold || isBold,
          italic: currentStyle.italic || isItalic,
          underline: currentStyle.underline || isUnderline,
          fontSize,
          fontFamily,
        };
        styleStack.push(currentStyle);
      } else if (/^<\/span>|^<\/font>/.test(tagLower)) {
        if (styleStack.length > 1) styleStack.pop();
        currentStyle = styleStack[styleStack.length - 1];
      }
    } else {
      let text = token;

      if (isMdHeading) {
        text = text.replace(/^#+\s+/, '');
      }

      if (text.length > 0) {
        runs.push({
          text,
          fontFamily: currentStyle.fontFamily || defaultFont,
          fontSize: currentStyle.fontSize || defaultFontSizePt,
          bold: currentStyle.bold || isMdHeading,
          italic: currentStyle.italic,
          underline: currentStyle.underline,
          break: pendingBreak > 0 ? pendingBreak : undefined,
        });
        pendingBreak = 0;
      }
    }
  }

  if (pendingBreak > 0) {
    runs.push({
      text: '',
      fontFamily: defaultFont,
      fontSize: defaultFontSizePt,
      bold: false,
      italic: false,
      underline: false,
      break: pendingBreak,
    });
  }

  if (runs.length === 0 && plainTextOnly.length > 0) {
    runs.push({
      text: plainTextOnly,
      fontFamily: defaultFont,
      fontSize: defaultFontSizePt,
      bold: false,
      italic: false,
      underline: false,
    });
  }

  return runs;
}

function parseParagraphToTextRuns(
  blockHtml: string,
  defaultFont: string,
  defaultFontSize: number
): TextRun[] {
  const runs = parseParagraphToRuns(blockHtml, defaultFont, defaultFontSize / 2);
  return runs.map(r => new TextRun({
    text: r.text,
    font: r.fontFamily || defaultFont,
    size: r.fontSize ? Math.round(r.fontSize * 2) : defaultFontSize,
    bold: r.bold,
    italics: r.italic,
    underline: r.underline ? {} : undefined,
    break: r.break && r.break > 0 ? r.break : undefined,
  }));
}

function getAlignmentFromTag(tagHtml: string): string | null {
  if (!tagHtml) return null;
  const h = tagHtml.toLowerCase();
  if (
    /style=["'][^"']*text-align:\s*center/.test(h) ||
    /<center[\s>]/.test(h) ||
    /align=["']center["']/.test(h) ||
    /\[center\]/.test(h) ||
    /class=["'][^"']*text-center/.test(h)
  ) return 'center';
  if (
    /style=["'][^"']*text-align:\s*right/.test(h) ||
    /align=["']right["']/.test(h) ||
    /\[right\]/.test(h) ||
    /class=["'][^"']*text-right/.test(h)
  ) return 'right';
  if (
    /style=["'][^"']*text-align:\s*justify/.test(h) ||
    /align=["']justify["']/.test(h) ||
    /class=["'][^"']*text-justify/.test(h)
  ) return 'justify';
  if (
    /style=["'][^"']*text-align:\s*left/.test(h) ||
    /align=["']left["']/.test(h) ||
    /\[left\]/.test(h) ||
    /class=["'][^"']*text-left/.test(h)
  ) return 'left';
  return null;
}

function isPageBreakString(str: string): boolean {
  if (!str) return false;
  const s = str.toLowerCase();
  return (
    s.includes('page-break') ||
    s.includes('pagebreak') ||
    s.includes('break-after:page') ||
    s.includes('break-after: page') ||
    s.includes('page-break-after:always') ||
    s.includes('page-break-after: always') ||
    s.includes('page-break-before:always') ||
    s.includes('page-break-before: always') ||
    s.includes('[page-break]') ||
    s.includes('<!-- pagebreak -->') ||
    s.includes('<!-- page-break -->')
  );
}

function normalizeNestedFamilyTreeDivs(html: string): string {
  const containerRe = /<div\b[^>]*class=["'][^"']*\bcourt-family-tree-container\b[^"']*["'][^>]*>/gi;
  let result = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = containerRe.exec(html)) !== null) {
    const openEnd = match.index + match[0].length;
    let depth = 1;
    let scan = openEnd;
    let closeStart = -1;
    let closeEnd = -1;

    while (depth > 0) {
      const nextOpen = /<div\b[^>]*>/i.exec(html.slice(scan));
      const nextClose = /<\/div\s*>/i.exec(html.slice(scan));
      if (!nextClose) break;

      const openIndex = nextOpen ? scan + nextOpen.index : Number.POSITIVE_INFINITY;
      const closeIndex = scan + nextClose.index;
      if (openIndex < closeIndex) {
        depth++;
        scan = openIndex + nextOpen![0].length;
      } else {
        depth--;
        closeStart = closeIndex;
        closeEnd = closeIndex + nextClose[0].length;
        scan = closeEnd;
      }
    }

    if (depth !== 0 || closeStart < 0) continue;

    const inner = html.slice(openEnd, closeStart)
      .replace(/<div\b/gi, '<section')
      .replace(/<\/div\s*>/gi, '</section>');
    result += html.slice(cursor, openEnd) + inner + html.slice(closeStart, closeEnd);
    cursor = closeEnd;
    containerRe.lastIndex = closeEnd;
  }

  return result ? result + html.slice(cursor) : html;
}

function extractBlocks(content: string): HtmlBlock[] {
  const html = normalizeNestedFamilyTreeDivs((content || '').trim());
  if (!html) return [];

  const hasBlockTags = /<(p|div|hr|h[1-6]|center|blockquote|table)[\s/>]/i.test(html) || isPageBreakString(html);

  if (!hasBlockTags) {
    return html.split(/\r?\n/).map((line) => {
      const isPB = isPageBreakString(line);
      return {
        html: isPB ? '' : line,
        openTag: '',
        tableHtml: '',
        alignment: '',
        isPageBreak: isPB,
        isHeading: false,
        isTable: false,
      };
    });
  }

  const blocks: HtmlBlock[] = [];
  const blockRe = /(<(table)([\s][^>]*)?>)([\s\S]*?)<\/table>|(<(p|div|hr|h[1-6]|center|blockquote)(\s[^>]*)?>)([\s\S]*?)<\/\6>|(<(?:hr|br|div|p)\s*\/?>)|([^<]+(?:<(?!\/?(p|div|hr|h[1-6]|center|blockquote|table)[\s/>])[^>]*>[^<]*)*)/gi;

  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(html)) !== null) {
    if (match[1] && match[2]?.toLowerCase() === 'table') {
      const fullTableHtml = match[1] + (match[4] || '') + '</table>';
      blocks.push({
        html: '', openTag: match[1], tableHtml: fullTableHtml,
        alignment: '', isPageBreak: false, isHeading: false, isTable: true,
      });

    } else if (match[5]) {
      const openTag = match[5];
      const tagName = (match[6] || '').toLowerCase();
      const innerHtml = match[8] || '';

      if (isPageBreakString(openTag) || isPageBreakString(innerHtml) || tagName === 'hr') {
        blocks.push({ html: '', openTag: '', tableHtml: '', alignment: '', isPageBreak: true, isHeading: false, isTable: false });
        continue;
      }

      // If this is a <div> that contains nested block-level content (tables, paragraphs),
      // recursively extract its children as individual blocks (e.g. family tree container)
      if (tagName === 'div' && /\<(table|p|div|h[1-6]|center|blockquote)[\s\/\>]/i.test(innerHtml)) {
        const childBlocks = extractBlocks(innerHtml);
        for (const cb of childBlocks) {
          blocks.push(cb);
        }
        continue;
      }

      let alignment = getAlignmentFromTag(openTag) || '';
      if (tagName === 'center') alignment = 'center';
      const isHeading = /^h[1-6]$/.test(tagName);
      if (isHeading && !alignment) alignment = 'center';

      if (!alignment) {
        const innerMatch = /^<(div|p|span)[^>]*>/.exec(innerHtml.trim());
        if (innerMatch) alignment = getAlignmentFromTag(innerMatch[0]) || '';
      }

      blocks.push({ html: innerHtml, openTag, tableHtml: '', alignment, isPageBreak: false, isHeading, isTable: false });

    } else if (match[9]) {
      const selfTag = match[9];
      if (isPageBreakString(selfTag) || /^<hr/i.test(selfTag)) {
        blocks.push({ html: '', openTag: '', tableHtml: '', alignment: '', isPageBreak: true, isHeading: false, isTable: false });
      } else {
        blocks.push({ html: '', openTag: '', tableHtml: '', alignment: '', isPageBreak: false, isHeading: false, isTable: false });
      }

    } else if (match[10]) {
      const raw = match[10].trim();
      if (raw) {
        if (isPageBreakString(raw)) {
          blocks.push({ html: '', openTag: '', tableHtml: '', alignment: '', isPageBreak: true, isHeading: false, isTable: false });
        } else {
          blocks.push({ html: raw, openTag: '', tableHtml: '', alignment: '', isPageBreak: false, isHeading: false, isTable: false });
        }
      }
    }
  }

  if (blocks.length === 0) {
    return html.split(/\r?\n/).map((line) => ({
      html: isPageBreakString(line) ? '' : line,
      openTag: '',
      tableHtml: '',
      alignment: '',
      isPageBreak: isPageBreakString(line),
      isHeading: false,
      isTable: false,
    }));
  }

  return blocks;
}

function extractDocumentGlobals(content: string, isDevanagari: boolean, options: DocxExportOptions) {
  let docLineSpacing = options.defaultLineSpacing || 240; // 240 = 1.0x line spacing
  let docFontFamily = options.defaultFontFamily || (isDevanagari ? 'Mangal' : 'Times New Roman');
  let docFontSize = options.defaultFontSizePt ? Math.round(options.defaultFontSizePt * 2) : 24; // 24 half-points = 12pt

  const rootStyleMatch = /^(?:<div|<body|<section|<article)[^>]*style=["']([^"']+)["']/i.exec((content || '').trim());
  if (rootStyleMatch && rootStyleMatch[1]) {
    const styles = rootStyleMatch[1];
    
    const lhMatch = /line-height:\s*([\d.]+)(pt|px|%)?/i.exec(styles);
    if (lhMatch) {
      const val = parseFloat(lhMatch[1]);
      const unit = (lhMatch[2] || '').toLowerCase();
      if (!isNaN(val) && val > 0) {
        if (unit === '%') docLineSpacing = Math.round((val / 100) * 240);
        else if (unit === 'pt') docLineSpacing = Math.round((val / 12) * 240);
        else if (unit === 'px') docLineSpacing = Math.round(((val * 0.75) / 12) * 240);
        else docLineSpacing = Math.round(val * 240);
      }
    }

    const ffMatch = /font-family:\s*['"]?([^;'"]+)['"]?/i.exec(styles);
    if (ffMatch && ffMatch[1]) {
      docFontFamily = ffMatch[1].trim();
    }

    const fsMatch = /font-size:\s*([\d.]+)(pt|px)?/i.exec(styles);
    if (fsMatch) {
      const val = parseFloat(fsMatch[1]);
      const unit = (fsMatch[2] || 'pt').toLowerCase();
      if (!isNaN(val) && val > 0) {
        const pt = unit === 'px' ? val * 0.75 : val;
        docFontSize = Math.round(pt * 2);
      }
    }
  }

  return { docLineSpacing, docFontFamily, docFontSize };
}

function getParagraphLineSpacing(openTag: string, innerHtml: string, fallbackDxa: number = 240): number {
  const combined = (openTag || '') + ' ' + (innerHtml || '');
  const match = /line-height:\s*([\d.]+)(pt|px|%)?/i.exec(combined);
  if (match) {
    const val = parseFloat(match[1]);
    const unit = (match[2] || '').toLowerCase();
    if (!isNaN(val) && val > 0) {
      if (unit === '%') {
        return Math.round((val / 100) * 240);
      } else if (unit === 'pt') {
        return Math.round((val / 12) * 240);
      } else if (unit === 'px') {
        return Math.round(((val * 0.75) / 12) * 240);
      } else {
        return Math.round(val * 240);
      }
    }
  }
  return fallbackDxa;
}

function getParagraphMarginSpacing(openTag: string, innerHtml: string): { before: number; after: number } {
  const combined = (openTag || '') + ' ' + (innerHtml || '');
  let before = 0;
  let after = 120;

  const marginTopMatch = /margin-top:\s*([\d.]+)(pt|px)?/i.exec(combined);
  if (marginTopMatch) {
    const val = parseFloat(marginTopMatch[1]);
    const unit = (marginTopMatch[2] || 'pt').toLowerCase();
    if (!isNaN(val) && val >= 0) {
      const pt = unit === 'px' ? val * 0.75 : val;
      before = Math.round(pt * 20);
    }
  }

  const marginBottomMatch = /margin-bottom:\s*([\d.]+)(pt|px)?/i.exec(combined);
  if (marginBottomMatch) {
    const val = parseFloat(marginBottomMatch[1]);
    const unit = (marginBottomMatch[2] || 'pt').toLowerCase();
    if (!isNaN(val) && val >= 0) {
      const pt = unit === 'px' ? val * 0.75 : val;
      after = Math.round(pt * 20);
    }
  }

  return { before, after };
}

function getParagraphIndent(openTag: string, innerHtml: string): number | undefined {
  const combined = (openTag || '') + ' ' + (innerHtml || '');
  const match = /(?:margin-left|padding-left):\s*([\d.]+)(pt|px|in|cm)?/i.exec(combined);
  if (match) {
    const val = parseFloat(match[1]);
    const unit = (match[2] || 'pt').toLowerCase();
    if (!isNaN(val) && val > 0) {
      if (unit === 'in') return Math.round(val * 1440);
      if (unit === 'cm') return Math.round(val * 567);
      const pt = unit === 'px' ? val * 0.75 : val;
      return Math.round(pt * 20);
    }
  }
  return undefined;
}

function isTableBorderless(tableOpenTag: string): boolean {
  // border="0" attribute or border: none / border: 0 in style or family-tree-table class
  if (/\bborder=["']?0["']?/i.test(tableOpenTag)) return true;
  if (/border:\s*none/i.test(tableOpenTag)) return true;
  if (/border:\s*0(?:px)?/i.test(tableOpenTag)) return true;
  if (/class=["'][^"']*family-tree/i.test(tableOpenTag)) return true;
  return false;
}

function extractRichTableRows(
  tableHtml: string,
  defaultFont: string,
  defaultFontSizePt: number
): ParsedTableRow[] {
  const rows: ParsedTableRow[] = [];
  const trRe = /<tr([^>]*)>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRe.exec(tableHtml)) !== null) {
    const trAttrs = trMatch[1] || '';
    const trInner = trMatch[2] || '';
    const rowHeightMatch = /height\s*:\s*([\d.]+)(pt|px|in|cm)?/i.exec(trAttrs);
    let minHeightPt: number | undefined;
    if (rowHeightMatch) {
      const value = parseFloat(rowHeightMatch[1]);
      const unit = (rowHeightMatch[2] || 'pt').toLowerCase();
      if (Number.isFinite(value) && value > 0) {
        minHeightPt = unit === 'px' ? value * 0.75 :
          unit === 'in' ? value * 72 :
          unit === 'cm' ? value * 28.35 : value;
      }
    }
    const cells: ParsedTableCell[] = [];
    const cellRe = /<(th|td)([^>]*)>([\s\S]*?)<\/\1>/gi;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRe.exec(trInner)) !== null) {
      const isHeader = cellMatch[1].toLowerCase() === 'th';
      const cellAttrs = cellMatch[2] || '';
      const cellInner = cellMatch[3] || '';

      const colspanMatch = /colspan=["']?(\d+)["']?/i.exec(cellAttrs);
      const colspan = colspanMatch ? parseInt(colspanMatch[1], 10) : 1;

      const rowspanMatch = /rowspan=["']?(\d+)["']?/i.exec(cellAttrs);
      const rowspan = rowspanMatch ? parseInt(rowspanMatch[1], 10) : 1;
      const cellStyleMatch = /style=["']([^"']*)["']/i.exec(cellAttrs);
      const topBorderMatch = cellStyleMatch && /border-top\s*:\s*([^;]+)/i.exec(cellStyleMatch[1]);
      const hasTopBorder = !!topBorderMatch && !/^(?:none|0(?:px|pt)?)\s*$/i.test(topBorderMatch[1].trim());

      const cellAlignRaw = getAlignmentFromTag(`<td${cellAttrs}>`);
      const align: 'left' | 'center' | 'right' | 'justify' =
        cellAlignRaw === 'center' ? 'center' :
        cellAlignRaw === 'right'  ? 'right'  :
        cellAlignRaw === 'justify' ? 'justify' :
        'left';

      const plainText = unescapeHtml(cellInner.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).trim();
      const cellFontSize = isHeader ? Math.min(defaultFontSizePt, 10.5) : Math.min(defaultFontSizePt, 10);
      const runs = parseParagraphToRuns(cellInner, defaultFont, cellFontSize);

      if (isHeader) {
        for (const r of runs) {
          r.bold = true;
        }
      }

      cells.push({
        isHeader,
        colspan,
        rowspan,
        hasTopBorder,
        align,
        cellInner,
        plainText,
        runs,
      });
    }

    if (cells.length > 0) {
      rows.push({ cells, minHeightPt });
    }
  }

  return rows;
}

function parseTableToDocx(tableHtml: string, defaultFont: string, defaultFontSize: number): Table {
  // Detect whether this table should have visible borders
  const tableOpenTagMatch = /^(<table[^>]*>)/i.exec(tableHtml.trim());
  const tableOpenTag = tableOpenTagMatch ? tableOpenTagMatch[1] : '';
  const noBorders = isTableBorderless(tableOpenTag);
  const parsedRows = extractRichTableRows(tableHtml, defaultFont, defaultFontSize / 2);
  const rows: TableRow[] = [];

  for (const pr of parsedRows) {
    const cells: TableCell[] = [];
    for (const c of pr.cells) {
      const cellAlignment =
        c.align === 'center' ? AlignmentType.CENTER :
        c.align === 'right'  ? AlignmentType.RIGHT  :
        c.align === 'justify' ? AlignmentType.JUSTIFIED :
        AlignmentType.LEFT;

      const cellRuns = c.runs.length > 0
        ? c.runs.map(r => new TextRun({
            text: r.text,
            font: r.fontFamily || defaultFont,
            size: r.fontSize ? Math.round(r.fontSize * 2) : defaultFontSize,
            bold: r.bold || c.isHeader,
            italics: r.italic,
            underline: r.underline ? {} : undefined,
            break: r.break ? r.break : undefined,
          }))
        : [new TextRun({ text: c.plainText, font: defaultFont, size: defaultFontSize, bold: c.isHeader })];

      const solidBorder = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
      const nilBorder   = { style: BorderStyle.NIL,    size: 0, color: 'FFFFFF' };
      const cellBorder  = noBorders ? nilBorder : solidBorder;
      const topBorder = noBorders && c.hasTopBorder ? solidBorder : cellBorder;

      cells.push(new TableCell({
        columnSpan: c.colspan > 1 ? c.colspan : undefined,
        rowSpan: c.rowspan > 1 ? c.rowspan : undefined,
        verticalAlign: VerticalAlign.CENTER,
        shading: (!noBorders && c.isHeader) ? { fill: 'E8EAF0' } : undefined,
        borders: {
          top: topBorder, bottom: cellBorder,
          left: cellBorder, right: cellBorder,
        },
        children: [
          new Paragraph({
            alignment: cellAlignment,
            spacing: { before: 60, after: 60, line: 240, lineRule: LineRuleType.AUTO },
            children: cellRuns,
          }),
        ],
      }));
    }

    if (cells.length > 0) {
      rows.push(new TableRow({ children: cells }));
    }
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

export class ExportService {
  async generateDocx(options: DocxExportOptions): Promise<Buffer> {
    const { content, isDevanagari = false, paperSize = 'a4' } = options;
    const globals = extractDocumentGlobals(content, isDevanagari, options);
    const defaultFont = globals.docFontFamily;
    const defaultFontSize = globals.docFontSize;
    const defaultLineSpacing = globals.docLineSpacing;

    const pageSize =
      paperSize === 'a4'
        ? { width: 11906, height: 16838 } // A4: 210mm x 297mm
        : { width: 12240, height: 20160 }; // Legal: 8.5" x 14.0"

    const sanitizedContent = sanitizeAndMarkupHtml(unescapeHtml(content || ''));
    const blocks = extractBlocks(sanitizedContent);
    const children: (Paragraph | Table)[] = [];

    for (const block of blocks) {
      if (block.isPageBreak) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
        continue;
      }

      if (block.isTable) {
        try {
          const table = parseTableToDocx(block.tableHtml, defaultFont, defaultFontSize);
          children.push(table);
          children.push(new Paragraph({
            spacing: { before: 0, after: 60, line: defaultLineSpacing, lineRule: LineRuleType.AUTO },
            children: [new TextRun({ text: '', font: defaultFont, size: defaultFontSize })],
          }));
        } catch {
        }
        continue;
      }

      const plainText = unescapeHtml(block.html.replace(/<[^>]+>/g, '')).trim();

      if (!plainText) {
        children.push(new Paragraph({
          spacing: { before: 0, after: 0, line: defaultLineSpacing, lineRule: LineRuleType.AUTO },
          children: [new TextRun({ text: '', font: defaultFont, size: defaultFontSize })],
        }));
        continue;
      }

      let alignment: any;
      if (block.alignment === 'center') {
        alignment = AlignmentType.CENTER;
      } else if (block.alignment === 'right') {
        alignment = AlignmentType.RIGHT;
      } else if (block.alignment === 'justify') {
        alignment = AlignmentType.JUSTIFIED;
      } else if (block.alignment === 'left') {
        alignment = AlignmentType.LEFT;
      } else {
        alignment = getParagraphAlignment(block.html, plainText);
      }

      const { before, after } = getParagraphMarginSpacing(block.openTag, block.html);
      const lineSpacing = getParagraphLineSpacing(block.openTag, block.html, defaultLineSpacing);
      const indentLeft = getParagraphIndent(block.openTag, block.html);
      const runs = parseParagraphToTextRuns(block.html, defaultFont, defaultFontSize);

      children.push(new Paragraph({
        alignment,
        indent: indentLeft ? { left: indentLeft } : undefined,
        spacing: {
          before,
          after,
          line: lineSpacing,
          lineRule: LineRuleType.AUTO,
        },
        children: runs,
      }));
    }

    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: defaultFont,
              size: defaultFontSize,
            },
            paragraph: {
              spacing: {
                line: defaultLineSpacing,
                lineRule: LineRuleType.AUTO,
                after: 120,
              },
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: pageSize,
              margin: {
                top: 1440,    // 1.0 inch
                bottom: 1440, // 1.0 inch
                left: 2160,   // 1.5 inch (Court binding)
                right: 1440,  // 1.0 inch
              },
            },
          },
          children,
        },
      ],
    });

    return await Packer.toBuffer(doc);
  }

  /**
   * Generates a court-standard PDF buffer using the local headless browser engine (Chrome/Edge)
   * with full Devanagari ligatures and court margins, with automatic fallback to pure Node PDFKit.
   */
  async generatePdf(options: PdfExportOptions): Promise<Buffer> {
    // On Vercel / serverless environment, bypass external headless browser process completely
    // and generate court-standard Legal PDF via pure Node PDFKit in milliseconds.
    if (options.engine === 'node' || process.env.VERCEL || process.env.DISABLE_BROWSER_PDF === 'true') {
      return this.generatePdfFallback(options);
    }

    const browserPath = this.findBrowserPath();
    if (!browserPath) {
      return this.generatePdfFallback(options);
    }

    const pageSize = options.paperSize === 'a4' ? 'A4 portrait' : 'legal portrait';
    const tempDir = os.tmpdir();
    const sharedProfileDir = path.join(tempDir, 'legalassist_browser_pdf_profile');
    try { fs.mkdirSync(sharedProfileDir, { recursive: true }); } catch {}

    const fileId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const tempHtmlPath = path.join(tempDir, `court_doc_${fileId}.html`);
    const tempPdfPath = path.join(tempDir, `court_doc_${fileId}.pdf`);

    const fullHtml = `<!DOCTYPE html>
<html lang="mr">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(options.title || 'Legal Document')}</title>
  <style>
    @page {
      size: ${pageSize};
      margin: 1.0in 1.0in 1.0in 1.5in; /* Top: 1.0in, Right: 1.0in, Bottom: 1.0in, Left: 1.5in */
    }
    body {
      font-family: 'Noto Sans Devanagari', 'Mangal', 'Nirmala UI', 'Times New Roman', serif;
      font-size: 13pt;
      line-height: 1.75;
      color: #000;
      margin: 0;
      padding: 0;
      text-align: justify;
      white-space: pre-wrap;
    }
    p {
      margin: 0 0 8pt 0;
      text-indent: 30pt;
    }
    .no-indent, .text-center, .text-right {
      text-indent: 0 !important;
    }
    .text-center, center {
      text-align: center !important;
    }
    .text-right {
      text-align: right !important;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12pt 0;
      white-space: normal;
    }
    th, td {
      border: 1px solid #333;
      padding: 6pt 8pt;
      vertical-align: top;
      text-align: left;
    }
    th {
      background-color: #f2f2f2;
      font-weight: bold;
    }
    /* Family tree / borderless tables */
    .family-tree-table, table[border="0"] {
      border: none !important;
    }
    .family-tree-table td, .family-tree-table th,
    table[border="0"] td, table[border="0"] th {
      border: none !important;
      background: transparent !important;
      padding: 3pt 5pt;
    }
    .court-family-tree-container {
      page-break-inside: avoid;
      text-align: center;
    }
    .family-tree-title {
      text-align: center;
      font-weight: bold;
    }
  </style>
</head>
<body>
  ${unescapeHtml(options.content || '')}
</body>
</html>`;

    fs.writeFileSync(tempHtmlPath, fullHtml, 'utf8');

    const cleanup = () => {
      try { if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath); } catch {}
      try { if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath); } catch {}
    };

    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--no-pdf-header-footer',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-sync',
      '--disable-background-networking',
      '--disable-default-apps',
      `--user-data-dir=${sharedProfileDir}`,
      `--print-to-pdf=${tempPdfPath}`,
      pathToFileURL(tempHtmlPath).href
    ];

    try {
      const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        execFile(browserPath, args, { timeout: 6000 }, (err) => {
          // Check if output PDF was created successfully despite non-fatal stderr logs
          try {
            if (fs.existsSync(tempPdfPath)) {
              const buffer = fs.readFileSync(tempPdfPath);
              if (buffer && buffer.length > 0) {
                return resolve(buffer);
              }
            }
          } catch {}
          if (err) return reject(err);
          reject(new Error('PDF output file was not generated'));
        });
      });
      cleanup();
      return pdfBuffer;
    } catch (browserErr: any) {
      cleanup();
      console.warn('⚠️ Browser PDF generation unavailable or timed out:', browserErr?.message, '- using pure Node Devanagari PDF generator.');
      return await this.generatePdfFallback(options);
    }
  }

  /**
   * Pure Node.js court-standard PDF generator using PDFKit and bundled Noto Sans Devanagari typography.
   * Produces a court-standard Legal or A4 PDF with 1.5" left margin for binding.
   */
  async generatePdfFallback(options: PdfExportOptions): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const isLegal = options.paperSize !== 'a4';
        const regBuffer = this.getDevanagariRegularBuffer();
        const boldBuffer = this.getDevanagariBoldBuffer();

        const leftMargin = 108;   // 1.5 in (Court standard left binding space)
        const rightMargin = 72;   // 1.0 in
        const topMargin = 72;     // 1.0 in
        const bottomMargin = 72;  // 1.0 in
        const pageWidth = isLegal ? 612 : 595.28;
        const usableWidth = pageWidth - leftMargin - rightMargin;

        const doc = new PDFDocument({
          font: regBuffer as any,
          size: isLegal ? 'LEGAL' : 'A4',
          margins: {
            top: topMargin,
            bottom: bottomMargin,
            left: leftMargin,
            right: rightMargin
          },
          autoFirstPage: true,
          info: {
            Title: options.title || 'Legal Document',
            Author: 'LegalAssist AI'
          }
        });

        doc.registerFont('Devanagari', regBuffer);
        doc.registerFont('Devanagari-Bold', boldBuffer);
        doc.font('Devanagari');
        const fontRegistered = true;

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err: Error) => reject(err));

        const contentStr = unescapeHtml(options.content || '')
          .replace(/[↓↑←→]/g, 'v')
          .trim();
        const hasHtmlTags = /<(p|div|hr|h[1-6]|center|blockquote|table|b|strong|i|em|u|span)[\s/>]/i.test(contentStr) || isPageBreakString(contentStr);

        // Path A: Plain Text Document with Newlines (Standard Court Drafts)
        if (!hasHtmlTags) {
          const lines = contentStr.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (!trimmed) {
              doc.moveDown(0.35);
              continue;
            }

            if (isPageBreakString(trimmed)) {
              doc.addPage();
              doc.x = leftMargin;
              continue;
            }

            // Section divider or affidavit header
            if (trimmed.startsWith('------') || trimmed.includes('AFFIDAVIT') || trimmed.includes('प्रतिज्ञालेख')) {
              doc.moveDown(0.5);
              if (fontRegistered) doc.font('Devanagari-Bold');
              doc.x = leftMargin;
              doc.fontSize(13).text(trimmed, { width: usableWidth, align: 'center' });
              doc.x = leftMargin;
              if (fontRegistered) doc.font('Devanagari');
              doc.fontSize(11.5).moveDown(0.4);
              continue;
            }

            // Court title or subject line
            const isHeader = (
              i < 4 ||
              trimmed.includes('यांचे कोर्टात') ||
              trimmed.startsWith('HMP') ||
              trimmed.startsWith('विवाह अर्ज नंबर') ||
              trimmed.startsWith('विषय :-') ||
              trimmed.startsWith('सामनेवाले :')
            );

            if (isHeader) {
              if (fontRegistered) doc.font('Devanagari-Bold');
              const isCentered = trimmed.startsWith('विषय') || trimmed.includes('यांचे कोर्टात') || i === 0;
              doc.x = leftMargin;
              doc.fontSize(trimmed.startsWith('विषय') ? 12 : 12.5).text(trimmed, {
                width: usableWidth,
                align: isCentered ? 'center' : 'left',
                lineGap: 3
              });
              doc.x = leftMargin;
              if (fontRegistered) doc.font('Devanagari');
              doc.fontSize(11.5).moveDown(0.3);
              continue;
            }

            // Signatures, dates, and verification footers
            const isSignatureOrDate = (
              trimmed.startsWith('दिनांक :') ||
              trimmed.startsWith('ठिकाण :') ||
              trimmed.includes('अर्जदार क्र.') ||
              trimmed.includes('चे वकील') ||
              trimmed.includes('प्रतिज्ञालेख देणार')
            );

            if (isSignatureOrDate) {
              if (fontRegistered) doc.font('Devanagari');
              doc.x = leftMargin;
              doc.fontSize(11.5).text(trimmed, { width: usableWidth, align: 'left', lineGap: 2 });
              doc.x = leftMargin;
              continue;
            }

            // Standard court paragraph
            if (fontRegistered) doc.font('Devanagari');
            doc.x = leftMargin;
            doc.fontSize(11.5).text(trimmed, {
              width: usableWidth,
              align: 'justify',
              lineGap: 4
            });
            doc.x = leftMargin;
            doc.moveDown(0.25);
          }

          doc.end();
          return;
        }

        // Path B: Rich HTML Document (with <table>, <p>, <b>, etc.)
        const blocks = extractBlocks(contentStr);
        const globals = extractDocumentGlobals(contentStr, isLegal, { paperSize: options.paperSize } as any);
        const defaultFont = globals.docFontFamily;
        const defaultFontSizePt = Math.max(10, Math.min(globals.docFontSize / 2, 12.5));
        const defaultLineSpacing = globals.docLineSpacing;

        for (const block of blocks) {
          if (block.isPageBreak) {
            doc.addPage();
            doc.x = leftMargin;
            continue;
          }

          if (block.isTable && block.tableHtml) {
            const tableOpenTagMatch = /^(<table[^>]*>)/i.exec(block.tableHtml.trim());
            const noBorders = isTableBorderless(tableOpenTagMatch ? tableOpenTagMatch[1] : '');
            const parsedRows = extractRichTableRows(block.tableHtml, defaultFont, defaultFontSizePt);
            if (parsedRows.length > 0) {
              const numCols = Math.max(...parsedRows.map(r => r.cells.length), 1);

              // Smart proportional column widths allocation for court tables
              let colWidths: number[] = [];
              if (numCols === 4) {
                // Typical court heir / party table: Serial No (40pt), Name (185pt), Age (45pt), Relation (162pt)
                const w0 = 40;
                const w2 = 45;
                const remaining = usableWidth - w0 - w2;
                const w1 = Math.round(remaining * 0.54);
                const w3 = remaining - w1;
                colWidths = [w0, w1, w2, w3];
              } else if (numCols === 3) {
                const w0 = 45;
                const rem = usableWidth - w0;
                const w1 = Math.round(rem * 0.58);
                colWidths = [w0, w1, rem - w1];
              } else if (numCols === 2) {
                const w0 = Math.round(usableWidth * 0.35);
                colWidths = [w0, usableWidth - w0];
              } else {
                const defaultCol = usableWidth / numCols;
                colWidths = Array(numCols).fill(defaultCol);
              }

              doc.moveDown(0.4);
              for (let r = 0; r < parsedRows.length; r++) {
                const pRow = parsedRows[r];
                const isHeader = r === 0 || pRow.cells.some(c => c.isHeader);
                const isConnectorRow = noBorders && pRow.cells.every(cell => /^(?:↓|v)\s*$/.test(cell.plainText));
                let maxHeight = pRow.minHeightPt || 0;

                // Compute row height based on cell text wraps
                for (let c = 0; c < pRow.cells.length; c++) {
                  const cell = pRow.cells[c];
                  const colW = colWidths[c] || (usableWidth / numCols);
                  const cellText = cell.runs.map(run => `${'\n'.repeat(run.break || 0)}${run.text.replace(/\s+/g, ' ')}`).join('') || cell.plainText;
                  const cellFont = (isHeader || cell.runs.some(run => run.bold)) ? 'Devanagari-Bold' : 'Devanagari';
                  if (fontRegistered) doc.font(cellFont);
                  doc.fontSize(isHeader ? 10.5 : 10);
                  const textHeight = doc.heightOfString(cellText, { width: colW - 8 });
                  maxHeight = Math.max(maxHeight, Math.ceil(textHeight + (isConnectorRow ? 2 : 14)));
                }

                if (doc.y + maxHeight > (isLegal ? 930 : 760)) {
                  doc.addPage();
                  doc.x = leftMargin;
                }

                const startY = doc.y;

                // Render header background shading matching Word E8EAF0
                if (isHeader && !noBorders) {
                  doc.rect(leftMargin, startY, usableWidth, maxHeight).fill('#E8EAF0');
                }

                // Render cell texts with formatting
                let currentX = leftMargin;
                for (let c = 0; c < pRow.cells.length; c++) {
                  const cell = pRow.cells[c];
                  const colW = colWidths[c] || (usableWidth / numCols);
                  const cellAlign = cell.align || (noBorders || isHeader || c === 0 || (numCols === 4 && c === 2) ? 'center' : 'left');

                  doc.fillColor('#000000');
                  const cellRuns = cell.runs.filter(cr => (cr.text && cr.text.length > 0) || (cr.break && cr.break > 0));

                  if (cellRuns.length > 0) {
                    for (let ri = 0; ri < cellRuns.length; ri++) {
                      const crun = cellRuns[ri];
                      const isFirst = (ri === 0);
                      const isLast = (ri === cellRuns.length - 1);
                      const cfont = fontRegistered
                        ? ((isHeader || crun.bold) ? 'Devanagari-Bold' : 'Devanagari')
                        : ((isHeader || crun.bold) ? 'Helvetica-Bold' : 'Helvetica');
                      doc.font(cfont).fontSize(isHeader ? 10.5 : 10);

                      let runText = crun.text.replace(/\s+/g, ' ');
                      if (crun.break && crun.break > 0) {
                        runText = '\n'.repeat(crun.break) + runText;
                      }

                      if (isFirst) {
                        doc.text(runText, currentX + 4, startY + (isConnectorRow ? 1 : 5), {
                          width: colW - 8,
                          align: cellAlign,
                          underline: !!crun.underline,
                          continued: !isLast
                        });
                      } else {
                        doc.text(runText, {
                          underline: !!crun.underline,
                          continued: !isLast
                        });
                      }
                    }
                  } else {
                    const cfont = fontRegistered
                      ? (isHeader ? 'Devanagari-Bold' : 'Devanagari')
                      : (isHeader ? 'Helvetica-Bold' : 'Helvetica');
                    doc.font(cfont).fontSize(isHeader ? 10.5 : 10);
                    doc.text(cell.plainText, currentX + 4, startY + (isConnectorRow ? 1 : 5), {
                      width: colW - 8,
                      align: cellAlign,
                      lineBreak: true
                    });
                  }
                  currentX += colW;
                }

                if (noBorders) {
                  let borderX = leftMargin;
                  for (let c = 0; c < pRow.cells.length; c++) {
                    const cell = pRow.cells[c];
                    const colW = colWidths[c] || (usableWidth / numCols);
                    if (cell.hasTopBorder) {
                      doc.moveTo(borderX, startY).lineTo(borderX + colW, startY).lineWidth(1).strokeColor('#444444').stroke();
                    }
                    borderX += colW;
                  }
                } else {
                  // Render table row outer boundary
                  doc.rect(leftMargin, startY, usableWidth, maxHeight).strokeColor('#888888').stroke();

                  // Draw vertical grid lines between columns
                  let gridX = leftMargin;
                  for (let c = 0; c < pRow.cells.length - 1; c++) {
                    gridX += colWidths[c] || (usableWidth / numCols);
                    doc.moveTo(gridX, startY).lineTo(gridX, startY + maxHeight).strokeColor('#bbbbbb').stroke();
                  }
                }

                doc.y = startY + maxHeight;
              }

              // CRUCIAL: Reset doc.x back to the left binding margin
              doc.x = leftMargin;
              doc.moveDown(0.4);
            }
            continue;
          }

          const plainText = unescapeHtml(block.html.replace(/<[^>]+>/g, '')).trim();
          if (!plainText) {
            doc.moveDown(0.25);
            doc.x = leftMargin;
            continue;
          }

          let align: 'left' | 'center' | 'right' | 'justify' = 'justify';
          if (block.alignment === 'center' || block.isHeading) {
            align = 'center';
          } else if (block.alignment === 'right') {
            align = 'right';
          } else if (block.alignment === 'left') {
            align = 'left';
          } else if (block.alignment === 'justify') {
            align = 'justify';
          } else {
            const docxAlign = getParagraphAlignment(block.html, plainText);
            if (docxAlign === AlignmentType.CENTER) align = 'center';
            else if (docxAlign === AlignmentType.RIGHT) align = 'right';
            else if (docxAlign === AlignmentType.LEFT) align = 'left';
            else align = 'justify';
          }

          if (plainText.startsWith('------') || plainText.includes('AFFIDAVIT') || plainText.includes('प्रतिज्ञालेख')) {
            align = 'center';
          }

          const { before, after } = getParagraphMarginSpacing(block.openTag, block.html);
          const beforePt = Math.max(0, Math.round(before / 20));
          const afterPt = Math.max(0, Math.round(after / 20));

          const lineSpacingDxa = getParagraphLineSpacing(block.openTag, block.html, defaultLineSpacing);
          const lineSpacingRatio = lineSpacingDxa / 240;
          const currentLineGap = Math.max(2, Math.round((lineSpacingRatio - 1) * defaultFontSizePt + 2));

          const indentDxa = getParagraphIndent(block.openTag, block.html);
          let indentPt = 0;
          if (indentDxa !== undefined) {
            indentPt = Math.round(indentDxa / 20);
          } else if (align === 'center' || align === 'right' || block.isHeading) {
            indentPt = 0;
          } else {
            indentPt = 0;
          }

          if (doc.y > (isLegal ? 930 : 760)) {
            doc.addPage();
            doc.x = leftMargin;
          }

          if (beforePt > 0) {
            doc.y += Math.min(beforePt, 20);
          }

          const runs = mergeEquivalentRuns(parseParagraphToRuns(block.html, defaultFont, defaultFontSizePt));
          const filteredRuns = runs.filter(r => (r.text && r.text.length > 0) || (r.break && r.break > 0));

          if (filteredRuns.length === 0) {
            doc.moveDown(0.25);
            doc.x = leftMargin;
            continue;
          }

          doc.x = leftMargin;
          for (let i = 0; i < filteredRuns.length; i++) {
            const run = filteredRuns[i];
            const isFirst = (i === 0);
            const isLast = (i === filteredRuns.length - 1);
            const runFontSize = block.isHeading
              ? Math.max(run.fontSize || defaultFontSizePt, 13)
              : (run.fontSize || defaultFontSizePt);

            let fontName = 'Devanagari';
            if (fontRegistered) {
              fontName = (run.bold || block.isHeading) ? 'Devanagari-Bold' : 'Devanagari';
            } else {
              fontName = (run.bold || block.isHeading) ? 'Helvetica-Bold' : 'Helvetica';
            }

            doc.font(fontName).fontSize(runFontSize).fillColor('#000000');

            let runText = run.text.replace(/\s+/g, ' ');
            if (run.break && run.break > 0) {
              runText = '\n'.repeat(run.break) + runText;
            }

            if (isFirst) {
              doc.text(runText, {
                width: usableWidth,
                align,
                indent: indentPt,
                lineGap: currentLineGap,
                underline: !!run.underline,
                continued: !isLast
              });
            } else {
              doc.text(runText, {
                underline: !!run.underline,
                continued: !isLast
              });
            }
          }

          doc.x = leftMargin;
          if (afterPt > 0) {
            doc.y += Math.min(afterPt, 20);
          } else {
            doc.moveDown(block.isHeading ? 0.4 : 0.25);
          }
        }
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private getDevanagariRegularBuffer(): Buffer {
    const regFontPath = this.findFontPath('NotoSansDevanagari-Regular.ttf');
    if (regFontPath) {
      try {
        return fs.readFileSync(regFontPath);
      } catch {}
    }
    return getEmbeddedDevanagariRegular();
  }

  private getDevanagariBoldBuffer(): Buffer {
    const boldFontPath = this.findFontPath('NotoSansDevanagari-Bold.ttf');
    if (boldFontPath) {
      try {
        return fs.readFileSync(boldFontPath);
      } catch {}
    }
    return getEmbeddedDevanagariBold();
  }

  private findFontPath(fontFilename: string): string | null {
    const candidates = [
      path.join(__dirname, '../assets/fonts', fontFilename),
      path.join(__dirname, '../../assets/fonts', fontFilename),
      path.join(__dirname, '../../../assets/fonts', fontFilename),
      path.join(__dirname, 'assets/fonts', fontFilename),
      path.join(process.cwd(), 'src', 'assets', 'fonts', fontFilename),
      path.join(process.cwd(), 'assets', 'fonts', fontFilename),
      path.join(process.cwd(), 'server', 'src', 'assets', 'fonts', fontFilename),
      path.join(process.cwd(), 'server', 'assets', 'fonts', fontFilename),
      path.join(process.cwd(), 'dist', 'assets', 'fonts', fontFilename),
      path.join('C:\\Windows\\Fonts', fontFilename.includes('Bold') ? 'NirmalaB.ttf' : 'Nirmala.ttf'),
      path.join('C:\\Windows\\Fonts', 'mangal.ttf')
    ];

    for (const c of candidates) {
      if (c && fs.existsSync(c)) {
        return c;
      }
    }
    return null;
  }

  private findBrowserPath(): string | null {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      return process.env.CHROME_PATH;
    }
    if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
      return process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    const winCandidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ...(process.env.LOCALAPPDATA ? [
        path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ] : []),
      ...(process.env.PROGRAMFILES ? [
        path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ] : []),
      ...(process.env['PROGRAMFILES(X86)'] ? [
        path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ] : [])
    ];

    const linuxCandidates = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    ];

    const macCandidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ];

    const all = [...winCandidates, ...linuxCandidates, ...macCandidates];
    for (const candidate of all) {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }
}

export const exportService = new ExportService();
