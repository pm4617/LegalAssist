import {
  Document, Paragraph, TextRun, AlignmentType, LineRuleType, Packer, PageBreak,
  Table, TableRow, TableCell, BorderStyle, WidthType, VerticalAlign,
} from 'docx';

export interface DocxExportOptions {
  title: string;
  content: string;
  isDevanagari?: boolean;
  paperSize?: 'a4' | 'legal';
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
  // Explicit inline style alignment & tags & tailwind classes
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

  // Markdown heading
  if (/^#+\s+/.test(rawText.trim())) {
    return AlignmentType.CENTER;
  }

  // Automatic court petition header detection
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

interface StyleState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

/**
 * Sanitize HTML that may contain multi-line or complex attributes (e.g. Word-style mso-* spans).
 * Runs on the FULL document string BEFORE block splitting so that no raw tag fragments
 * survive into individual block strings.
 *
 * Steps:
 *  1. Collapse all whitespace inside HTML tags (handles attributes spanning multiple lines)
 *  2. Remove non-content <span> elements: lang=, mso-*, AR-SA, Noto Sans etc.
 *  3. Promote meaningful inline styles (bold/italic/underline) to simple b/i/u tags
 *  4. Defensively strip any remaining unmatched < ... sequences (unclosed tags)
 */
function sanitizeAndMarkupHtml(raw: string): string {
  // Step 1: Collapse newlines / runs of whitespace INSIDE HTML tags.
  // [^>]* does NOT need dotAll — it already matches \n since [^>] means "not >"
  let s = raw.replace(/<([^>]*)>/g, (_match, inner) => {
    const collapsed = inner.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return `<${collapsed}>`;
  });

  // Step 2: Strip spans that carry ONLY Word/mso presentation info with no useful content role.
  // These include: lang="AR-SA", lang="HI", mso-bidi-language, Noto Sans Devanagari, etc.
  // Strategy: unwrap the span (keep inner text), then let the rest of the pipeline handle it.
  s = s
    // Remove spans with lang attribute (AR-SA, HI, etc.) — unwrap inner content
    .replace(/<span[^>]*\blang=["'][^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, '$1')
    // Remove spans with only mso-* styles — unwrap inner content
    .replace(/<span[^>]*\bmso-[a-z-]+:[^>]*>([\s\S]*?)<\/span>/gi, '$1')
    // Remove font-family spans that only set Noto / Mangal / Arial — unwrap inner content
    .replace(/<span[^>]*font-family:[^>]*>([\s\S]*?)<\/span>/gi, '$1');

  // Step 3: Promote meaningful inline styles to semantic tags (BEFORE generic stripping)
  s = s
    .replace(/<span[^>]*font-weight:\s*bold[^>]*>([\s\S]*?)<\/span>/gi, '<b>$1</b>')
    .replace(/<span[^>]*font-style:\s*italic[^>]*>([\s\S]*?)<\/span>/gi, '<i>$1</i>')
    .replace(/<span[^>]*text-decoration:\s*underline[^>]*>([\s\S]*?)<\/span>/gi, '<u>$1</u>');

  // Step 4: Strip any remaining orphan/unclosed tag-like sequences: < followed by non-> text
  // that never closes (a sign of a tag that was truncated mid-attribute).
  // We replace them with an empty string.
  s = s.replace(/<[^>]*$/gm, '');   // remove tag fragment at end of a line with no closing >
  s = s.replace(/^[^<]*>/gm, '');   // remove dangling > at start of a line (leftover close)

  return s;
}


function parseParagraphToTextRuns(
  blockHtml: string,
  defaultFont: string,
  defaultFontSize: number
): TextRun[] {
  const runs: TextRun[] = [];

  // 1. Unescape HTML entities
  const unescaped = unescapeHtml(blockHtml);

  // 2. Sanitize: collapse multi-line attributes and promote mso-style formatting
  const sanitized = sanitizeAndMarkupHtml(unescaped);

  // 3. Now tokenize safely — all tags are single-line after sanitization
  const tokens = sanitized.split(/(<[^>]+>)/g);

  const styleStack: StyleState[] = [{ bold: false, italic: false, underline: false }];
  let currentStyle: StyleState = { bold: false, italic: false, underline: false };
  let pendingBreak = 0;

  // Plain text for heading detection (strip all tags cleanly after sanitization)
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
            fontSize = Math.round(pt * 2); // convert pt to docx half-points
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
      // Text token — must not contain any angle brackets (residual from un-closed tags).
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

  // Fallback: if tokenizer produced nothing, use the stripped plain text
  if (runs.length === 0 && plainTextOnly.length > 0) {
    runs.push(new TextRun({ text: plainTextOnly, font: defaultFont, size: defaultFontSize }));
  }

  return runs;
}

/**
 * Extract alignment from a block's opening tag attributes.
 * Handles: style="text-align: center", align="center", <center>, [center], class="text-center"
 */
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

/**
 * Structured block extracted from HTML — carries both content HTML and its resolved alignment.
 */
interface HtmlBlock {
  html: string;        // Inner HTML content of the block (for paragraphs)
  tableHtml: string;   // Full raw HTML of a <table> element (for table blocks)
  alignment: string;   // 'left' | 'right' | 'center' | 'justify' | ''
  isPageBreak: boolean;
  isHeading: boolean;
  isTable: boolean;
}

/**
 * Check if a string snippet contains any page break indicator tag, class, style, or marker.
 */
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

/**
 * Parse the sanitized HTML into a list of structured blocks.
 *
 * Strategy:
 *  - If there are NO block-level tags, split on newlines.
 *  - Tables (<table>...</table>) are extracted as isTable blocks.
 *  - Page breaks (<div class="page-break">, <hr class="page-break">, [page-break], etc.) become isPageBreak blocks.
 *  - Other block elements: <p>, <div>, <h1-6>, <center>, blockquote
 *  - Anything between block tags becomes its own text block.
 */
function extractBlocks(content: string): HtmlBlock[] {
  const html = (content || '').trim();
  if (!html) return [];

  const hasBlockTags = /<(p|div|hr|h[1-6]|center|blockquote|table)[\s/>]/i.test(html) || isPageBreakString(html);

  if (!hasBlockTags) {
    // Plain text / newline-separated
    return html.split(/\r?\n/).map((line) => {
      const isPB = isPageBreakString(line);
      return {
        html: isPB ? '' : line,
        tableHtml: '',
        alignment: '',
        isPageBreak: isPB,
        isHeading: false,
        isTable: false,
      };
    });
  }

  const blocks: HtmlBlock[] = [];

  // Match top-level block elements including <table>, <hr>, <p>, <div>, <h1-6>, <center>, <blockquote>
  // Also match self-closing <hr/>, <br/> and bare text / comments between blocks
  const blockRe = /(<(table)([\s][^>]*)?>)([\s\S]*?)<\/table>|(<(p|div|hr|h[1-6]|center|blockquote)(\s[^>]*)?>)([\s\S]*?)<\/\6>|(<(?:hr|br|div|p)\s*\/?>)|([^<]+(?:<(?!\/?(p|div|hr|h[1-6]|center|blockquote|table)[\s/>])[^>]*>[^<]*)*)/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(html)) !== null) {
    lastIndex = blockRe.lastIndex;

    if (match[1] && match[2]?.toLowerCase() === 'table') {
      // *** TABLE BLOCK ***
      const fullTableHtml = match[1] + (match[4] || '') + '</table>';
      blocks.push({
        html: '', tableHtml: fullTableHtml,
        alignment: '', isPageBreak: false, isHeading: false, isTable: true,
      });

    } else if (match[5]) {
      // *** PARAGRAPH / DIV / HR / HEADING / BLOCKQUOTE ***
      const openTag = match[5];
      const tagName = (match[6] || '').toLowerCase();
      const innerHtml = match[8] || '';

      // Page break detection: check opening tag, tag name, or inner content
      if (isPageBreakString(openTag) || isPageBreakString(innerHtml) || tagName === 'hr') {
        blocks.push({ html: '', tableHtml: '', alignment: '', isPageBreak: true, isHeading: false, isTable: false });
        continue;
      }

      // Detect alignment from wrapper tag first
      let alignment = getAlignmentFromTag(openTag) || '';
      if (tagName === 'center') alignment = 'center';
      const isHeading = /^h[1-6]$/.test(tagName);
      if (isHeading && !alignment) alignment = 'center';

      // Try nested inner tag for alignment if still unset
      if (!alignment) {
        const innerMatch = /^<(div|p|span)[^>]*>/.exec(innerHtml.trim());
        if (innerMatch) alignment = getAlignmentFromTag(innerMatch[0]) || '';
      }

      blocks.push({ html: innerHtml, tableHtml: '', alignment, isPageBreak: false, isHeading, isTable: false });

    } else if (match[9]) {
      // Self-closing <hr/> or <br/> or <div/>
      const selfTag = match[9];
      if (isPageBreakString(selfTag) || /^<hr/i.test(selfTag)) {
        blocks.push({ html: '', tableHtml: '', alignment: '', isPageBreak: true, isHeading: false, isTable: false });
      } else {
        // <br> → empty paragraph
        blocks.push({ html: '', tableHtml: '', alignment: '', isPageBreak: false, isHeading: false, isTable: false });
      }

    } else if (match[10]) {
      // Raw text between block elements
      const raw = match[10].trim();
      if (raw) {
        if (isPageBreakString(raw)) {
          blocks.push({ html: '', tableHtml: '', alignment: '', isPageBreak: true, isHeading: false, isTable: false });
        } else {
          blocks.push({ html: raw, tableHtml: '', alignment: '', isPageBreak: false, isHeading: false, isTable: false });
        }
      }
    }
  }

  // If regex matched nothing meaningful, fall back to newline split
  if (blocks.length === 0) {
    return html.split(/\r?\n/).map((line) => ({
      html: isPageBreakString(line) ? '' : line,
      tableHtml: '',
      alignment: '',
      isPageBreak: isPageBreakString(line),
      isHeading: false,
      isTable: false,
    }));
  }

  return blocks;
}

/**
 * Parse an HTML <table> string into a docx Table object.
 * Handles <thead>, <tbody>, <tr>, <th>, <td>.
 */
function parseTableToDocx(tableHtml: string, defaultFont: string, defaultFontSize: number): Table {
  const rows: TableRow[] = [];

  // Extract all <tr> elements (greedy-safe since we work on a single table's HTML)
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRe.exec(tableHtml)) !== null) {
    const trInner = trMatch[1] || '';
    const cells: TableCell[] = [];

    // Extract <th> and <td> cells
    const cellRe = /<(th|td)([^>]*)>([\s\S]*?)<\/\1>/gi;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRe.exec(trInner)) !== null) {
      const isHeader = cellMatch[1].toLowerCase() === 'th';
      const cellAttrs = cellMatch[2] || '';
      const cellInner = cellMatch[3] || '';

      // colspan support
      const colspanMatch = /colspan=["']?(\d+)["']?/i.exec(cellAttrs);
      const colspan = colspanMatch ? parseInt(colspanMatch[1], 10) : 1;

      // rowspan support
      const rowspanMatch = /rowspan=["']?(\d+)["']?/i.exec(cellAttrs);
      const rowspan = rowspanMatch ? parseInt(rowspanMatch[1], 10) : 1;

      // Cell alignment
      const cellAlignRaw = getAlignmentFromTag(`<td${cellAttrs}>`);
      const cellAlign =
        cellAlignRaw === 'center' ? AlignmentType.CENTER :
        cellAlignRaw === 'right'  ? AlignmentType.RIGHT  :
        cellAlignRaw === 'justify' ? AlignmentType.JUSTIFIED :
        AlignmentType.LEFT;

      // Parse cell content as text runs
      const plainCellText = unescapeHtml(cellInner.replace(/<[^>]+>/g, '')).trim();
      const cellRuns = plainCellText
        ? parseParagraphToTextRuns(cellInner, defaultFont, defaultFontSize)
        : [new TextRun({ text: '', font: defaultFont, size: defaultFontSize })];

      // Bold for header cells
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

/**
 * Extract paragraph line spacing from HTML style attributes.
 * Reads style="line-height: 1.5" or similar inline styles.
 * Returns dxa line spacing for docx LineRuleType.AUTO (240 = 1.0x standard single line spacing per template).
 */
function getParagraphLineSpacing(html: string): number {
  if (!html) return 240;
  const match = /line-height:\s*([\d.]+)/i.exec(html);
  if (match) {
    const val = parseFloat(match[1]);
    if (!isNaN(val) && val > 0) {
      return Math.round(val * 240);
    }
  }
  return 240; // Default to standard template 1.0x line spacing
}

export class ExportService {
  async generateDocx(options: DocxExportOptions): Promise<Buffer> {
    const { content, isDevanagari = false, paperSize = 'a4' } = options;
    const defaultFont = isDevanagari ? 'Mangal' : 'Times New Roman';
    const defaultFontSize = 24; // 12pt (docx uses half-points: 24 = 12pt)

    const pageSize =
      paperSize === 'a4'
        ? { width: 11906, height: 16838 } // A4: 210mm x 297mm
        : { width: 12240, height: 20160 }; // Legal: 8.5" x 14.0"

    // Sanitize BEFORE splitting into blocks
    const sanitizedContent = sanitizeAndMarkupHtml(unescapeHtml(content || ''));

    const blocks = extractBlocks(sanitizedContent);
    const children: (Paragraph | Table)[] = [];

    for (const block of blocks) {
      // Page Break
      if (block.isPageBreak) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
        continue;
      }

      // Table block
      if (block.isTable) {
        try {
          const table = parseTableToDocx(block.tableHtml, defaultFont, defaultFontSize);
          children.push(table);
          // Add a small empty paragraph after table for spacing
          children.push(new Paragraph({
            spacing: { before: 0, after: 60, line: 240, lineRule: LineRuleType.AUTO },
            children: [new TextRun({ text: '', font: defaultFont, size: defaultFontSize })],
          }));
        } catch {
          // If table parse fails, skip silently
        }
        continue;
      }

      const plainText = unescapeHtml(block.html.replace(/<[^>]+>/g, '')).trim();

      // Empty paragraph (spacing)
      if (!plainText) {
        children.push(new Paragraph({
          spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
          children: [new TextRun({ text: '', font: defaultFont, size: defaultFontSize })],
        }));
        continue;
      }

      // Determine alignment: block metadata → style detection → heuristics
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

      const lineSpacing = getParagraphLineSpacing(block.html);
      const runs = parseParagraphToTextRuns(block.html, defaultFont, defaultFontSize);

      children.push(new Paragraph({
        alignment,
        spacing: {
          before: 0,
          after: 120,                // 6pt gap after paragraph
          line: lineSpacing,          // Line spacing as specified per template (defaults to 240 = 1.0x)
          lineRule: LineRuleType.AUTO,
        },
        children: runs,
      }));
    }

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              size: pageSize,
              margin: {
                top: 1440,    // 1.0 inch — Top
                bottom: 1440, // 1.0 inch — Bottom
                left: 2160,   // 1.5 inch — Left (Court binding side)
                right: 1440,  // 1.0 inch — Right
              },
            },
          },
          children,
        },
      ],
    });

    return await Packer.toBuffer(doc);
  }
}

export const exportService = new ExportService();


