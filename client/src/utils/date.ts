/**
 * Date formatting helpers to enforce DD/MM/YYYY format across all date input fields and document generation.
 */

/**
 * Normalizes input date string into DD/MM/YYYY format.
 * - Converts ISO YYYY-MM-DD (e.g. 2026-09-03) -> 03/09/2026
 * - Converts single digit DD/MM or slashes -> 03/09/2026
 * - Preserves existing DD/MM/YYYY and Marathi Devanagari numerals
 */
export function formatToDDMMYYYY(dateStr: string): string {
  if (!dateStr || !dateStr.trim()) return '';

  const str = dateStr.trim();

  // Pattern 1: ISO YYYY-MM-DD or YYYY/MM/DD
  const yyyyMmDdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (yyyyMmDdMatch) {
    const [, yyyy, mm, dd] = yyyyMmDdMatch;
    const formattedDD = dd.padStart(2, '0');
    const formattedMM = mm.padStart(2, '0');
    return `${formattedDD}/${formattedMM}/${yyyy}`;
  }

  // Pattern 2: D/M/YYYY or DD/MM/YYYY
  const ddMmYyyyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddMmYyyyMatch) {
    const [, dd, mm, yyyy] = ddMmYyyyMatch;
    const formattedDD = dd.padStart(2, '0');
    const formattedMM = mm.padStart(2, '0');
    return `${formattedDD}/${formattedMM}/${yyyy}`;
  }

  return str;
}

/**
 * Converts DD/MM/YYYY date string to YYYY-MM-DD for HTML5 <input type="date"> element.
 */
export function formatToYYYYMMDD(dateStr: string): string {
  if (!dateStr || !dateStr.trim()) return '';

  const str = dateStr.trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // Convert DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD
  const ddMmYyyyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddMmYyyyMatch) {
    const [, dd, mm, yyyy] = ddMmYyyyMatch;
    const formattedDD = dd.padStart(2, '0');
    const formattedMM = mm.padStart(2, '0');
    return `${yyyy}-${formattedMM}-${formattedDD}`;
  }

  return '';
}

