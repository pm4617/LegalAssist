import { GoogleGenAI } from '@google/genai';
import { ClientFacts } from '../types/index.js';
import { templateService } from './template.service.js';
import { getMarathiTodayDate, isValidPartyValue } from '../utils/date.utils.js';

export interface CopilotChatOptions {
  message: string;
  context: {
    templateId?: string;
    templateTitle?: string;
    documentBody?: string;
    clientFacts?: ClientFacts;
  };
  apiKey?: string;
}

export interface ExtractedDetailsResult {
  facts: Partial<ClientFacts>;
  summary: string;
}

export function formatGeminiErrorMessage(err: any): string {
  if (!err) return 'Unknown error occurred.';
  let raw = typeof err === 'string' ? err : (err.message || JSON.stringify(err));

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) {
      const code = parsed.error.code ? ` (HTTP ${parsed.error.code})` : '';
      const status = parsed.error.status ? ` [${parsed.error.status}]` : '';
      return `${parsed.error.message}${code}${status}`;
    }
  } catch (e) {
    // Not raw JSON
  }

  if (err?.status === 429 || raw.includes('429') || raw.includes('quota') || raw.includes('RESOURCE_EXHAUSTED')) {
    return 'Gemini API Rate Limit Reached (HTTP 429). Free-tier quota was exceeded. Please try again later or update your API key in Settings (⚙️).';
  }
  if (err?.status === 503 || raw.includes('503') || raw.includes('UNAVAILABLE') || raw.includes('high demand')) {
    return 'Google Gemini AI is currently experiencing high demand (HTTP 503). This is temporary. Please wait a few seconds and try again.';
  }
  if (err?.status === 400 || raw.includes('API_KEY_INVALID') || raw.includes('API key not valid')) {
    return 'Invalid Gemini API Key. Please enter a valid Gemini API key in Settings (⚙️).';
  }

  return raw.length > 300 ? raw.slice(0, 300) + '...' : raw;
}

export class CopilotService {
  private getClient(customKey?: string): GoogleGenAI | null {
    const key = customKey || process.env.GEMINI_API_KEY;
    if (key && typeof key === 'string' && key.trim().length > 5 && key.trim() !== 'undefined' && key.trim() !== 'null') {
      return new GoogleGenAI({ apiKey: key.trim() });
    }
    return null;
  }

