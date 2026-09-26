/**
 * Date utility helpers for Marathi Court Pleadings and Documents
 */

export const MARATHI_MONTHS = [
  'जानेवारी',
  'फेब्रुवारी',
  'मार्च',
  'एप्रिल',
  'मे',
  'जून',
  'जुलै',
  'ऑगस्ट',
  'सप्टेंबर',
  'ऑक्टोबर',
  'नोव्हेंबर',
  'डिसेंबर'
] as const;

/**
 * Converts any Marathi/Devanagari numerals (०-९) into English numbers (0-9).
 */
export function toEnglishDigits(str: string): string {
  if (!str) return '';
  const devanagariToEnglish: Record<string, string> = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
  };
  return String(str).replace(/[०-९]/g, (d) => devanagariToEnglish[d] || d);
}

/**
 * Returns current system date in DD-MON-YYYY format.
 * Numbers (Day and Year) are ALWAYS in English numbers (e.g. 25-सप्टेंबर-2026).
 */
export function getMarathiTodayDate(date: Date = new Date()): string {
  const dd = toEnglishDigits(String(date.getDate()).padStart(2, '0'));
  const mon = MARATHI_MONTHS[date.getMonth()];
  const yyyy = toEnglishDigits(String(date.getFullYear()));
  return `${dd}-${mon}-${yyyy}`;
}

/**
 * Removes all remaining placeholder tags with brackets and replaces with empty spaces.
 * Handles {fieldName}, &lbrace;fieldName&rbrace;, {<span>fieldName</span>}, etc.
 */
export function removePlaceholdersWithSpaces(html: string): string {
  if (!html) return '';
  let cleaned = html;

  // 1. Tag-separated or entity-encoded placeholders: {fieldName}, &lbrace;fieldName&rbrace;, etc.
  cleaned = cleaned.replace(
    /(?:\{|&lbrace;|&#123;|&#x7b;)(?:<[^>]*>)*\s*[a-zA-Z0-9_\-\u0900-\u097F]+\s*(?:<[^>]*>)*(?:\}|&rbrace;|&#125;|&#x7d;)/gi,
    ' '
  );

  // 2. Generic curly bracket placeholders: {anything}
  cleaned = cleaned.replace(/\{[a-zA-Z0-9_\-\s\u0900-\u097F]+\}/gi, ' ');

  // 3. Empty bracket pairs: { }, {}
  cleaned = cleaned.replace(/\{\s*\}/g, ' ');

  return cleaned;
}

/**
 * If entire table row is having empty / space value, removes that row from HTML table.
 * Also removes rows where only a serial number exists in cell 0 and all other data cells are empty.
 */
export function removeEmptyTableRows(html: string): string {
  if (!html || !html.includes('<tr')) return html;

  return html.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (fullRow, rowInner) => {
    // Always preserve table headers (<th>)
    if (/<th\b[^>]*>/i.test(rowInner)) {
      return fullRow;
    }

    const tdRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    const cellTexts: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = tdRe.exec(rowInner)) !== null) {
      const cellContent = match[1] || '';
      const text = cellContent
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#160;/gi, ' ')
        .replace(/&zwnj;/gi, '')
        .replace(/&zwj;/gi, '')
        .trim();
      cellTexts.push(text);
    }

    if (cellTexts.length === 0) {
      return '';
    }

    // 1. If every cell in this row is completely empty or spaces
    const allCellsEmpty = cellTexts.every((text) => text.length === 0);
    if (allCellsEmpty) {
      return '';
    }

    // 2. If multi-cell row where first cell is only a serial number/index and all other data cells are empty
    if (cellTexts.length > 1) {
      const firstCell = cellTexts[0];
      const isSerialOrBullet = /^[\s\d०-९\.\-#\(\)\-]*$/.test(firstCell);
      const remainingCellsEmpty = cellTexts.slice(1).every((text) => text.length === 0);
      if (isSerialOrBullet && remainingCellsEmpty) {
        return '';
      }
    }

    return fullRow;
  });
}

const ROMAN_LOWER_LIST = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
const ROMAN_UPPER_LIST = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const DEVANAGARI_DIGITS_LIST = ['१', '२', '३', '४', '५', '६', '७', '८', '९', '१०'];

function formatChoiceIndex(index: number, type: string): string {
  const i = index - 1;
  switch (type) {
    case 'roman_lower': return ROMAN_LOWER_LIST[i] || String(index);
    case 'roman_upper': return ROMAN_UPPER_LIST[i] || String(index);
    case 'letter_lower': return String.fromCharCode(97 + i);
    case 'letter_upper': return String.fromCharCode(65 + i);
    case 'devanagari': return DEVANAGARI_DIGITS_LIST[i] || String(index);
    default: return String(index);
  }
}

