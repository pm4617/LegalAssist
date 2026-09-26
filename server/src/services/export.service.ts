import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import {
  Document, Paragraph, TextRun, AlignmentType, LineRuleType, Packer, PageBreak,
  Table, TableRow, TableCell, BorderStyle, WidthType, VerticalAlign,
} from 'docx';

export interface PdfExportOptions {
  title: string;
  content: string;
  paperSize?: 'a4' | 'legal';
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

  s = s
    .replace(/<span[^>]*\blang=["'][^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, '$1')
    .replace(/<span[^>]*\bmso-[a-z-]+:[^>]*>([\s\S]*?)<\/span>/gi, '$1')
    .replace(/<span[^>]*font-family:[^>]*>([\s\S]*?)<\/span>/gi, '$1');

  s = s
    .replace(/<span[^>]*font-weight:\s*bold[^>]*>([\s\S]*?)<\/span>/gi, '<b>$1</b>')
    .replace(/<span[^>]*font-style:\s*italic[^>]*>([\s\S]*?)<\/span>/gi, '<i>$1</i>')
    .replace(/<span[^>]*text-decoration:\s*underline[^>]*>([\s\S]*?)<\/span>/gi, '<u>$1</u>');

  s = s.replace(/<[^>]*$/gm, '');
  s = s.replace(/^[^<]*>/gm, '');

  return s;
}

function parseParagraphToTextRuns(
  blockHtml: string,
  defaultFont: string,
  defaultFontSize: number
): TextRun[] {
  const runs: TextRun[] = [];
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
            const pt = unit === 'px' ? val * 0.75 : val;
            fontSize = Math.round(pt * 2);
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
      let text = token.replace(/<[^>]*$/g, '').replace(/^[^<]*>/g, '');

      if (isMdHeading) {
        text = text.replace(/^#+\s+/, '');
      }

      if (text.length > 0) {
        runs.push(
          new TextRun({
            text,
            font: currentStyle.fontFamily || defaultFont,
            size: currentStyle.fontSize || defaultFontSize,
            bold: currentStyle.bold || isMdHeading,
            italics: currentStyle.italic,
            underline: currentStyle.underline ? {} : undefined,
            break: pendingBreak > 0 ? pendingBreak : undefined,
          })
        );
        pendingBreak = 0;
      }
    }
  }

  if (pendingBreak > 0) {
    runs.push(new TextRun({ text: '', font: defaultFont, size: defaultFontSize, break: pendingBreak }));
  }

  if (runs.length === 0 && plainTextOnly.length > 0) {
    runs.push(new TextRun({ text: plainTextOnly, font: defaultFont, size: defaultFontSize }));
  }

  return runs;
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

function extractBlocks(content: string): HtmlBlock[] {
  const html = (content || '').trim();
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

function parseTableToDocx(tableHtml: string, defaultFont: string, defaultFontSize: number): Table {
  const rows: TableRow[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRe.exec(tableHtml)) !== null) {
    const trInner = trMatch[1] || '';
    const cells: TableCell[] = [];
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

      const cellAlignRaw = getAlignmentFromTag(`<td${cellAttrs}>`);
      const cellAlign =
        cellAlignRaw === 'center' ? AlignmentType.CENTER :
        cellAlignRaw === 'right'  ? AlignmentType.RIGHT  :
        cellAlignRaw === 'justify' ? AlignmentType.JUSTIFIED :
        AlignmentType.LEFT;

      const plainCellText = unescapeHtml(cellInner.replace(/<[^>]+>/g, '')).trim();
      const cellRuns = plainCellText
        ? parseParagraphToTextRuns(cellInner, defaultFont, defaultFontSize)
        : [new TextRun({ text: '', font: defaultFont, size: defaultFontSize })];

      if (isHeader) {
        cellRuns.forEach((r: any) => { if (r._data) r._data.bold = true; });
      }

      const borderStyle = {
        style: BorderStyle.SINGLE,
        size: 6,
        color: '000000',
      };

      cells.push(new TableCell({
        columnSpan: colspan > 1 ? colspan : undefined,
        rowSpan: rowspan > 1 ? rowspan : undefined,
        verticalAlign: VerticalAlign.CENTER,
        shading: isHeader ? { fill: 'E8EAF0' } : undefined,
        borders: {
          top: borderStyle, bottom: borderStyle,
          left: borderStyle, right: borderStyle,
        },
        children: [
          new Paragraph({
            alignment: cellAlign,
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
   * Generates a court-standard PDF buffer using the local headless browser engine (Edge/Chrome/Chromium)
   * with full Devanagari ligatures and court margins.
   */
  async generatePdf(options: PdfExportOptions): Promise<Buffer> {
    const browserPath = this.findBrowserPath();
    if (!browserPath) {
      throw new Error('No compatible browser (Edge/Chrome/Chromium) found for PDF export.');
    }

    const pageSize = options.paperSize === 'a4' ? 'A4 portrait' : 'legal portrait';
    const tempDir = os.tmpdir();
    const tempHtmlPath = path.join(tempDir, `court_doc_${Date.now()}_${Math.random().toString(36).substring(7)}.html`);
    const tempPdfPath = path.join(tempDir, `court_doc_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`);

    const fullHtml = `<!DOCTYPE html>
<html lang="mr">
<head>
  <meta charset="UTF-8">
  <title>${options.title || 'Legal Document'}</title>
  <style>
    @page {
      size: ${pageSize};
      margin: 1.2in 1.0in 1.0in 1.5in; /* Standard Court Margin with Left Binding Space */
    }
    body {
      font-family: 'Times New Roman', 'Mangal', 'Nirmala UI', 'Arial Unicode MS', serif;
      font-size: 13pt;
      line-height: 1.75;
      color: #000;
      margin: 0;
      padding: 0;
      text-align: justify;
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
  </style>
</head>
<body>
  ${options.content || ''}
</body>
</html>`;

    fs.writeFileSync(tempHtmlPath, fullHtml, 'utf8');

    return new Promise<Buffer>((resolve, reject) => {
      const args = [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--no-pdf-header-footer',
        `--print-to-pdf=${tempPdfPath}`,
        tempHtmlPath
      ];

      execFile(browserPath, args, { timeout: 30000 }, (err) => {
        try { fs.unlinkSync(tempHtmlPath); } catch {}
        if (err) {
          try { fs.unlinkSync(tempPdfPath); } catch {}
          return reject(err);
        }
        try {
          if (!fs.existsSync(tempPdfPath)) {
            return reject(new Error('PDF output file was not generated'));
          }
          const pdfBuffer = fs.readFileSync(tempPdfPath);
          try { fs.unlinkSync(tempPdfPath); } catch {}
          resolve(pdfBuffer);
        } catch (readErr) {
          reject(readErr);
        }
      });
    });
  }

  private findBrowserPath(): string | null {
    const winCandidates = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ...(process.env.LOCALAPPDATA ? [
        path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
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