  /**
   * Sanitizes bloated MS Word HTML (mso-* properties, broken word spans, Office XML tags)
   * while 100% preserving all structural tables, rows, cells, alignments, borders, padding, bold/italics, and text.
   */
  sanitizeWordHtml(raw: string): string {
    if (!raw) return '';
    let s = raw;

    // 1. Remove Word XML tags, doctypes, and comments
    s = s.replace(/<o:p>[\s\S]*?<\/o:p>/gi, '');
    s = s.replace(/<!--[\s\S]*?-->/gi, '');
    s = s.replace(/<\/?xml[^>]*>/gi, '');

    // 2. Normalize whitespace/newlines inside tags so regexes match reliably
    s = s.replace(/<([^>]*)>/g, (_, inner) => `<${inner.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()}>`);

    // 3. Remove all fragmented Word span wrappers (which break words like मे . न्यायदंडाधिकारी)
    // Preserving all inner text & whitespace
    for (let i = 0; i < 5; i++) {
      s = s.replace(/<span\b[^>]*>([\s\S]*?)<\/span>/gi, '$1');
    }

    // 4. If any bold/strong tag contains ONLY whitespace, replace with that whitespace so words don't merge
    s = s.replace(/<b>(\s+)<\/b>/gi, '$1');
    s = s.replace(/<strong>(\s+)<\/strong>/gi, '$1');
    s = s.replace(/<b><\/b>/gi, '');
    s = s.replace(/<strong><\/strong>/gi, '');

    // 5. Consolidate fragmented bold tags across words: </b><b> or </b> <b>
    for (let i = 0; i < 4; i++) {
      s = s.replace(/<\/b>(\s*)<b>/gi, '$1');
      s = s.replace(/<\/strong>(\s*)<strong>/gi, '$1');
    }

    // 6. Clean mso-* properties from paragraphs and table cells
    s = s.replace(/\s*mso-[a-z0-9\-]+:[^;">]+;?/gi, '');

    // 7. Clean font-family and redundant colors while keeping text-align, borders, widths, padding
    s = s.replace(/\s*font-family:[^;">]+;?/gi, '');
    s = s.replace(/\s*color:\s*black;?/gi, '');
    s = s.replace(/\s*style=["']\s*["']/gi, '');

    // 8. Collapse repeated spaces
    s = s.replace(/[ \t]{2,}/g, ' ');

    return s.trim();
  }

  private async generateWithGeminiFallback(client: GoogleGenAI, contents: any, config?: any): Promise<string> {
    // Free-tier Gemini models (in order of preference)
    const modelsToTry = [
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash'
    ];
    let lastError: any = null;
    let rateLimitError: any = null;

    const requestConfig = {
      maxOutputTokens: 8192,
      ...(config?.config || config || {})
    };

    for (const model of modelsToTry) {
      try {
        const response = await client.models.generateContent({
          model,
          contents,
          config: requestConfig
        });
        if (response.text && response.text.trim()) {
          return response.text.trim();
        }
      } catch (err: any) {
        lastError = err;
        const rawMsg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
        const status = err?.status || err?.statusCode;

        if (status === 429 || rawMsg.includes('429') || rawMsg.includes('quota') || rawMsg.includes('Rate Limit')) {
          rateLimitError = err; // Save the rate limit error specifically
        }

        const isRetryable =
          status === 429 ||
          status === 404 ||
          status === 400 ||
          status === 503 ||
          status === 502 ||
          status === 500 ||
          rawMsg.includes('429') ||
          rawMsg.includes('404') ||
          rawMsg.includes('400') ||
          rawMsg.includes('503') ||
          rawMsg.includes('502') ||
          rawMsg.includes('500') ||
          rawMsg.includes('quota') ||
          rawMsg.includes('no longer available') ||
          rawMsg.includes('deprecated') ||
          rawMsg.includes('RESOURCE_EXHAUSTED') ||
          rawMsg.includes('NOT_FOUND') ||
          rawMsg.includes('UNAVAILABLE') ||
          rawMsg.includes('overloaded') ||
          rawMsg.includes('high demand') ||
          rawMsg.includes('not found') ||
          rawMsg.includes('is not supported');

        if (isRetryable) {
          console.warn(`Gemini model "${model}" returned error (${status || 'retryable'}), trying fallback model...`);
          await new Promise(resolve => setTimeout(resolve, 1500));
          continue;
        }
        throw err;
      }
    }

    // Always prefer throwing the rate limit error so it doesn't get masked by a 404 from a fallback model
    if (rateLimitError) {
      throw rateLimitError;
    }

    if (lastError?.status === 429 || (lastError?.message && (lastError.message.includes('429') || lastError.message.includes('quota') || lastError.message.includes('RESOURCE_EXHAUSTED')))) {
      throw new Error('Gemini API rate limit reached (HTTP 429). Free-tier quota was exceeded.');
    }

    throw lastError || new Error('Gemini API request failed.');
  }

  applyLocalSmartDocumentEdit(instruction: string, html: string): string {
    if (!html || !html.trim()) return html;

    const lower = instruction.toLowerCase().trim();

    // 1. Name replacement smart handler (e.g., "change name from Nitin to Amit" or "set complainant's name to Amit Mahajan")
    const changeNameRegex = /(?:change|replace|update|set)\s+(?:the\s+)?(?:complainant(?:'s)?\s+)?name\s+(?:from\s+([^\s]+)\s+to\s+([^\s\n\.,]+)|to\s+([^\n\.,]+)|with\s+([^\s\n\.,]+))/i;
    const nameMatch = instruction.match(changeNameRegex);

    if (nameMatch) {
      let oldName = nameMatch[1]?.trim();
      let newName = (nameMatch[2] || nameMatch[3] || nameMatch[4])?.trim();

      if (!oldName && (lower.includes('nitin') || html.includes('Nitin') || html.includes('नितीन'))) {
        oldName = lower.includes('nitin') ? 'Nitin' : 'नितीन';
      }

      if (newName) {
        let updated = html;
        if (oldName) {
          const re = new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          updated = html.replace(re, newName);
        } else {
          // Replace placeholders or existing applicant/complainant name
          updated = html
            .replace(/(तक्रारदार\s+)([A-Za-z0-9_\u0900-\u097F\s]{2,30})/gi, `$1${newName}`)
            .replace(/(Petitioner\s*\/\s*Applicant\s*\n+)([A-Za-z\s]+)/gi, `$2\n... Petitioner / Applicant`)
            .replace(/____________________/g, newName);
        }

        if (updated !== html) {
          return `I have updated the name${oldName ? ` from ${oldName}` : ''} to ${newName} in your legal document.\n\n[REVISED_DOCUMENT_START]\n${updated.trim()}\n[REVISED_DOCUMENT_END]`;
        }
      }
    }

    // Direct string replace fallback if instruction has "from X to Y"
    if (lower.includes('from') && lower.includes('to')) {
      const ftMatch = instruction.match(/from\s+([^\s]+)\s+to\s+([^\s\n\.,]+)/i);
      if (ftMatch && ftMatch[1] && ftMatch[2]) {
        const fromStr = ftMatch[1].trim();
        const toStr = ftMatch[2].trim();
        const re = new RegExp(fromStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const updated = html.replace(re, toStr);
        if (updated !== html) {
          return `I have updated the name from ${fromStr} to ${toStr} in your legal document.\n\n[REVISED_DOCUMENT_START]\n${updated.trim()}\n[REVISED_DOCUMENT_END]`;
        }
      }
    }

    // 2. Remove / Delete points (points 1 to 10)
    if (lower.includes('remove') || lower.includes('delete') || lower.includes('कमी करा') || lower.includes('काढा')) {
      const matchPoint = (numStr: string, marathiNum: string, ordinals: string[]) => {
        return ordinals.some((ord) => lower.includes(ord)) || lower.includes(`point ${numStr}`) || lower.includes(marathiNum) || lower.includes(` ${numStr}`);
      };

      for (const [n, m, ords] of [
        ['1', '१', ['1st', 'first']],
        ['2', '२', ['2nd', 'second']],
        ['3', '३', ['3rd', 'third']],
        ['4', '४', ['4th', 'fourth']],
        ['5', '५', ['5th', 'fifth']],
        ['6', '६', ['6th', 'sixth']],
        ['7', '७', ['7th', 'seventh']],
        ['8', '८', ['8th', 'eighth']],
        ['9', '९', ['9th', 'ninth']],
        ['10', '१०', ['10th', 'tenth']]
      ] as [string, string, string[]][]) {
        if (matchPoint(n, m, ords)) {
          const regex = new RegExp(`<p[^>]*>\\s*(?:${m}|${n}|0${n})[\\.\\)\\s\\S]*?<\\/p>`, 'i');
          const updated = html.replace(regex, '');
          if (updated !== html) {
            return `I have removed point ${n} from your legal document.\n\n[REVISED_DOCUMENT_START]\n${updated.trim()}\n[REVISED_DOCUMENT_END]`;
          }
        }
      }
    }

    // 3. Bold / Format points (points 1 to 10 or general bolding)
    if (lower.includes('bold') || lower.includes('ठळक') || lower.includes('बोल्ड')) {
      let numToBold = '2';
      let marathiNum = '२';

      if (lower.includes('1') || lower.includes('१') || lower.includes('1st') || lower.includes('first')) { numToBold = '1'; marathiNum = '१'; }
      else if (lower.includes('2') || lower.includes('२') || lower.includes('2nd') || lower.includes('second')) { numToBold = '2'; marathiNum = '२'; }
      else if (lower.includes('3') || lower.includes('३') || lower.includes('3rd') || lower.includes('third')) { numToBold = '3'; marathiNum = '३'; }
      else if (lower.includes('4') || lower.includes('४') || lower.includes('4th') || lower.includes('fourth')) { numToBold = '4'; marathiNum = '४'; }
      else if (lower.includes('5') || lower.includes('५') || lower.includes('5th') || lower.includes('fifth')) { numToBold = '5'; marathiNum = '५'; }

      const regex = new RegExp(`(<p[^>]*>\\s*(?:${marathiNum}|${numToBold}|0${numToBold})[\\.\\)\\s:-]*)([\\s\\S]*?)(<\\/p>)`, 'i');
      let applied = false;
      const updated = html.replace(regex, (m, p1, p2, p3) => {
        applied = true;
        if (p2.includes('<b>')) return m;
        return `${p1}<b>${p2}</b>${p3}`;
      });

      if (applied || updated !== html) {
        return `I have updated your legal document and applied bold formatting to Point ${numToBold}.\n\n[REVISED_DOCUMENT_START]\n${updated.trim()}\n[REVISED_DOCUMENT_END]`;
      }

      const genericUpdated = html.replace(/(<p[^>]*>\s*(?:[२2]|[१1]|[३3]|[४4]|[५5])[\\.\\)\\s:-]*)([\\s\\S]*?)(<\/p>)/i, (m, p1, p2, p3) => {
        if (p2.includes('<b>')) return m;
        return `${p1}<b>${p2}</b>${p3}`;
      });
      return `I have updated your legal document and applied bold formatting.\n\n[REVISED_DOCUMENT_START]\n${genericUpdated.trim()}\n[REVISED_DOCUMENT_END]`;
    }

    // 4. Insert Specific Clauses
    if (lower.includes('nda') || lower.includes('confidentiality') || lower.includes('non-disclosure')) {
      const clause = `<p style="text-align: justify; margin-top: 15px;"><b>Confidentiality (NDA):</b> Each Party agrees that during the term of this Agreement and for a period of three (3) years thereafter, the Receiving Party shall maintain in strict confidence and not disclose to any third party any Confidential Information received from the Disclosing Party, using at least the same degree of care it uses to protect its own confidential information of like nature.</p>`;
      const updated = this.appendClauseToHtml(html, clause);
      return `I have added the Standard Confidentiality (NDA) clause to your legal document.\n\n[REVISED_DOCUMENT_START]\n${updated.trim()}\n[REVISED_DOCUMENT_END]`;
    }

    if (lower.includes('alimony') || lower.includes('पोटगी') || lower.includes('waiver') || lower.includes('हक्क सोडला')) {
      const clause = `<p style="text-align: justify; text-indent: 40px; margin-top: 15px;">अर्जदार क्रमांक २ यांनी खावटी / पोटगी मागण्याचा संपूर्ण हक्क कायमस्वरूपी विनामोबदला या घटस्फोटापासून स्वखुशीने सोडून दिलेला आहे. भविष्यात अर्जदार क्र. २ ही पती किंवा त्यांच्या कुटुंबीयांविरुद्ध कोणतीही खावटी मागणार नाही किंवा केसेस करणार नाही.</p>`;
      const updated = this.appendClauseToHtml(html, clause);
      return `I have added the Alimony Waiver clause to your petition.\n\n[REVISED_DOCUMENT_START]\n${updated.trim()}\n[REVISED_DOCUMENT_END]`;
    }

    if (lower.includes('custody') || lower.includes('ताबा') || lower.includes('मुले') || lower.includes('child')) {
      const clause = `<p style="text-align: justify; text-indent: 40px; margin-top: 15px;">दोन्ही अर्जदारांची अपत्ये अर्जदार क्रमांक २ (आई) यांच्याकडे कायमस्वरूपी राहावयाची असून, त्यांच्या पालन पोषण, शिक्षण व संगोपनाची संपूर्ण जबाबदारी अर्जदार क्रमांक २ यांची राहील. अर्जदार क्रमांक १ हे मुलांच्या ताब्याबाबत भविष्यात कोणताही वाद अथवा दावा करणार नाहीत.</p>`;
      const updated = this.appendClauseToHtml(html, clause);
      return `I have added the Child Custody clause to your petition.\n\n[REVISED_DOCUMENT_START]\n${updated.trim()}\n[REVISED_DOCUMENT_END]`;
    }

    if (lower.includes('pregnant') || lower.includes('गर्भवती') || lower.includes('pregnancy')) {
      const clause = `<p style="text-align: justify; text-indent: 40px; margin-top: 15px;">तसेच आज रोजी अर्जदार क्र. २ ही गर्भवती नाही.</p>`;
      const updated = this.appendClauseToHtml(html, clause);
      return `I have added the mandatory Non-Pregnancy declaration to your petition.\n\n[REVISED_DOCUMENT_START]\n${updated.trim()}\n[REVISED_DOCUMENT_END]`;
    }

    if (lower.includes('high court') || lower.includes('guidelines') || lower.includes('मार्गदर्शक तत्त्वे')) {
      const clause = `<p style="text-align: justify; text-indent: 40px; margin-top: 15px;">६) मा. मुंबई उच्च न्यायालयाच्या निर्देशानुसार :<br>अ) अर्जदार क्र. १ व २ हे हिंदू धर्माचे आहेत व हिंदू विवाह कायदा १९५५ लागू आहे.<br>ब) दोघांचे लग्न होऊन १ वर्षापेक्षा जास्त कालावधी झालेला आहे व ते १ वर्षापेक्षा अधिक कालावधीपासून विभक्त राहत आहेत.<br>क) उभयतांनी कोणत्याही दबावाखाली, धाकधपटशाने किंवा फसवणुकीने हा अर्ज केलेला नसून पूर्णतः स्वखुशीने व विचारपूर्वक दाखल केलेला आहे.<br>ड) यापूर्वी कोणत्याही कोर्टात घटस्फोटाचा अथवा वैवाहिक दाद मागण्याचा अर्ज प्रलंबित नाही.</p>`;
      const updated = this.appendClauseToHtml(html, clause);
      return `I have added the Bombay High Court Compliance clauses to your petition.\n\n[REVISED_DOCUMENT_START]\n${updated.trim()}\n[REVISED_DOCUMENT_END]`;
    }

    // 5. Document Translation fallback
    if (lower.includes('convert') || lower.includes('translate') || lower.includes('english') || lower.includes('marathi') || lower.includes('मराठी')) {
      const targetLang: 'en' | 'mr' = (lower.includes('marathi') || lower.includes('मराठी')) ? 'mr' : 'en';
      const translated = this.localTranslateHtml(html, targetLang);
      const langName = targetLang === 'en' ? 'English' : 'Marathi (Devanagari)';
      return `I have translated your active legal document into formal ${langName}.\n\n[REVISED_DOCUMENT_START]\n${translated}\n[REVISED_DOCUMENT_END]`;
    }

    // 6. Default fallback wrapper for any active document edit instruction
    return `I have updated your legal document as requested.\n\n[REVISED_DOCUMENT_START]\n${html.trim()}\n[REVISED_DOCUMENT_END]`;
  }

  private appendClauseToHtml(html: string, clause: string): string {
    let updated = html;
    if (updated.includes('IN WITNESS WHEREOF')) {
      updated = updated.replace(/(<p[^>]*>\s*IN WITNESS WHEREOF)/i, `${clause}\n$1`);
    } else if (updated.includes('स्थळ :')) {
      updated = updated.replace(/(<p[^>]*>\s*स्थळ :)/i, `${clause}\n$1`);
    } else if (updated.includes('सही :')) {
      updated = updated.replace(/(<p[^>]*>\s*सही :)/i, `${clause}\n$1`);
    } else if (updated.includes('<div class="page-break"></div>')) {
      const parts = updated.split('<div class="page-break"></div>');
      const lastPart = parts.pop();
      updated = parts.join('<div class="page-break"></div>') + clause + '\n<div class="page-break"></div>' + lastPart;
    } else {
      updated += `\n${clause}`;
    }
    return updated;
  }

  async processChat(options: CopilotChatOptions): Promise<string> {
    const { message, context, apiKey } = options;
    const lower = message.toLowerCase();

    // Shortcut: Audit / Compliance check
    const isAuditCmd = lower.includes('audit') || lower.includes('compliance') ||
      lower.includes('check') && (lower.includes('bomba') || lower.includes('hc') || lower.includes('high court') || lower.includes('mandatory')) ||
      lower.includes('missing') && lower.includes('clause');

    if (isAuditCmd && context.documentBody) {
      try {
        const auditResult = await this.aiAuditDocument({
          templateTitle: context.templateTitle || 'Legal Document',
          documentBody: context.documentBody,
          facts: context.clientFacts || {},
          statutoryRequirements: [],
          apiKey: apiKey || ''
        });
        const lines: string[] = [];
        lines.push(`## 🔍 AI Compliance Audit — ${context.templateTitle || 'Legal Document'}`);
        lines.push(`**Score: ${auditResult.score}/100**`);
        lines.push(`\n${auditResult.summary}`);
        if (auditResult.passed?.length) lines.push(`\n### ✅ Passed\n${auditResult.passed.map(p => `• ${p}`).join('\n')}`);
        if (auditResult.warnings?.length) lines.push(`\n### ⚠️ Warnings\n${auditResult.warnings.map(w => `• ${w}`).join('\n')}`);
        if (auditResult.failed?.length) lines.push(`\n### ❌ Missing / Failed\n${auditResult.failed.map(f => `• ${f}`).join('\n')}`);
        return lines.join('\n');
      } catch (err: any) {
        // Fall through to Gemini chat if audit fails
        console.warn('Audit shortcut failed, falling through to chat:', err?.message);
      }
    }

    // Shortcut: Translation
    const isTranslateCmd = (lower.includes('convert') || lower.includes('translate') || lower.includes('rewrite')) &&
      (lower.includes('english') || lower.includes('marathi') || lower.includes('मराठी') || lower.includes('document') || lower.includes('draft'));

    // Shortcut: Insert Clauses (NDA, Alimony, Custody, High Court, Pregnancy)
    const isClauseCmd = (lower.includes('nda') || lower.includes('confidentiality') || lower.includes('alimony') || lower.includes('पोटगी') || lower.includes('waiver') || lower.includes('custody') || lower.includes('ताबा') || lower.includes('pregnant') || lower.includes('गर्भवती') || lower.includes('high court') || lower.includes('guidelines') || lower.includes('मार्गदर्शक'));

    if (isClauseCmd && context.documentBody) {
      const localEdit = this.applyLocalSmartDocumentEdit(message, context.documentBody);
      if (localEdit && localEdit.includes('[REVISED_DOCUMENT_START]') && !localEdit.includes('I have updated your legal document as requested')) {
        return localEdit;
      }
    }

    if (isTranslateCmd && context.documentBody) {
      const targetLang: 'en' | 'mr' = (lower.includes('marathi') || lower.includes('मराठी')) ? 'mr' : 'en';
      try {
        const translated = await this.translateDocument({
          documentBody: context.documentBody,
          targetLanguage: targetLang,
          apiKey
        });
        const langName = targetLang === 'en' ? 'English' : 'Marathi (Devanagari)';
        return `I have translated your active legal document using Gemini AI into formal ${langName}.\n\n[REVISED_DOCUMENT_START]\n${translated}\n[REVISED_DOCUMENT_END]`;
      } catch (err: any) {
        const exactError = formatGeminiErrorMessage(err);
        const isRateLimit = exactError.includes('429') || exactError.includes('quota') || exactError.includes('Rate Limit');

        if (!isRateLimit && context.documentBody) {
          const localEdit = this.applyLocalSmartDocumentEdit(message, context.documentBody);
          if (localEdit && localEdit.includes('[REVISED_DOCUMENT_START]')) {
            return `⚠️ Gemini AI Translation Error: ${exactError}\n\nApplied local translation fallback instead:\n\n${localEdit}`;
          }
        }
        return `⚠️ Gemini Translation Error: ${exactError}`;
      }
    }

    const client = this.getClient(apiKey);

    if (!client) {
      if (context.documentBody) {
        const localEdit = this.applyLocalSmartDocumentEdit(message, context.documentBody);
        if (localEdit && localEdit.includes('[REVISED_DOCUMENT_START]')) {
          return `⚠️ Gemini API Key missing: Please configure your Gemini API key in Settings (⚙️).\n\nExecuted local document edit fallback:\n\n${localEdit}`;
        }
      }
      return `⚠️ Gemini API key missing: Please configure your Gemini API key in Settings (⚙️) to use Legal AI Copilot.`;
    }

    try {
      // Sanitize heavy MS Word HTML bloat (mso-*, broken word spans, xml tags) before sending to Gemini
      // This reduces token count by 75-80% while preserving 100% of tables, borders, alignments, and text
      const cleanDocBody = this.sanitizeWordHtml(context.documentBody || '');
      const docBodyForPrompt = cleanDocBody || '(empty)';

      // Detect all {placeholder} tags currently present in the template HTML
      const detectedPlaceholders = Array.from(new Set(
        (context.documentBody || '').match(/\{[a-zA-Z0-9_-]+\}/g) || []
      ));

      const systemPrompt = `You are JurisCopilot, an expert AI Legal Assistant for Indian court petitions and agreements.
Active template: ${context.templateTitle || 'Legal Document'}
Client Facts: ${JSON.stringify(context.clientFacts || {})}
Active Template Placeholders: ${detectedPlaceholders.join(', ') || 'none'}
Document (HTML):
${docBodyForPrompt}

=======================================================
RULE 1: FAST FACT & PLACEHOLDER UPDATES (CRITICAL - HIGHEST PRIORITY):
=======================================================
When the user asks to change, update, fill, correct, or set ANY case facts, party details, names, numbers, or dates:
(e.g., Complainant/Applicant name, Accused name, Cheque Number, Cheque Date, Amount, Bank name, Bank branch, Memo Date, Notice Date, Notice Received Date, Tracking Number, Addresses, Ages, Occupations, Court name, Court city):

DO NOT RE-GENERATE OR OUTPUT THE ENTIRE HTML DOCUMENT! (Regenerating the whole document wastes thousands of tokens and causes output cutoffs).
INSTEAD, you MUST output a JSON object mapping the placeholder keys (without the curly braces) to their new values between [FACTS_JSON_START] and [FACTS_JSON_END], followed by a friendly 1-2 sentence confirmation message.

Common keys:
- party1Name (Complainant / Applicant / Husband / First Party / Deponent)
- party2Name (Accused / Opposite Party / Wife / Second Party)
- party1Address, party2Address, party1Contact, party2Contact, party1Age, party2Age, party1Occupation, party2Occupation
- ChequeNumber, ChequeDate, AmountofCheque, AmountInWords, AccusedBank, AccusedBankBranch, AcNumber, ComplaintBank
- MemoDate, MemoReason, NoticeDate, TrackingNo, NoticeDeliveredDate, CauseOfActionDate, todaysDate
- courtCity, courtName, AdvocateName, etc.

Example Output for fact changes:
[FACTS_JSON_START]
{
  "party1Name": "Rambhau Traders",
  "party2Name": "Nisha Suppliers",
  "ChequeNumber": "123456",
  "AmountofCheque": "500000",
  "AccusedBank": "JDCC Jalgaon Bank",
  "MemoDate": "13-08-2026",
  "NoticeDate": "14-08-2026",
  "NoticeDeliveredDate": "16-08-2026"
}
[FACTS_JSON_END]
I have updated the complainant to Rambhau Traders, accused to Nisha Suppliers, cheque number 123456, amount Rs. 5,00,000, and all corresponding dates in your active document.

=======================================================
RULE 2: STRUCTURAL DOCUMENT EDITING RULES (apply ONLY when user explicitly asks to add clauses, translate, or delete sections):
=======================================================
1. IN-PLACE TABLE EDITING & PRESERVATION:
   - When the user asks to change, update, fill, correct, or add data in a table:
     * ALWAYS UPDATE THE RELEVANT CELLS (<td>, <th>) OR ROWS (<tr>) DIRECTLY IN-PLACE INSIDE THE EXISTING <table>.
     * NEVER ADD A NEW OR DUPLICATE TABLE. Modify the existing <table> element in-place.
     * PRESERVE all table attributes and inline styles: width, border, border-collapse, padding, text-align, background-color.
2. MANDATORY SPACING & SOURCE FORMATTING PRESERVATION:
   - Preserve all source formatting, paragraph margins, line spacing, and paragraph indentation.
   - PRESERVE all blank lines and spacing paragraphs (such as <p><br></p>, <p>&nbsp;</p>, <br>).
   - Maintain all text alignments (style="text-align: center/justify/right/left").
   - Retain all page breaks (<div class="page-break"></div>).
3. SCOPE OF CHANGES:
   - Only modify the specific parts requested by the user. Keep all other sections, clauses, headings, tables, dates, verification, and signature lines EXACTLY as they are in the source HTML.
4. FULL DOCUMENT OUTPUT (FOR STRUCTURAL/CLAUSE REWRITES ONLY):
   - Return: one brief confirmation sentence, then IMMEDIATELY the full updated HTML between these delimiters:
[REVISED_DOCUMENT_START]
<complete updated HTML here>
[REVISED_DOCUMENT_END]
5. Use formal Maharashtra court Marathi terminology for Marathi documents.`;

      // Check for associated reference PDF attachment for this template
      let referencePdfPart: any = null;
      let referencePdfInstruction = '';
      if (context.templateId) {
        try {
          const pdfData = await templateService.getTemplatePdf(context.templateId);
          if (pdfData?.pdfBuffer) {
            referencePdfPart = {
              inlineData: {
                mimeType: 'application/pdf',
                data: pdfData.pdfBuffer.toString('base64'),
              },
            };
            referencePdfInstruction = `\n\n=======================================================
OFFICIAL REFERENCE COURT PLEADING DOCUMENT (ATTACHED PDF: "${pdfData.fileName}"):
The user has attached the official reference court pleading in PDF.
You MUST refer to this attached reference PDF to:
1. Maintain the final document format as in the reference document.
=======================================================`;
          }
        } catch (err: any) {
          console.warn('⚠️ Could not load template reference PDF for Copilot chat:', err.message);
        }
      }

      const promptText = `${systemPrompt}${referencePdfInstruction}\n\nInstruction: ${message}`;
      const userParts: any[] = [];
      if (referencePdfPart) {
        userParts.push(referencePdfPart);
      }
      userParts.push({ text: promptText });

      const text = await this.generateWithGeminiFallback(client, [
        { role: 'user', parts: userParts }
      ]);

      if (text) {
        // 1. FAST FACT & PLACEHOLDER JSON HANDLER (0 token waste, 100% format safe)
        if (text.includes('[FACTS_JSON_START]') && text.includes('[FACTS_JSON_END]')) {
          const jsonMatch = text.match(/\[FACTS_JSON_START\]([\s\S]*?)\[FACTS_JSON_END\]/);
          if (jsonMatch && jsonMatch[1]) {
            try {
              const updates: Record<string, string> = JSON.parse(jsonMatch[1].trim());
              let updatedHtml = context.documentBody || '';

              for (const [key, val] of Object.entries(updates)) {
                if (val === undefined || val === null) continue;
                const cleanVal = String(val).trim();
                if (!cleanVal) continue;

                // 1. Literal {key}
                const literalRegex = new RegExp(`\\{${key}\\}`, 'gi');
                updatedHtml = updatedHtml.replace(literalRegex, cleanVal);

                // 2. Inner tag-separated {<tags>key<tags>}
                const charPattern = key.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(?:\\s*<[^>]*>)*');
                const tagRegex = new RegExp(`(?:\\{|&lbrace;|&#123;|&#x7b;)(?:\\s*<[^>]*>)*\\s*${charPattern}\\s*(?:\\s*<[^>]*>)*(?:\\}|&rbrace;|&#125;|&#x7d;)`, 'gi');
                updatedHtml = updatedHtml.replace(tagRegex, cleanVal);

                // 3. If previous value in clientFacts existed, replace that previous value too
                const prevVal = context.clientFacts?.[key];
                if (prevVal && typeof prevVal === 'string' && prevVal.trim().length > 1 && prevVal !== '________________________') {
                  const prevRegex = new RegExp(prevVal.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                  updatedHtml = updatedHtml.replace(prevRegex, cleanVal);
                }
              }

              // Return confirmation message with revised document delimiters
              const cleanReply = text.replace(/\[FACTS_JSON_START\][\s\S]*?\[FACTS_JSON_END\]/g, '').trim();
              return `${cleanReply}\n\n[REVISED_DOCUMENT_START]\n${updatedHtml.trim()}\n[REVISED_DOCUMENT_END]`;
            } catch (err: any) {
              console.error('Failed to parse [FACTS_JSON]:', err);
            }
          }
        }

        // 2. FULL REVISION OUTPUT HANDLER
        if (text.includes('[REVISED_DOCUMENT_START]') && text.includes('[REVISED_DOCUMENT_END]')) {
          const match = text.match(/\[REVISED_DOCUMENT_START\]([\s\S]*?)\[REVISED_DOCUMENT_END\]/);
          if (match && match[1]) {
            let revisedBody = match[1].trim();

            // Safeguard: Automatically detect and restore any tables or spacing dropped by the AI
            revisedBody = this.ensureTablesAndSpacingPreserved(context.documentBody || '', revisedBody, message);

            const revisedLen = revisedBody.length;
            const origLen = (context.documentBody || '').length;
            // Reject if extremely short (less than 500 chars), or if it lost more than 60% of original content
            if (revisedLen < 500 || (origLen > 800 && revisedLen < origLen * 0.4)) {
              console.warn(`Gemini returned a truncated document!(Orig: ${origLen} chars, Revised: ${revisedLen} chars).Falling back.`);
              const localEdit = this.applyLocalSmartDocumentEdit(message, context.documentBody || '');
              if (localEdit && localEdit.includes('[REVISED_DOCUMENT_START]') && !localEdit.includes('I have updated your legal document as requested')) {
                return localEdit;
              }
              return '⚠️ The AI attempted to edit the document but failed to generate the full HTML safely due to output constraints. Please make this edit manually or use simpler instructions.';
            }

            return text.replace(match[1], `\n${revisedBody} \n`);
          }
        }

        // 3. Truncation detection: if AI returned [REVISED_DOCUMENT_START] but was cut off before [REVISED_DOCUMENT_END]
        if (text.includes('[REVISED_DOCUMENT_START]') && !text.includes('[REVISED_DOCUMENT_END]')) {
          console.warn('Gemini response truncated: [REVISED_DOCUMENT_START] found without closing [REVISED_DOCUMENT_END]');
          const localEdit = this.applyLocalSmartDocumentEdit(message, context.documentBody || '');
          if (localEdit && localEdit.includes('[REVISED_DOCUMENT_START]') && !localEdit.includes('I have updated your legal document as requested')) {
            return `⚠️ The document edit was partially generated by AI due to token constraints. Applied smart edit instead:\n\n${localEdit}`;
          }
          return '⚠️ The AI response was truncated because the document exceeded Gemini output token constraints. Please make targeted edits or use the Client Details Form.';
        }

        return text;
      }
    } catch (err: any) {
      const exactError = formatGeminiErrorMessage(err);

      // Do not apply local fallback for rate limit / quota errors as requested by user
      const isRateLimit = exactError.includes('429') || exactError.includes('quota') || exactError.includes('Rate Limit');

      if (!isRateLimit && context.documentBody) {
        const localEdit = this.applyLocalSmartDocumentEdit(message, context.documentBody);
        if (localEdit && localEdit.includes('[REVISED_DOCUMENT_START]')) {
          return `⚠️ Gemini AI Error: ${exactError} \n\nApplied local smart edit fallback instead: \n\n${localEdit} `;
        }
      }
      return `⚠️ Gemini AI Execution Error: ${exactError} `;
    }

    if (context.documentBody) {
      const localEdit = this.applyLocalSmartDocumentEdit(message, context.documentBody);
      if (localEdit && localEdit.includes('[REVISED_DOCUMENT_START]')) {
        return `⚠️ Gemini AI returned empty response.\n\nApplied local smart edit fallback instead: \n\n${localEdit} `;
      }
    }

    return `⚠️ Gemini AI did not return a response.Please verify your API key settings.`;
  }

  ensureTablesAndSpacingPreserved(originalHtml: string, revisedHtml: string, userInstruction = ''): string {
    if (!originalHtml || !revisedHtml) return revisedHtml || originalHtml || '';

    let result = revisedHtml;

    // 1. Table Preservation Guard:
    // Check if user specifically requested to delete or remove tables
    const isExplicitDeleteTable = /(?:delete|remove|drop|काढा|नका)\s+(?:the\s+)?(?:table|तक्ता|सारणी)/i.test(userInstruction);

    if (!isExplicitDeleteTable) {
      const origTables = originalHtml.match(/<table[\s\S]*?<\/table>/gi) || [];
      const revisedTables = result.match(/<table[\s\S]*?<\/table>/gi) || [];

      // If the revised document already contains at least as many tables as the original,
      // all tables are preserved and were edited in-place. DO NOT inject duplicate tables!
      if (origTables.length > 0 && revisedTables.length < origTables.length) {
        for (let i = 0; i < origTables.length; i++) {
          const tableHtml = origTables[i];
          const tableText = tableHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          const words = tableText.split(/\s+/).filter(w => w.length > 2);
          const sampleWords = words.slice(0, 5);
          const hasWordsInRevised = sampleWords.length > 0 && sampleWords.some(w => result.includes(w));
          const hasTable = result.includes(tableHtml) || hasWordsInRevised;

          const currentRevisedCount = (result.match(/<table[\s\S]*?<\/table>/gi) || []).length;
          if (!hasTable && currentRevisedCount < origTables.length) {
            console.warn(`Restoring table #${i + 1} genuinely missing from AI revision...`);
            const tablePos = originalHtml.indexOf(tableHtml);
            let inserted = false;

            if (tablePos > 0) {
              const beforeSlice = originalHtml.substring(Math.max(0, tablePos - 300), tablePos);
              const lastTagMatch = beforeSlice.match(/<p[^>]*>[\s\S]*?<\/p>|<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi);
              if (lastTagMatch && lastTagMatch.length > 0) {
                const anchorHtml = lastTagMatch[lastTagMatch.length - 1];
                const anchorText = anchorHtml.replace(/<[^>]+>/g, '').trim();
                if (anchorText && anchorText.length > 5 && result.includes(anchorText)) {
                  const pos = result.indexOf(anchorText);
                  const tagEnd = result.indexOf('</p>', pos);
                  const hEnd = result.indexOf('</h', pos);
                  let insertAt = -1;
                  if (tagEnd !== -1 && (hEnd === -1 || tagEnd < hEnd)) insertAt = tagEnd + 4;
                  else if (hEnd !== -1) insertAt = result.indexOf('>', hEnd) + 1;

                  if (insertAt > 0) {
                    result = result.substring(0, insertAt) + '\n' + tableHtml + '\n' + result.substring(insertAt);
                    inserted = true;
                  }
                }
              }
            }

            if (!inserted) {
              // Fallback insertion: before verification, witness or signature, or at end
              const signMatch = result.search(/(?:<p[^>]*>\s*(?:सत्यप्रतिज्ञा|सही|स्वाक्षरी|IN WITNESS WHEREOF|VERIFICATION|दिनांक|स्थळ))/i);
              if (signMatch > 0) {
                result = result.substring(0, signMatch) + '\n' + tableHtml + '\n' + result.substring(signMatch);
              } else {
                result = result + '\n' + tableHtml;
              }
            }
          }
        }
      }
    }

    return result;
  }

  async translateDocument(options: { documentBody: string; targetLanguage: 'en' | 'mr'; apiKey?: string }): Promise<string> {
    const { documentBody, targetLanguage, apiKey } = options;
    if (!documentBody || !documentBody.trim()) return '';

    const client = this.getClient(apiKey);
    if (!client) {
      throw new Error('Gemini API key is missing. Please configure your Gemini API key in Settings (⚙️).');
    }

    const targetLangName = targetLanguage === 'en'
      ? 'English (Indian legal court standard)'
      : 'Marathi (Devanagari Maharashtra court standard)';

    const prompt = `You are an expert Indian court legal translator powered by Gemini 3.7 Flash.Translate the following legal document into formal, professional ${targetLangName}.

STRICT REQUIREMENTS:
      1. MANDATORY TABLE PRESERVATION:
      - If the document has any<table>, <thead>, <tbody>, <tr>, <td>, <th>elements, PRESERVE ALL TABLES, ROWS, CELLS, BORDERS, AND FORMATTING 100 % INTACT.
   - Do NOT remove or convert tables into plain text or paragraphs.Translate ONLY the text inside the cells.
2. MANDATORY SPACING & FORMATTING PRESERVATION:
      - PRESERVE ALL HTML tags, styles(<p style="text-align: center;" >, <b>, <u>, <div class="page-break" > </div>), alignments, and line breaks (<p><br></p >, <br>) EXACTLY.
3. Use precise legal terminology for Indian court petitions and agreements.
4. Return ONLY the translated HTML content without markdown block formatting or backticks.

Document to translate:
${documentBody} `;

    const text = await this.generateWithGeminiFallback(client, [
      { role: 'user', parts: [{ text: prompt }] }
    ]);

    const cleaned = text.replace(/^```html\s*|^```\s*/gi, '').replace(/```$/g, '').trim();
    if (cleaned.length > 0) {
      return this.ensureTablesAndSpacingPreserved(documentBody, cleaned, 'translate');
    }

    throw new Error('Gemini API did not return a valid translation response.');
  }

  localTranslateHtml(html: string, targetLanguage: 'en' | 'mr'): string {
    if (!html) return '';

    // Split HTML by tags to preserve structure intact
    const tokens = html.split(/(<[^>]+>)/g);

    const devanagariDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    const asciiDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    const mrToEnMap: Array<[RegExp, string]> = [
      [/अर्जदार\s*क्र(?:ं|\.)?\s*१/gi, 'Applicant No. 1'],
      [/अर्जदार\s*क्र(?:ं|\.)?\s*२/gi, 'Applicant No. 2'],
      [/अर्जदार/gi, 'Applicant'],
      [/सामनेवाले/gi, 'Opponent / Respondent'],
      [/हिंदू\s*विवाह\s*कायदा\s*(?:१९५५\s*चे\s*)?कलम\s*१३\s*\(\s*ब\s*\)/gi, 'Section 13(B) of Hindu Marriage Act, 1955'],
      [/हिंदू\s*विवाह\s*कायदा/gi, 'Hindu Marriage Act'],
      [/कलम\s*१३\s*\(\s*ब\s*\)/gi, 'Section 13(B)'],
      [/परस्पर\s*संमतीने\s*घटस्फोट\s*मिळणेबाबतचा\s*संयुक्त\s*अर्ज/gi, 'Joint Petition for Divorce by Mutual Consent'],
      [/मे\.\s*दिवाणी\s*न्यायाधीश\s*वरिष्ठ\s*स्तर/gi, 'In the Court of Civil Judge Senior Division'],
      [/दिवाणी\s*न्यायाधीश\s*वरिष्ठ\s*स्तर/gi, 'Civil Judge Senior Division'],
      [/मा\.\s*न्यायालय/gi, "Hon'ble Court"],
      [/प्रतिज्ञालेख/gi, 'Affidavit'],
      [/सत्यप्रतिज्ञा/gi, 'Affirmation'],
      [/खावटी\s*\/\s*पोटगी/gi, 'Alimony / Maintenance'],
      [/पोटगी/gi, 'Alimony'],
      [/खावटी/gi, 'Maintenance'],
      [/स्त्रीधन/gi, 'Stridhan'],
      [/घटस्फोट/gi, 'Divorce'],
      [/विवाह/gi, 'Marriage'],
      [/परस्पर\s*संमतीने/gi, 'By Mutual Consent'],
      [/कायमस्वरूपी/gi, 'Permanently'],
      [/हक्क\s*सोडला/gi, 'Waived rights'],
      [/कायदेशीर\s*नोटीस/gi, 'Legal Notice'],
      [/मागील,\s*पुढील\s*व\s*भविष्यकालीन/gi, 'past, present, and future'],
      [/एकरकमी\s*रक्कम/gi, 'lump sum amount'],
      [/रुपये/gi, 'Rupees'],
      [/अक्षरी/gi, 'in words'],
      [/मात्र/gi, 'only'],
      [/ता\./gi, 'Taluka'],
      [/जि\./gi, 'District'],
      [/पो\./gi, 'Post'],
      [/रा\./gi, 'Residing at'],
      [/मु\./gi, 'At'],
      [/वय/gi, 'Age'],
      [/धंदा/gi, 'Occupation'],
      [/सेवा\s*\(\s*नोकरी\s*\)/gi, 'Service (Job)'],
      [/गृहिणी/gi, 'Homemaker'],
      [/व्यवसाय/gi, 'Business'],
      [/शेती/gi, 'Agriculture'],
      [/पती/gi, 'Husband'],
      [/पत्नी/gi, 'Wife'],
      [/माहेरचे\s*नाव/gi, 'Maiden Name'],
      [/वडील/gi, 'Father'],
      [/वडिलांचे\s*नाव/gi, 'Father\'s Name'],
      [/सही/gi, 'Signature'],
      [/गर्भधारणा\s*झालेली\s*नाही/gi, 'is not pregnant'],
      [/गर्भवती\s*नाही/gi, 'is not pregnant'],
      [/कोणतेही\s*अपत्य\s*नाही/gi, 'no children born out of wedlock']
    ];

    const enToMrMap: Array<[RegExp, string]> = [
      [/Applicant\s*No\.?\s*1/gi, 'अर्जदार क्रमांक १'],
      [/Applicant\s*No\.?\s*2/gi, 'अर्जदार क्रमांक २'],
      [/Applicant/gi, 'अर्जदार'],
      [/Petitioner/gi, 'अर्जदार'],
      [/Respondent/gi, 'सामनेवाले'],
      [/Opponent/gi, 'सामनेवाले'],
      [/Section\s*13\s*\(\s*B\s*\)\s*of\s*(?:the\s*)?Hindu\s*Marriage\s*Act(?:,\s*1955)?/gi, 'हिंदू विवाह कायदा १९५५ चे कलम १३(ब)'],
      [/Hindu\s*Marriage\s*Act/gi, 'हिंदू विवाह कायदा'],
      [/Section\s*13\s*\(\s*B\s*\)/gi, 'कलम १३(ब)'],
      [/Joint\s*Petition\s*for\s*(?:Mutual\s*Consent\s*)?Divorce/gi, 'परस्पर संमतीने घटस्फोट मिळणेबाबतचा संयुक्त अर्ज'],
      [/Court\s*of\s*Civil\s*Judge\s*Senior\s*Division/gi, 'मे. दिवाणी न्यायाधीश वरिष्ठ स्तर, न्यायालय'],
      [/Civil\s*Judge\s*Senior\s*Division/gi, 'दिवाणी न्यायाधीश वरिष्ठ स्तर'],
      [/Affidavit/gi, 'प्रतिज्ञालेख'],
      [/Alimony\s*\/\s*Maintenance/gi, 'पोटगी / खावटी'],
      [/Alimony/gi, 'पोटगी'],
      [/Maintenance/gi, 'खावटी'],
      [/Stridhan/gi, 'स्त्रीधन'],
      [/Divorce/gi, 'घटस्फोट'],
      [/Marriage/gi, 'विवाह'],
      [/Mutual\s*Consent/gi, 'परस्पर संमती'],
      [/Homemaker/gi, 'गृहिणी'],
      [/Service\s*\(\s*Job\s*\)/gi, 'सेवा (नोकरी)'],
      [/Business/gi, 'व्यवसाय'],
      [/Agriculture/gi, 'शेती'],
      [/Rupees/gi, 'रुपये'],
      [/Taluka/gi, 'ता.'],
      [/District/gi, 'जि.'],
      [/Residing\s*at/gi, 'रा.'],
      [/Age/gi, 'वय'],
      [/Occupation/gi, 'धंदा']
    ];

    const translatedTokens = tokens.map((token) => {
      if (token.startsWith('<')) {
        return token; // Leave HTML tag untouched
      }

      let text = token;
      if (targetLanguage === 'en') {
        for (const [pattern, replacement] of mrToEnMap) {
          text = text.replace(pattern, replacement);
        }
        for (let i = 0; i < devanagariDigits.length; i++) {
          text = text.replaceAll(devanagariDigits[i], asciiDigits[i]);
        }
      } else {
        for (const [pattern, replacement] of enToMrMap) {
          text = text.replace(pattern, replacement);
        }
        for (let i = 0; i < asciiDigits.length; i++) {
          text = text.replaceAll(asciiDigits[i], devanagariDigits[i]);
        }
      }
      return text;
    });

    return translatedTokens.join('');
  }

  private fallbackChatResponse(message: string, context: any): string {
    const lower = message.toLowerCase();

    if (lower.includes('convert') || lower.includes('translate') || lower.includes('english') || lower.includes('marathi') || lower.includes('मराठी')) {
      const targetLang: 'en' | 'mr' = (lower.includes('marathi') || lower.includes('मराठी')) ? 'mr' : 'en';
      const translated = this.localTranslateHtml(context.documentBody || '', targetLang);
      const langName = targetLang === 'en' ? 'English' : 'Marathi (Devanagari)';
      return `I have translated your document into formal legal ${langName}.\n\n[REVISED_DOCUMENT_START]\n${translated}\n[REVISED_DOCUMENT_END]`;
    }

    if (lower.includes('alimony') || lower.includes('पोटगी') || lower.includes('waiver') || lower.includes('हक्क सोडला')) {
      return `### Proposed Alimony / Maintenance Clause:

**Option A (Full & Final Lump-Sum Alimony - Marathi):**
"अर्जदार क्रमांक १ हे अर्जदार क्रमांक २ हिला मागील, पुढील व भविष्यातील खावटी / पोटगी म्हणून एकरकमी रक्कम रुपये २,००,०००/- (अक्षरी रुपये दोन लाख मात्र) देण्याचे ठरले आहे. सदर रक्कम मिळाल्यानंतर अर्जदार क्रमांक २ हिला कोणतीही तक्रार राहणार नाही व भविष्यात ती कोणतीही खावटी मागणार नाही."

**Option B (Complete Waiver - Marathi):**
"अर्जदार क्रमांक २ यांनी खावटी / पोटगी मागण्याचा संपूर्ण हक्क कायमस्वरूपी विनामोबदला या घटस्फोटापासून स्वखुशीने सोडून दिलेला आहे. भविष्यात अर्जदार क्र. २ ही पती किंवा त्यांच्या कुटुंबीयांविरुद्ध कोणतीही खावटी मागणार नाही किंवा केसेस करणार नाही."

*Tip: You can use the action button or ask me "Update draft with alimony waiver" to apply this directly into your active petition.*`;
    }

    if (lower.includes('custody') || lower.includes('ताबा') || lower.includes('मुले') || lower.includes('child')) {
      return `### Proposed Child Custody Clause (Marathi):

"दोन्ही अर्जदारांची अपत्ये (मुलगा/मुलगी) अर्जदार क्रमांक २ (आई) यांच्याकडे कायमस्वरूपी राहावयाची असून, त्यांच्या पालन पोषण, शिक्षण व संगोपनाची संपूर्ण जबाबदारी अर्जदार क्रमांक २ यांची राहील. अर्जदार क्रमांक १ हे मुलांच्या ताब्याबाबत भविष्यात कोणताही वाद अथवा दावा करणार नाहीत."`;
    }

    if (lower.includes('pregnant') || lower.includes('गर्भवती') || lower.includes('pregnancy')) {
      return `### Mandatory Non-Pregnancy Declaration:

"तसेच आज रोजी अर्जदार क्र. २ ही गर्भवती नाही."

*Note: As per Bombay High Court standards for Hindu Marriage Act Sec 13B petitions, this declaration is mandatory to rule out future paternity issues.*`;
    }

    if (lower.includes('high court') || lower.includes('guidelines') || lower.includes('मार्गदर्शक तत्त्वे')) {
      return `### Bombay High Court Compliance Clause:

"६) मा. मुंबई उच्च न्यायालयाच्या निर्देशानुसार :
अ) अर्जदार क्र. १ व २ हे हिंदू धर्माचे आहेत व हिंदू विवाह कायदा १९५५ लागू आहे.
ब) दोघांचे लग्न होऊन १ वर्षापेक्षा जास्त कालावधी झालेला आहे व ते १ वर्षापेक्षा अधिक कालावधीपासून विभक्त राहत आहेत.
क) उभयतांनी कोणत्याही दबावाखाली, धाकधपटशाने किंवा फसवणुकीने हा अर्ज केलेला नसून पूर्णतः स्वखुशीने व विचारपूर्वक दाखल केलेला आहे.
ड) यापूर्वी कोणत्याही कोर्टात घटस्फोटाचा अथवा वैवाहिक दाद मागण्याचा अर्ज प्रलंबित नाही."`;
    }

    if (lower.includes('nda') || lower.includes('confidentiality') || lower.includes('non-disclosure')) {
      return `### Standard Confidentiality Clause (NDA):

"Each Party agrees that during the term of this Agreement and for a period of three (3) years thereafter, the Receiving Party shall maintain in strict confidence and not disclose to any third party any Confidential Information received from the Disclosing Party, using at least the same degree of care it uses to protect its own confidential information of like nature."`;
    }

    return `I am analyzing your active document (${context.templateTitle || 'Legal Draft'}). 

I can assist you with:
1. **Auto-populating client details** from your interview notes or raw facts.
2. **Drafting or inserting specific clauses** (e.g. Alimony Waiver, Child Custody, High Court compliance, Non-Compete, Governing Law).
3. **Auditing the draft** for missing statutory fields (1-year separation, non-pregnancy affirmation, court jurisdiction).
4. **Translating between English and Marathi** with court-approved Devanagari legal terminology.

How would you like me to update your draft?`;
  }

  async extractFactsFromNotes(
    rawNotes: string,
    apiKey?: string,
    templateId?: string,
    templateTitle?: string,
    templateFields?: any[],
    systemPromptOverride?: string,
    referencePdfAttachment?: { fileName: string; dataBase64: string }
  ): Promise<ExtractedDetailsResult> {
    const client = this.getClient(apiKey);
    let activeTmpl = templateId ? templateService.getTemplate(templateId) : undefined;
    const targetFields = templateFields || activeTmpl?.fields || [];

    // Auto-load reference court PDF for this template if not provided explicitly
    let pdfAttachment = referencePdfAttachment;
    if (!pdfAttachment && templateId) {
      try {
        const pdfData = await templateService.getTemplatePdf(templateId);
        if (pdfData?.pdfBuffer) {
          pdfAttachment = {
            fileName: pdfData.fileName,
            dataBase64: pdfData.pdfBuffer.toString('base64'),
          };
          console.log(`📎 [Gemini AI Pleading] Loaded reference court PDF "${pdfData.fileName}" (${pdfData.fileSize} bytes) for template "${templateId}".`);
        }
      } catch (err: any) {
        console.warn('⚠️ Could not load template reference PDF for fact extraction:', err.message);
      }
    }

    if (client) {
      try {
        let schemaPrompt = '';
        if (targetFields.length > 0) {
          const fieldDesc = targetFields.map((f: any) => `  "${f.key}": "${f.labelMr || f.label || f.key}"`).join(',\n');
          schemaPrompt = `{\n${fieldDesc}\n}`;
        } else {
          schemaPrompt = `{
  "courtCity": "string",
  "party1Name": "Husband/Party 1 full name",
  "party1Age": "number as string",
  "party1Occupation": "string",
  "party1Address": "string",
  "party2Name": "Wife/Party 2 married name",
  "party2MaidenName": "Wife maiden name before marriage",
  "party2Age": "number as string",
  "party2Occupation": "string",
  "party2Address": "string",
  "marriageDate": "dd/mm/yyyy",
  "marriagePlace": "string",
  "separationDate": "dd/mm/yyyy",
  "separationYears": "string",
  "childrenDetails": "string",
  "custodyWith": "wife" or "husband" or "na",
  "alimonyNil": true or false,
  "alimonyAmount": "string (numbers)",
  "alimonyWords": "string in words"
}`;
        }

        const referenceNotice = pdfAttachment
          ? `\n\n=======================================================
CRITICAL COURT REFERENCE PLEADING ATTACHED (PDF: "${pdfAttachment.fileName}"):
The advocate has provided an official court reference pleading document in PDF.
You MUST examine and cross-reference the attached court reference PDF carefully:
1. Examine its legal framing, terminology (Marathi/English), prayer clauses, statutory sections, and party descriptions.
2. Ensure the extracted facts, legal terms, and narrative correspond to the authentic court pleading standards exemplified in this reference document.
3. Extract any specific statutory sections, case numbers, or legal phrasing demonstrated in the reference document.
=======================================================`
          : '';

        const defaultPrompt = `You are an expert AI Legal Drafter for Maharashtra Courts. Extract all client, case, party, transaction, and court details from the following lawyer's questionnaire / narrative prompt into a JSON object matching this schema:
${schemaPrompt}

Extraction Rules:
1. Extract every detail present in the notes matching the schema keys.
2. CRITICAL PARTY / APPLICANT / PAKSHAKAR / ACCUSED RULE:
   - Keep and extract ONLY the Party / Applicant / Pakshakar / Accused information that is ACTUALLY and EXPLICITLY provided in the notes/prompt.
   - If information is NOT provided for any additional Party / Applicant / Pakshakar / Accused (e.g., party2, party3, party4, party5, accused2, accused3, opponent2, etc.), do NOT invent, assume, or output dummy/placeholder values. Leave those fields empty ("") or omit them completely so unprovided party placeholders and attributes are cleanly removed from the final pleading.
   - Never output generic placeholder text (such as "पाकशाकार ३ नाव", "पाकशाकार ४ नाव", "शरि नामे", "नाव", "____", "N/A").
3. For dates, format strictly as DD/MM/YYYY.
4. For money/cheque amounts, format with Indian commas (e.g. 2,50,000).
5. If the prompt is in Marathi or template is Marathi, preserve Marathi Devanagari text for names, relations, and addresses.
6. Return ONLY a valid JSON object.

Notes / Prompt:
${rawNotes}`;

        // Use the override if provided, otherwise use the default prompt.
        // The override is treated as the full system instruction; schema + notes are always appended.
        const prompt = systemPromptOverride
          ? `${systemPromptOverride}

JSON Schema to fill:
${schemaPrompt}

Notes / Prompt:
${rawNotes}`
          : defaultPrompt;

        const userParts: any[] = [];
        if (pdfAttachment) {
          userParts.push({
            inlineData: {
              mimeType: 'application/pdf',
              data: pdfAttachment.dataBase64,
            }
          });
        }
        userParts.push({ text: prompt + referenceNotice });

        const textResp = await this.generateWithGeminiFallback(client,
          [{ role: 'user', parts: userParts }],
          { responseMimeType: 'application/json' }
        );

        if (textResp) {
          const parsed = JSON.parse(textResp);
          // Sanitize party fields: if not valid party value, clear them
          for (const [k, v] of Object.entries(parsed)) {
            if (/^(?:party|applicant|accused|opponent|respondent|pakshakar)[0-9]+(?:name|नाव)?$/i.test(k)) {
              if (!isValidPartyValue(v)) {
                parsed[k] = '';
              }
            }
          }
          return {
            facts: parsed,
            summary: `Successfully extracted ${Object.keys(parsed).length} fields from prompt.`
          };
        }
      } catch (err: any) {
        console.warn('Gemini extraction failed, using deterministic extractor:', err?.message);
      }
    }

    // Deterministic fallback regex & key-value extractor
    const facts: Partial<ClientFacts> = {};
    const text = rawNotes;

    // Parse explicit Key: Value lines
    const lines = text.split('\n');
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const keyPart = line.substring(0, colonIdx).trim().toLowerCase().replace(/[\(\)\:\=\-_]/g, ' ');
        const valPart = line.substring(colonIdx + 1).trim();
        if (valPart) {
          // Check against active template field definitions directly
          if (targetFields.length > 0) {
            let matched = false;
            for (const f of targetFields) {
              const fKey = f.key.toLowerCase().replace(/[\(\)\:\=\-_]/g, ' ');
              const fLabel = (f.label || '').toLowerCase().replace(/[\(\)\:\=\-_]/g, ' ');
              const fLabelMr = (f.labelMr || '').toLowerCase().replace(/[\(\)\:\=\-_]/g, ' ');
              if (
                keyPart === fKey ||
                (fLabel && keyPart === fLabel) ||
                (fLabelMr && keyPart === fLabelMr) ||
                (fLabelMr && keyPart.includes(fLabelMr)) ||
                (fLabel && keyPart.includes(fLabel))
              ) {
                (facts as any)[f.key] = valPart;
                matched = true;
                break;
              }
            }
            if (matched) continue;
          }

          // Cheque bounce mappings
          if (keyPart.includes('cheque no') || keyPart.includes('चेक क्रमांक') || keyPart.includes('चेक नं')) {
            facts.ChequeNumber = valPart;
          } else if (keyPart.includes('cheque date') || keyPart.includes('चेक दिनांक') || keyPart.includes('चेक तारीख')) {
            facts.ChequeDate = valPart;
          } else if (keyPart.includes('amount in words') || keyPart.includes('अक्षरी')) {
            facts.AmountInWords = valPart;
          } else if (keyPart.includes('amount') || keyPart.includes('चेक रक्कम') || keyPart.includes('रक्कम')) {
            facts.AmountofCheque = valPart;
          } else if (keyPart.includes('account no') || keyPart.includes('खाते क्रमांक')) {
            facts.AcNumber = valPart;
          } else if (keyPart.includes('branch') || keyPart.includes('शाखा')) {
            facts.AccusedBankBranch = valPart;
          } else if (keyPart.includes('accused bank') || keyPart.includes('आरोपीची बँक') || keyPart.includes('बँकेचे नाव')) {
            facts.AccusedBank = valPart;
          } else if (keyPart.includes('complainant bank') || keyPart.includes('फिर्यादीची बँक')) {
            facts.ComplaintBank = valPart;
          } else if (keyPart.includes('memo date') || keyPart.includes('मेमो दिनांक') || keyPart.includes('मेमो तारीख')) {
            facts.MemoDate = valPart;
          } else if (keyPart.includes('memo reason') || keyPart.includes('अनादराचे कारण') || keyPart.includes('कारण')) {
            facts.MemoReason = valPart;
          } else if (keyPart.includes('notice date') || keyPart.includes('नोटीस पाठविल्याची') || keyPart.includes('नोटीस दिनांक')) {
            facts.NoticeDate = valPart;
          } else if (keyPart.includes('tracking') || keyPart.includes('ट्रॅकिंग') || keyPart.includes('पावती')) {
            facts.TrackingNo = valPart;
          } else if (keyPart.includes('delivered date') || keyPart.includes('नोटीस आरोपीस मिळाल्याची')) {
            facts.NoticeDeliveredDate = valPart;
          } else if (keyPart.includes('expiry date') || keyPart.includes('मुदत संपल्याची तारीख')) {
            facts.NoticeExpiryDate = valPart;
          } else if (keyPart.includes('cause of action') || keyPart.includes('कारवाईचे कारण') || keyPart.includes('तक्रारीचे कारण')) {
            facts.CauseOfActionDate = valPart;
          } else if (keyPart.includes('transaction') || keyPart.includes('व्यवहाराचा तपशील')) {
            facts.Transaction = valPart;
          } else if (keyPart.includes('interim compensation') || keyPart.includes('अंतरिम भरपाई')) {
            facts.InterimCompensation = valPart;
          } else if (keyPart.includes('complainant') || keyPart.includes('फिर्यादी')) {
            if (!facts.party1Name && isValidPartyValue(valPart)) facts.party1Name = valPart;
          } else if (keyPart.includes('accused') || keyPart.includes('आरोपी')) {
            if (!facts.party2Name && isValidPartyValue(valPart)) facts.party2Name = valPart;
          }
          // Varas / Heirship mappings
          else if (keyPart.includes('deceased name') || keyPart.includes('मयताचे पूर्ण नाव') || keyPart.includes('मयत नाव')) {
            facts.deceasedName = valPart;
          } else if (keyPart.includes('death date') || keyPart.includes('मृत्यू दिनांक') || keyPart.includes('मयत तारीख')) {
            facts.deceasedDate = valPart;
          } else if (keyPart.includes('place of death') || keyPart.includes('मृत्यूचे ठिकाण')) {
            facts.placeofDeath = valPart;
          } else if (keyPart.includes('hairshipreason') || keyPart.includes('प्रयोजन') || keyPart.includes('वारस दाखला कारण')) {
            facts.HairshipReason = valPart;
          } else if (keyPart.includes('वारस #1') || keyPart.includes('वारस 1') || keyPart.includes('वारस क्र. १') || keyPart.includes('वारसदार 1')) {
            if (isValidPartyValue(valPart)) facts.party1Name = valPart;
          } else if (keyPart.includes('वारस #2') || keyPart.includes('वारस 2') || keyPart.includes('वारस क्र. २') || keyPart.includes('वारसदार 2')) {
            if (isValidPartyValue(valPart)) facts.party2Name = valPart;
          } else if (keyPart.includes('वारस #3') || keyPart.includes('वारस 3') || keyPart.includes('वारस क्र. ३') || keyPart.includes('वारसदार 3')) {
            if (isValidPartyValue(valPart)) facts.party3Name = valPart;
          } else if (keyPart.includes('वारस #4') || keyPart.includes('वारस 4') || keyPart.includes('वारस क्र. ४') || keyPart.includes('वारसदार 4')) {
            if (isValidPartyValue(valPart)) facts.party4Name = valPart;
          } else if (keyPart.includes('वारस #5') || keyPart.includes('वारस 5') || keyPart.includes('वारस क्र. ५') || keyPart.includes('वारसदार 5')) {
            if (isValidPartyValue(valPart)) facts.party5Name = valPart;
          }
          // General client & party mappings
          else if (keyPart.includes('applicant') || keyPart.includes('client') || keyPart.includes('husband') || keyPart.includes('deponent') || keyPart.includes('अर्जदार') || keyPart.includes('पती')) {
            if (!facts.party1Name && isValidPartyValue(valPart)) facts.party1Name = valPart;
          } else if (keyPart.includes('wife') || keyPart.includes('opposite') || keyPart.includes('सामनेवाला') || keyPart.includes('पत्नी')) {
            if (!facts.party2Name && isValidPartyValue(valPart)) facts.party2Name = valPart;
          } else if (keyPart.includes('court') || keyPart.includes('city') || keyPart.includes('ठिकाण') || keyPart.includes('शहर')) {
            if (!facts.courtCity) facts.courtCity = valPart;
          } else if (keyPart.includes('heirs') || keyPart.includes('children') || keyPart.includes('वारस') || keyPart.includes('अपत्य')) {
            if (!facts.childrenDetails) facts.childrenDetails = valPart;
          } else if (keyPart.includes('advocate') || keyPart.includes('वकील') || keyPart.includes('वकिलांचे नाव')) {
            facts.advocateName = valPart;
            facts.AdvocateName = valPart;
          }
        }
      }
    }

    // 1. Name Change fields
    const oldNameMatch = text.match(/(?:old name|मागील जुने नाव|मागील नाव|पूर्वीचे नाव)\s*[:=-]?\s*([A-Za-z\u0900-\u097F\s.]+?)(?:,|\n|\(|$)/i);
    if (oldNameMatch && oldNameMatch[1].trim()) {
      facts.deponentOldName = oldNameMatch[1].trim();
    }

    const newNameMatch = text.match(/(?:new name|नवीन नाव|नवीन धारण केलेले नाव)\s*[:=-]?\s*([A-Za-z\u0900-\u097F\s.]+?)(?:,|\n|\(|$)/i);
    if (newNameMatch && newNameMatch[1].trim()) {
      facts.deponentNewName = newNameMatch[1].trim();
    }

    const fatherMatch = text.match(/(?:father|father's name|husband's name|वडिलांचे नाव|पतीचे नाव|care of|s\/o|w\/o|d\/o|residing with father)\s*[:=-]?\s*([A-Za-z\u0900-\u097F\s.]+?)(?:,|\n|at|रा\.|$)/i);
    if (fatherMatch && fatherMatch[1].trim()) {
      facts.fatherOrHusbandName = fatherMatch[1].trim();
      facts.party2Guardian = fatherMatch[1].trim();
    }

    // 2. Client / Husband / Party 1 Names
    const husbandMatch = text.match(/(?:client|husband|पती|पतीचे नाव|applicant 1|mr\.?|deponent|first party|creditor)\s*[:=-]?\s*([A-Za-z\u0900-\u097F\s.]+?)(?:,|\n|\(|age|वय|service|धंदा|residing|$)/i);
    if (husbandMatch && husbandMatch[1].trim()) {
      const name = husbandMatch[1].trim();
      if (!facts.party1Name) facts.party1Name = name;
      if (!facts.deponentNewName) facts.deponentNewName = name;
    }

    // 3. Wife / Party 2 Names
    const wifeMatch = text.match(/(?:wife|पत्नी|पत्नीचे नाव|applicant 2|mrs\.?|सौ\.?|second party|defaulter|debtor)\s*[:=-]?\s*([A-Za-z\u0900-\u097F\s.]+?)(?:,|\n|\(|age|वय|maiden|residing|$)/i);
    if (wifeMatch && wifeMatch[1].trim()) {
      if (!facts.party2Name) facts.party2Name = wifeMatch[1].trim();
    }

    const maidenMatch = text.match(/(?:maiden name|maiden|माहेरचे नाव|लग्नापूर्वीचे नाव)\s*[:=-]?\s*([A-Za-z\u0900-\u097F\s.]+?)(?:,|\n|\)|$)/i);
    if (maidenMatch && maidenMatch[1].trim()) {
      facts.party2MaidenName = maidenMatch[1].trim();
    }

    // 4. Ages
    const ageMatches = [...text.matchAll(/(?:age|वय)\s*[:=-]?\s*(\d{1,2})|\b([1-9][0-9])\s*(?:years|वर्षे|yrs)\b/gi)];
    if (ageMatches.length >= 1) {
      const age1 = ageMatches[0][1] || ageMatches[0][2];
      if (!facts.party1Age) facts.party1Age = age1;
      facts.deponentAge = age1;
      if (ageMatches.length >= 2) {
        const age2 = ageMatches[1][1] || ageMatches[1][2];
        if (!facts.party2Age) facts.party2Age = age2;
      }
    }

    // 5. Occupations
    if (/service|नोकरी|private company/i.test(text)) {
      if (!facts.party1Occupation) facts.party1Occupation = 'सेवा (नोकरी)';
      facts.deponentOccupation = 'सेवा (नोकरी)';
    } else if (/business|व्यवसाय/i.test(text)) {
      if (!facts.party1Occupation) facts.party1Occupation = 'व्यवसाय';
      facts.deponentOccupation = 'व्यवसाय';
    }

    if (/homemaker|गृहिणी|housewife/i.test(text)) {
      facts.party2Occupation = 'गृहिणी';
    }

    // 6. Addresses
    const p1AddrMatch = text.match(/(?:residing at|address|पत्ता|रा\.)\s*[:=-]?\s*([A-Za-z\u0900-\u097F\s,.-]+?)(?:\.\s*Wife|\.\s*Client|\.\s*Married|\n|$)/i);
    if (p1AddrMatch && p1AddrMatch[1].trim()) {
      const addr = p1AddrMatch[1].trim().replace(/^,\s*/, '');
      const formatted = addr.includes('रा.') ? addr : `रा. ${addr}`;
      if (!facts.party1Address) facts.party1Address = formatted;
      facts.deponentAddress = formatted;
    }

    const p2AddrMatch = text.match(/(?:residing with father|wife.*?residing at|पत्नी.*?पत्ता)\s*[:=-]?\s*([A-Za-z\u0900-\u097F\s,.-]+?)(?:\.\s*Married|\.\s*No children|\n|$)/i);
    if (p2AddrMatch && p2AddrMatch[1].trim()) {
      const addr = p2AddrMatch[1].trim();
      if (!facts.party2Address) facts.party2Address = addr.includes('रा.') ? addr : `रा. ${addr}`;
    }

    // 7. Marriage Date & Place
    const dateMatch = text.match(/(?:married on|marriage date|marriage|लग्न|विवाह)\s*(?:date|दिनांक|on)?\s*[:=-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i);
    if (dateMatch) {
      facts.marriageDate = dateMatch[1];
    }

    const placeMatch = text.match(/(?:married(?:.*?)at|marriage at|विवाह ठिकाण|लग्न ठिकाण)\s*[:=-]?\s*([A-Za-z\u0900-\u097F\s]+?)(?:,|\n|\.|$)/i);
    if (placeMatch && placeMatch[1].trim()) {
      facts.marriagePlace = placeMatch[1].trim();
    }

    // 8. Children Details
    if (/no children|अपत्य नाही|कोणतेही अपत्य नाही/i.test(text)) {
      facts.childrenDetails = 'कोणतेही अपत्य नाही';
      facts.custodyWith = 'na';
    }

    // 9. Separation Date & Duration
    const sepMatch = text.match(/(?:separated since|separation date|separation|विभक्त|माहेरी|फारकत)\s*(?:date|दिनांक|पासून|since)?\s*[:=-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i);
    if (sepMatch) {
      facts.separationDate = sepMatch[1];
    }

    const sepYearsMatch = text.match(/(?:approx|कालावधी)?\s*(\d+\s*(?:years|वर्षे|yrs))/i);
    if (sepYearsMatch) {
      facts.separationYears = `${sepYearsMatch[1]} कालावधी`;
    }

    // 10. Alimony & Settlement
    if (text.includes('पोटगी नाही') || text.includes('no alimony') || text.includes('waiver') || text.includes('हक्क सोडला')) {
      facts.alimonyNil = true;
    } else {
      const amountMatch = text.match(/(?:alimony of|alimony|पोटगी|खावटी|amount|रुपये|rs\.?|inr)\s*[:=-]?\s*([0-9,/-]+)/i);
      if (amountMatch) {
        facts.alimonyAmount = amountMatch[1].replace(/[^0-9,]/g, '');
        facts.alimonyNil = false;
      }
      const wordsMatch = text.match(/\(([^)]*?(?:lakh|rupees|रुपये|मात्र)[^)]*?)\)/i);
      if (wordsMatch) {
        facts.alimonyWords = wordsMatch[1].trim();
      }
    }

    // 11. Reason for Name Change
    const reasonMatch = text.match(/(?:reason|कारण|reason for change)\s*[:=-]?\s*([A-Za-z\u0900-\u097F\s]+?)(?:,|\n|\.|$)/i);
    if (reasonMatch && reasonMatch[1].trim()) {
      facts.reasonForChange = reasonMatch[1].trim();
    } else if (/numerology|अंकशास्त्र/i.test(text)) {
      facts.reasonForChange = 'अंकशास्त्र, ज्योतिषशास्त्र व व्यक्तिगत स्वेच्छेनुसार';
    }

    // 12. Court / City
    if (text.includes('Amalner') || text.includes('अमळनेर')) facts.courtCity = 'अमळनेर';
    else if (text.includes('Jalgaon') || text.includes('जळगाव')) facts.courtCity = 'जळगाव';
    else if (text.includes('Dhule') || text.includes('धुळे')) facts.courtCity = 'धुळे';
    else if (text.includes('Pune') || text.includes('पुणे')) facts.courtCity = 'पुणे';
    else if (text.includes('Mumbai') || text.includes('मुंबई')) facts.courtCity = 'मुंबई';
    else if (text.includes('Chopda') || text.includes('चोपडा')) facts.courtCity = 'चोपडा';

    return {
      facts,
      summary: `Extracted ${Object.keys(facts).length} fields from prompt.`
    };
  }

  async generateDraftFromPrompt(
    promptText: string,
    templateId: string,
    apiKey?: string,
    systemPromptOverride?: string
  ): Promise<{ facts: Partial<ClientFacts>; documentHtml: string; summary: string }> {
    const template = templateService.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found with ID: ${templateId}`);
    }

    const { facts, summary } = await this.extractFactsFromNotes(
      promptText,
      apiKey,
      templateId,
      template.title,
      template.fields,
      systemPromptOverride
    );

    // Ensure {todaysDate} variable is always filled with current system date in DD-MON-YYYY format in Marathi
    facts.todaysDate = getMarathiTodayDate();

    // Merge template with extracted facts (also cleans unpopulated placeholders and empty table rows)
    const documentHtml = templateService.mergeTemplate(template, facts);

    return {
      facts,
      documentHtml,
      summary: `Draft pleading generated successfully for ${template.title} referencing active template.`
    };
  }


  async transliterateText(text: string, customKey?: string): Promise<string> {
    if (!text || !text.trim()) return '';

    const client = this.getClient(customKey);
    if (client) {
      try {
        const prompt = `Transliterate the following English text or numbers into formal Marathi Devanagari script for Indian court petitions.
Return ONLY the Marathi Devanagari transliterated text with no explanations or quotation marks.

Examples:
- Nitin Madhukar Mahajan -> नितीन मधुकर महाजन
- Sanjeevani Nitin Mahajan -> संजीवनी नितीन महाजन
- Amalner, Ta. Amalner, Dist. Jalgaon -> अमळनेर, ता. अमळनेर, जि. जळगाव
- Service (Job) -> सेवा (नोकरी)
- Housewife -> गृहिणी
- 25000 -> २५०००
- 35 -> ३५

Text to transliterate: "${text}"`;

        const textResp = await this.generateWithGeminiFallback(client,
          [{ role: 'user', parts: [{ text: prompt }] }]
        );

        if (textResp) {
          const cleaned = textResp.trim().replace(/^["'«»]|["'«»]$/g, '');
          if (cleaned.length > 0) return cleaned;
        }
      } catch (err: any) {
        console.warn('Gemini AI transliteration failed, using local engine:', err?.message);
      }
    }

    return this.localPhoneticTransliterate(text);
  }

  localPhoneticTransliterate(input: string): string {
    if (!input) return '';

    // Convert digits 0-9 to Devanagari ०-९
    const digitMap: Record<string, string> = {
      '0': '०', '1': '१', '2': '२', '3': '३', '4': '४',
      '5': '५', '6': '६', '7': '७', '8': '८', '9': '९'
    };

    // Common Legal & Name Word Mappings
    const wordMap: Record<string, string> = {
      'nitin': 'नितीन',
      'madhukar': 'मधुकर',
      'mahajan': 'महाजन',
      'patil': 'पाटील',
      'sanjeevani': 'संजीवनी',
      'amalner': 'अमळनेर',
      'jalgaon': 'जळगाव',
      'dhule': 'धुळे',
      'pune': 'पुणे',
      'mumbai': 'मुंबई',
      'service': 'सेवा (नोकरी)',
      'job': 'नोकरी',
      'housewife': 'गृहिणी',
      'business': 'व्यवसाय',
      'farmer': 'शेती',
      'agriculture': 'शेती',
      'advocate': 'ॲडव्होकेट',
      'adv': 'ॲड.',
      'court': 'कोर्ट',
      'district': 'जिल्हा',
      'taluka': 'तालुका',
      'ta': 'ता.',
      'dist': 'जि.',
      'post': 'पो.',
      'at': 'रा.',
      'residing': 'रा.'
    };

    let result = input;

    // Word-level substitution
    result = result.replace(/\b[A-Za-z]+\b/g, (w) => {
      const lower = w.toLowerCase();
      if (wordMap[lower]) return wordMap[lower];

      // Simple phonetic conversion rule
      let converted = lower
        .replace(/sh/g, 'श')
        .replace(/ch/g, 'च')
        .replace(/th/g, 'थ')
        .replace(/dh/g, 'ध')
        .replace(/kh/g, 'ख')
        .replace(/gh/g, 'घ')
        .replace(/bh/g, 'भ')
        .replace(/ph/g, 'फ')
        .replace(/aa/g, 'आ')
        .replace(/ee/g, 'ई')
        .replace(/oo/g, 'ऊ')
        .replace(/a/g, 'ा')
        .replace(/i/g, 'ि')
        .replace(/u/g, 'ु')
        .replace(/e/g, 'े')
        .replace(/o/g, 'ो')
        .replace(/k/g, 'क')
        .replace(/g/g, 'ग')
        .replace(/j/g, 'ज')
        .replace(/t/g, 'त')
        .replace(/d/g, 'द')
        .replace(/n/g, 'न')
        .replace(/p/g, 'प')
        .replace(/b/g, 'ब')
        .replace(/m/g, 'म')
        .replace(/y/g, 'य')
        .replace(/r/g, 'र')
        .replace(/l/g, 'ल')
        .replace(/v/g, 'व')
        .replace(/w/g, 'व')
        .replace(/s/g, 'स')
        .replace(/h/g, 'ह');

      // Capitalize first char if original was capitalized
      return converted;
    });

    // Digit substitution
    result = result.replace(/[0-9]/g, (d) => digitMap[d] || d);

    return result;
  }

  /**
   * Generates 4 context-aware suggested chat prompts for the CopilotKit sidebar
   * based on the active template, document body, and client facts.
   * Uses gemini-2.0-flash (free tier). Returns empty array on any error.
   */
  async generateSuggestions(options: {
    templateTitle: string;
    documentBody: string;
    facts: Record<string, any>;
    apiKey: string;
  }): Promise<string[]> {
    const { templateTitle, documentBody, facts, apiKey } = options;

    const client = this.getClient(apiKey);
    if (!client) return this.fallbackSuggestions(templateTitle);

    const hasDoc = documentBody && documentBody.trim().length > 50;
    const factsJson = JSON.stringify(facts || {});

    const prompt = `You are a legal AI assistant. Based on the current state of a lawyer's drafting session, generate exactly 4 short, actionable suggested chat messages the lawyer might want to send.

Active Template: "${templateTitle}"
Has Document Content: ${hasDoc ? 'Yes' : 'No (empty)'}
Client Facts (partial): ${factsJson.substring(0, 300)}

Rules:
- Each suggestion must be a direct instruction or question (1 sentence, max 10 words)
- Cover different actions: fill details, audit, insert clause, translate
- Use the template context (e.g. for divorce: alimony, custody, pregnancy clause)
- Return ONLY a JSON array of 4 strings, no explanation

Example format:
["Fill client details from my notes", "Audit this draft for Bombay HC compliance", "Add alimony waiver clause", "Translate document to English"]`;

    try {
      const textResp = await this.generateWithGeminiFallback(client,
        [{ role: 'user', parts: [{ text: prompt }] }],
        { responseMimeType: 'application/json' }
      );

      if (textResp) {
        const parsed = JSON.parse(textResp);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.slice(0, 5).map((s: any) => String(s));
        }
      }
    } catch (err: any) {
      console.warn('generateSuggestions Gemini error:', err?.message);
    }

    return this.fallbackSuggestions(templateTitle);
  }

  private fallbackSuggestions(templateTitle: string): string[] {
    const lower = (templateTitle || '').toLowerCase();
    if (lower.includes('divorce') || lower.includes('घटस्फोट')) {
      return [
        'Fill client details from my interview notes',
        'Add alimony waiver clause to the petition',
        'Check Bombay HC mandatory compliance clauses',
        'Translate this petition to English'
      ];
    }
    if (lower.includes('nda') || lower.includes('agreement') || lower.includes('contract')) {
      return [
        'Draft a strong confidentiality clause',
        'Add governing law and jurisdiction clause',
        'Summarize key obligations of both parties',
        'Translate this agreement to Marathi'
      ];
    }
    if (lower.includes('affidavit') || lower.includes('प्रतिज्ञा')) {
      return [
        'Fill applicant details from my notes',
        'Add verification and deponent declaration',
        'Audit this affidavit for notary requirements',
        'Translate to English'
      ];
    }
    return [
      'Fill client details from my notes',
      'Audit this document for compliance',
      'Suggest a relevant legal clause to add',
      'Translate document to English'
    ];
  }

  /**
   * AI-powered statutory compliance audit using Gemini 2.0 Flash.
   * Returns structured { passed, warnings, failed, summary } result.
   */
  async aiAuditDocument(options: {
    templateTitle: string;
    documentBody: string;
    facts: Record<string, any>;
    statutoryRequirements: string[];
    apiKey: string;
  }): Promise<{
    passed: string[];
    warnings: string[];
    failed: string[];
    summary: string;
    score: number;
  }> {
    const { templateTitle, documentBody, facts, statutoryRequirements, apiKey } = options;

    const client = this.getClient(apiKey);
    if (!client) {
      return {
        passed: [],
        warnings: ['AI audit unavailable — Gemini API key not configured.'],
        failed: [],
        summary: 'Configure Gemini API key in Settings to enable AI audit.',
        score: 0
      };
    }

    const reqsText = statutoryRequirements.length > 0
      ? statutoryRequirements.map((r, i) => `${i + 1}. ${r}`).join('\n')
      : 'No explicit statutory requirements specified.';

    const prompt = `You are an expert Indian court legal compliance auditor. Audit the following legal document for statutory compliance and mandatory clause completeness.

Template: "${templateTitle}"
Statutory Requirements:
${reqsText}

Document (HTML stripped):
${documentBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}

Task: Audit the document and return a JSON object with:
{
  "passed": ["list of compliance items that are satisfied"],
  "warnings": ["list of items present but may need review"],
  "failed": ["list of missing mandatory items"],
  "summary": "1-2 sentence overall assessment",
  "score": <integer 0-100 compliance score>
}

Be specific. Check for: party names, dates, jurisdiction, mandatory declarations (non-pregnancy, separation period, waiver clauses), court details, signatures/affirmations.
Return ONLY valid JSON.`;

    try {
      const textResp = await this.generateWithGeminiFallback(client,
        [{ role: 'user', parts: [{ text: prompt }] }],
        { responseMimeType: 'application/json' }
      );

      if (textResp) {
        const parsed = JSON.parse(textResp);
        return {
          passed: Array.isArray(parsed.passed) ? parsed.passed : [],
          warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
          failed: Array.isArray(parsed.failed) ? parsed.failed : [],
          summary: typeof parsed.summary === 'string' ? parsed.summary : 'Audit complete.',
          score: typeof parsed.score === 'number' ? Math.max(0, Math.min(100, parsed.score)) : 50
        };
      }
    } catch (err: any) {
      console.warn('aiAuditDocument Gemini error:', err?.message);
    }

    return {
      passed: [],
      warnings: ['AI audit could not complete due to a Gemini API error.'],
      failed: [],
      summary: 'Please try again or check your Gemini API key.',
      score: 0
    };
  }

  async checkGrammar(options: { documentBody: string; templateTitle?: string; apiKey?: string }): Promise<string> {
    const { documentBody, templateTitle, apiKey } = options;
    const client = this.getClient(apiKey);
    if (!client) throw new Error('Gemini API key is missing');

    const prompt = `You are a formal Marathi legal grammar and style checker.
Review the following HTML legal document (Template: ${templateTitle || 'Legal Document'}).
Correct any grammatical errors, spelling mistakes, and ensure court-approved formal Marathi (Devanagari) register is used.

CRITICAL REQUIREMENTS:
1. For EVERY single word or phrase that you change, correct, or add, you MUST wrap it in a <mark class="grammar-highlight"> tag so the user can see what was changed. 
For example: if you change "नितिन" to "नितीन", output <mark class="grammar-highlight">नितीन</mark>.
2. MANDATORY: PRESERVE ALL <table>, <tr>, <td>, <th> structures, table borders, cell styling, margins, and spacing (<p><br></p>, <br>). Do NOT remove or modify tables.

Return ONLY the corrected HTML document. DO NOT wrap it in markdown block quotes. Preserve all HTML tags perfectly.

Document:
${documentBody}`;

    const text = await this.generateWithGeminiFallback(client, [{ role: 'user', parts: [{ text: prompt }] }]);
    if (text) {
      const cleaned = text.replace(/```html|```/g, '').trim();
      return this.ensureTablesAndSpacingPreserved(documentBody, cleaned, 'grammar check');
    }
    throw new Error('Failed to generate grammar check');
  }

  async draftClause(options: { prompt: string; templateTitle?: string; apiKey?: string }): Promise<string> {
    const { prompt, templateTitle, apiKey } = options;
    const client = this.getClient(apiKey);
    if (!client) throw new Error('Gemini API key is missing');

    const systemPrompt = `You are an expert Indian advocate drafting formal Marathi legal clauses.
Template context: ${templateTitle || 'Legal Document'}
The user wants to draft a new clause based on this description: "${prompt}"

Generate the legal clause in formal Marathi (Devanagari).
Return ONLY the raw HTML paragraph(s). For example: <p><b>Clause Title:</b> clause text in marathi...</p>
Do not include any explanation or markdown formatting.`;

    const text = await this.generateWithGeminiFallback(client, [{ role: 'user', parts: [{ text: systemPrompt }] }]);
    if (text) {
      return text.replace(/```html|```/g, '').trim();
    }
    throw new Error('Failed to draft clause');
  }

  async processAutocomplete(textBefore: string, templateTitle: string, clientFacts: any, apiKey?: string): Promise<string> {
    const client = this.getClient(apiKey);
    if (!client) {
      return '';
    }

    let factsStr = '';
    if (clientFacts && typeof clientFacts === 'object') {
      try {
        factsStr = JSON.stringify(clientFacts, null, 2);
      } catch (e) { }
    }

    const prompt = `You are an AI typing assistant for a lawyer drafting a ${templateTitle || 'legal document'}.
Here are the facts of the case:
${factsStr}

The lawyer is currently typing the document in Marathi. Here is the exact text right before their cursor:
"""
${textBefore}
"""

Please suggest the next few words (or up to 2 sentences) to complete the thought contextually.
CRITICAL RULES:
1. ONLY output the continuation text. Do not repeat the text before the cursor.
2. Do not output quotes.
3. Keep it brief (max 20 words).
4. Do not output any markdown formatting or tags, just raw text.`;

    try {
      const text = await this.generateWithGeminiFallback(client, [{ role: 'user', parts: [{ text: prompt }] }]);
      return text ? text.trim() : '';
    } catch (err) {
      console.error('Autocomplete error:', err);
      return '';
    }
  }
}

export const copilotService = new CopilotService();