function detectBulletType(raw: string): string | null {
  const s = raw.trim();
  if (/^[ivxlcdm]+$/i.test(s)) {
    return s === s.toLowerCase() ? 'roman_lower' : 'roman_upper';
  }
  if (/^[a-z]$/i.test(s)) {
    return s === s.toLowerCase() ? 'letter_lower' : 'letter_upper';
  }
  if (/^[\u0966-\u096F]+$/.test(s)) {
    return 'devanagari';
  }
  if (/^\d+$/.test(s)) {
    return 'number';
  }
  return null;
}

/**
 * Re-indexes remaining list items sequentially (e.g. if [ ii ] is the only remaining item, it becomes [ i ])
 */
export function renumberChoiceLines(html: string): string {
  if (!html) return '';

  const blockRe = /<(div|p|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

  let currentListType: string | null = null;
  let currentListBracket: string | null = null;
  let currentIndex = 0;
  let lastBlockEndPos = 0;

  return html.replace(blockRe, (fullBlock, tag, attrs, inner, offset) => {
    // If the gap between blocks has long text (>400 chars) or major breaks, reset sequence
    if (offset - lastBlockEndPos > 500) {
      currentListType = null;
      currentListBracket = null;
      currentIndex = 0;
    }
    lastBlockEndPos = offset + fullBlock.length;

    // Matches leading bracket/bullet: e.g. [ ii ], [  ii  ], (ii), [ 2 ], etc.
    const markerMatch = inner.match(/^((?:<[^>]*>|&nbsp;|\s)*)(\[|\(|\b)\s*([ivxlcdm]+|[a-z]|\d+|[\u0966-\u096F]+)\s*(\]|\)|\.)((?:<[^>]*>|\s)*)/i);

    if (!markerMatch) {
      const plain = inner.replace(/<[^>]*>/g, '').trim();
      if (plain.length > 80) {
        currentListType = null;
        currentListBracket = null;
        currentIndex = 0;
      }
      return fullBlock;
    }

    const [allMatched, leadingGarbage, openB, rawVal, closeB, trailingSpace] = markerMatch;
    const bulletType = detectBulletType(rawVal);

    if (!bulletType) {
      return fullBlock;
    }

    // Ignore page breaks or long citation brackets like [page-break]
    if (openB === '[' && (rawVal.toLowerCase() === 'page' || rawVal.length > 5)) {
      return fullBlock;
    }

    const bracketStyle = openB;

    if (currentListType === bulletType && currentListBracket === bracketStyle) {
      currentIndex++;
    } else {
      currentListType = bulletType;
      currentListBracket = bracketStyle;
      currentIndex = 1;
    }

    const newFormattedVal = formatChoiceIndex(currentIndex, bulletType);
    const replacedMarker = leadingGarbage + openB + ' ' + newFormattedVal + ' ' + closeB + trailingSpace;

    const newInner = inner.replace(markerMatch[0], replacedMarker);
    return '<' + tag + attrs + '>' + newInner + '</' + tag + '>';
  });
}

/**
 * Removes orphan checklist bullets, brackets, or unentered choice options (e.g. "[ i ]", "[ iii ]",
 * "[ v ] इतर कारण :") where the placeholder was not provided or was replaced with spaces,
 * and sequentially re-indexes remaining items (e.g. [ ii ] becomes [ i ]).
 */
export function removeUnenteredChoiceLines(html: string): string {
  if (!html) return '';
  // 1. Strip empty option lines
  const cleaned = html.replace(/<(div|p|li)[^>]*>([\s\S]*?)<\/\1>/gi, (fullTag, tag, inner) => {
    const plainText = inner
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#160;/gi, ' ')
      .replace(/&zwnj;|&zwj;/gi, '')
      .trim();

    if (!plainText) return '';

    // 1. Standalone brackets/bullets like "[ i ]", "[ ii ]", "(a)", "1.", "(1)", "[ 1 ]", etc.
    const isAloneBullet =
      /^\[\s*(?:[ivxlcdm]+|\d+|[a-z]|[\u0966-\u096F]+)\s*\]\s*$/i.test(plainText) ||
      /^\(?\s*(?:[ivxlcdm]+|\d+|[a-z]|[\u0966-\u096F]+)\s*[\)\.\-:]\s*$/i.test(plainText);
    if (isAloneBullet) return '';

    // 2. Bracket + trailing label without user data: "[ v ] इतर कारण :", "इतर कारण :", "[ v ] इतर :", "Other reason :"
    const isDanglingLabel =
      /^\[\s*(?:[ivxlcdm]+|\d+|[a-z]|[\u0966-\u096F]+)\s*\]\s*(?:इतर\s*(?:कारण|तपशील|शेरा|माहिती)|other\s*(?:reason|details)|any\s*other)?\s*[:\-\.]?\s*$/i.test(plainText) ||
      /^(?:इतर\s*(?:कारण|तपशील|शेरा|माहिती)|other\s*(?:reason|details)|any\s*other)\s*[:\-\.]?\s*$/i.test(plainText);
    if (isDanglingLabel) return '';

    return fullTag;
  });

  // 2. Sequentially renumber remaining list items (e.g. [ ii ] -> [ i ])
  return renumberChoiceLines(cleaned);
}

const DEVANAGARI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

export function toDevanagariDigits(num: number): string {
  return String(num)
    .split('')
    .map((d) => DEVANAGARI_DIGITS[parseInt(d, 10)] || d)
    .join('');
}

/**
 * Validates whether a given string is a genuine party/applicant/accused name
 * or just a dummy/generic placeholder.
 */
export function isValidPartyValue(val: any): boolean {
  if (val === undefined || val === null) return false;
  const str = String(val).trim();
  if (str.length === 0) return false;

  // Characters that are just underlines, hyphens, dots, spaces
  if (/^[\s\-_.\u2013\u2014]+$/.test(str)) return false;

  const lower = str.toLowerCase();
  const nullWords = ['n/a', 'na', 'none', 'nil', 'null', 'undefined', 'लागू नाही', 'कोणीही नाही', 'नाव', 'नामे'];
  if (nullWords.includes(lower)) {
    return false;
  }

  // Generic template placeholder texts in Marathi / English
  if (/^पाक(?:श|ष)ाकार\s*(?:[०-९\d]+)?\s*ना(?:व|मे)?$/i.test(str)) return false;
  if (/^शरि\s*नामे/i.test(str)) return false;
  if (/^वारस(?:दार)?\s*(?:[०-९\d]+)?\s*नाव/i.test(str)) return false;
  if (/^party\s*[0-9]+\s*(?:name)?$/i.test(str)) return false;
  if (/^applicant\s*[0-9]+\s*(?:name)?$/i.test(str)) return false;
  if (/^accused\s*[0-9]+\s*(?:name)?$/i.test(str)) return false;
  if (/^opponent\s*[0-9]+\s*(?:name)?$/i.test(str)) return false;
  if (/^respondent\s*[0-9]+\s*(?:name)?$/i.test(str)) return false;

  return true;
}

/**
 * Determines whether Party / Applicant / Pakshakar / Accused at given index has valid provided data.
 */
export function isPartyProvided(facts: Record<string, any> = {}, index: number): boolean {
  const directKeys = [
    `party${index}Name`,
    `party${index}`,
    `applicant${index}Name`,
    `applicant${index}`,
    `accused${index}Name`,
    `accused${index}`,
    `opponent${index}Name`,
    `opponent${index}`,
    `respondent${index}Name`,
    `respondent${index}`,
    `pakshakar${index}Name`,
    `pakshakar${index}`,
    `वारस${index}`,
    `heir${index}`
  ];

  for (const k of directKeys) {
    if (isValidPartyValue(facts[k])) {
      return true;
    }
  }

  // Also check dynamic key matching with index
  for (const [k, v] of Object.entries(facts)) {
    if (new RegExp(`^(?:party|applicant|accused|opponent|respondent|pakshakar|वारस)${index}(?:name|नाव)?$`, 'i').test(k)) {
      if (isValidPartyValue(v)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Removes all document blocks, paragraphs, table rows, address lines, signature lines,
 * and placeholder attributes for any Party / Applicant / Pakshakar / Accused that is NOT
 * provided in the document or facts.
 */
export function cleanUnprovidedPartyBlocks(html: string, facts: Record<string, any> = {}): string {
  if (!html) return '';
  let result = html;

  // Indices 2 through 10 (Party 2, Party 3, Party 4, Party 5, etc.)
  for (let i = 2; i <= 10; i++) {
    const provided = isPartyProvided(facts, i);
    if (!provided) {
      const devI = toDevanagariDigits(i);
      const idxPatterns = `${i}|${devI}`;

      // 1. Remove table rows (<tr>...</tr>) referencing this unprovided party
      const trPattern = new RegExp(
        `<tr\\b[^>]*>(?:(?!<\\/tr>)[\\s\\S])*?(?:\\{(?:party|applicant|accused|opponent|respondent|pakshakar)${i}(?:[a-zA-Z0-9_-]*)?\\}|\\{relation${i}\\}|\\{(?:mulage|mulagi|वारस)${i}\\})(?:(?!<\\/tr>)[\\s\\S])*?<\\/tr>`,
        'gi'
      );
      result = result.replace(trPattern, '');

      // 2. Remove dedicated party paragraphs (<p>...</p>, <div>...</div>, <li...</li>)
      // referencing {partyX...}, {relationX}, {accusedX...} etc.
      // EXCLUDING paragraphs that also reference a provided party (e.g. joint verification)
      const pRe = /<(p|div|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
      result = result.replace(pRe, (fullTag, tagName, innerContent) => {
        // Check if this paragraph contains placeholders for this unprovided party
        const partyKeyRegex = new RegExp(
          `\\{(?:party|applicant|accused|opponent|respondent|pakshakar)${i}(?:[a-zA-Z0-9_-]*)?\\}|\\{relation${i}\\}|\\{accused${i}(?:[a-zA-Z0-9_-]*)?\\}|\\{opponent${i}(?:[a-zA-Z0-9_-]*)?\\}`,
          'i'
        );
        if (!partyKeyRegex.test(innerContent)) {
          return fullTag;
        }

        // Check if it also references ANY provided party (like party 1 or another provided party)
        for (let j = 1; j <= 10; j++) {
          if (j !== i && (j === 1 || isPartyProvided(facts, j))) {
            const otherPartyRegex = new RegExp(`\\{(?:party|applicant|accused|opponent|respondent|pakshakar)${j}(?:[a-zA-Z0-9_-]*)?\\}`, 'i');
            if (otherPartyRegex.test(innerContent)) {
              return fullTag;
            }
          }
        }

        // Dedicated to unprovided party -> remove it cleanly
        return '';
      });

      // 3. Post-replacement cleanup:
      // Remove dead numbered party shells (e.g. "<p>4) वर्ष </p>" or "<p>4) &nbsp; वर्षे &nbsp;</p>")
      const emptyNumberedShellRegex = new RegExp(
        `<(p|div|li)\\b[^>]*>(?:(?!<\\/\\1>)[\\s\\S])*?(?:(?:^|[>\\s])(?:${idxPatterns})\\s*[\\)\\.\\-])(?:(?!<\\/\\1>)[\\s\\S])*?<\\/\\1>`,
        'gi'
      );
      result = result.replace(emptyNumberedShellRegex, (fullTag) => {
        const textOnly = fullTag
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&#160;/gi, ' ')
          .replace(/&zwnj;/gi, '')
          .replace(/&zwj;/gi, '')
          .replace(new RegExp(`^(?:${idxPatterns})\\s*[\\)\\.\\-]\\s*`, 'i'), '')
          .replace(/\b(?:वर्षे|वर्ष|वय|नाते|धंदा|नाव|नामे|व्यवसाय|मुलगा|मुलगी|पत्नी|आई|applicant|party|accused)\b/gi, '')
          .replace(/[\s\-_.:;,\u2013\u2014]/g, '')
          .trim();

        if (textOnly.length <= 1) {
          return '';
        }
        return fullTag;
      });

      // 4. Remove residual dead address lines ("रा." or "रा" with no address)
      const emptyAddressRegex = /<(p|div|li)\b[^>]*>(?:(?!<\/\1>)[\s\S])*?(?:(?:^|[>\s])(?:रा\.?|मु\.?|पत्ता|address))[\s\S]*?<\/\1>/gi;
      result = result.replace(emptyAddressRegex, (fullTag) => {
        const textOnly = fullTag
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&#160;/gi, ' ')
          .replace(/&zwnj;/gi, '')
          .replace(/&zwj;/gi, '')
          .replace(/\b(?:रा|मु|पत्ता|address)\b/gi, '')
          .replace(/[\s\-_.:;,\u2013\u2014]/g, '')
          .trim();

        if (textOnly.length <= 1) {
          return '';
        }
        return fullTag;
      });

      // 5. Remove any unpopulated placeholder tags for this party
      const remainingPartyPlaceholders = new RegExp(
        `(?:\\{|&lbrace;|&#123;|&#x7b;)(?:<[^>]*>)*\\s*(?:party|applicant|accused|opponent|respondent|pakshakar)${i}[a-zA-Z0-9_-]*\\s*(?:<[^>]*>)*(?:\\}|&rbrace;|&#125;|&#x7d;)|\\{(?:relation${i}|mulage${i}|mulagi${i})\\}`,
        'gi'
      );
      result = result.replace(remainingPartyPlaceholders, '');
    }
  }

  // 6. Clean orphan signature lines with only dots / empty space (e.g. "<p align="right"><b> . . . . . . . . . . </b></p>")
  result = result.replace(/<(p|div)\b[^>]*align=["']?right["']?[^>]*>([\s\S]*?)<\/\1>/gi, (fullTag, tagName, inner) => {
    const rawText = inner
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#160;/gi, ' ')
      .replace(/&zwnj;/gi, '')
      .replace(/&zwj;/gi, '')
      .trim();

    // If it only contains dots, whitespace, or underscores
    if (/^[.\s_\u2026\u22ef\-]+$/.test(rawText)) {
      return '';
    }
    return fullTag;
  });

  return result;
}
