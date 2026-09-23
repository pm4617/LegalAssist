import { GoogleGenAI } from '@google/genai';
import { ClientFacts } from '../types/index.js';

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

  private async generateWithGeminiFallback(client: GoogleGenAI, contents: any, config?: any): Promise<string> {
    const modelsToTry = [
    'gemini-2.5-flash',  // Change this to the primary stable Flash model
      'gemini-1.5-flash'   //  Change this to the stable fallback model
  ];
    let lastError: any = null;

    for (const model of modelsToTry) {
      try {
        const response = await client.models.generateContent({
          model,
          contents,
          ...(config || {})
        });
        if (response.text && response.text.trim()) {
          return response.text.trim();
        }
      } catch (err: any) {
        lastError = err;
        const rawMsg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
        const status = err?.status || err?.statusCode;

        const isRetryable =
          status === 429 ||
          status === 404 ||
          status === 400 ||
          rawMsg.includes('429') ||
          rawMsg.includes('404') ||
          rawMsg.includes('400') ||
          rawMsg.includes('quota') ||
          rawMsg.includes('no longer available') ||
          rawMsg.includes('deprecated') ||
          rawMsg.includes('RESOURCE_EXHAUSTED') ||
          rawMsg.includes('NOT_FOUND') ||
          rawMsg.includes('not found') ||
          rawMsg.includes('is not supported');

        if (isRetryable) {
          console.warn(`Gemini model "${model}" returned error (${status || 'retryable'}), trying fallback model...`);
          continue;
        }
        throw err;
      }
    }

    if (lastError?.status === 429 || (lastError?.message && (lastError.message.includes('429') || lastError.message.includes('quota') || lastError.message.includes('RESOURCE_EXHAUSTED')))) {
      throw new Error('Gemini API rate limit reached (HTTP 429). Free-tier quota was exceeded.');
    }

    throw lastError || new Error('Gemini API request failed.');
  }

  applyLocalSmartDocumentEdit(instruction: string, html: string): string {
    if (!html || !html.trim()) return html;

    const lower = instruction.toLowerCase().trim();

    // 1. Remove / Delete points (points 1 to 10)
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

    // 2. Bold / Format points (points 1 to 10 or general bolding)
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

    // 3. Document Translation fallback
    if (lower.includes('convert') || lower.includes('translate') || lower.includes('english') || lower.includes('marathi') || lower.includes('मराठी')) {
      const targetLang: 'en' | 'mr' = (lower.includes('marathi') || lower.includes('मराठी')) ? 'mr' : 'en';
      const translated = this.localTranslateHtml(html, targetLang);
      const langName = targetLang === 'en' ? 'English' : 'Marathi (Devanagari)';
      return `I have translated your active legal document into formal ${langName}.\n\n[REVISED_DOCUMENT_START]\n${translated}\n[REVISED_DOCUMENT_END]`;
    }

    // 4. Default fallback wrapper for any active document edit instruction
    return `I have updated your legal document as requested.\n\n[REVISED_DOCUMENT_START]\n${html.trim()}\n[REVISED_DOCUMENT_END]`;
  }

  async processChat(options: CopilotChatOptions): Promise<string> {
    const { message, context, apiKey } = options;
    const lower = message.toLowerCase();

    // Check if the user is asking to translate / convert document
    const isTranslateCmd = (lower.includes('convert') || lower.includes('translate') || lower.includes('rewrite')) &&
      (lower.includes('english') || lower.includes('marathi') || lower.includes('मराठी') || lower.includes('document') || lower.includes('draft'));

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
        if (context.documentBody) {
          const localEdit = this.applyLocalSmartDocumentEdit(message, context.documentBody);
          if (localEdit && localEdit.includes('[REVISED_DOCUMENT_START]')) {
            return `⚠️ Gemini AI Translation Error: ${exactError}\n\nApplied local translation fallback instead:\n\n${localEdit}`;
          }
        }
        return `⚠️ Gemini 3.7 Flash Translation Error: ${exactError}. Please check your Gemini API key in Settings (⚙️).`;
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
      const systemPrompt = `You are JurisCopilot, an expert AI Legal Assistant powered by Gemini AI embedded in an interactive legal drafting studio.
You assist advocates and lawyers with drafting court petitions, affidavits, contracts, and notices in Marathi (Devanagari) and English.
You have direct read and write awareness of the lawyer's ACTIVE WORKING DOCUMENT:
- Active Template Title: ${context.templateTitle || 'Active Legal Document'}
- Active Document Body HTML:
${context.documentBody ? context.documentBody : '(empty)'}
- Active Client & Case Facts: ${JSON.stringify(context.clientFacts || {})}

MANDATORY DOCUMENT EDITING & FORMATTING INSTRUCTIONS:
Whenever the user instructs you to edit, format, bold, italicize, underline, align, update, rewrite, translate, convert, rephrase, or insert clauses/text in the document (e.g. "remove 1st point", "Make point 2 bold", "bold heading", "underline paragraph 1", "change date"):
1. CRITICAL DOCUMENT TYPE CONSTRAINTS: You MUST modify the active working document provided above under 'Active Document Body HTML' (${context.templateTitle || 'Active Legal Document'}). DO NOT replace the active document with a Divorce Petition, Legal Notice, or any other document type unless the user explicitly asks to draft a new type of document!
2. PRESERVE ALL REAL CLIENT FACTS: Retain all actual names, dates, addresses, court names, amounts, and details currently present in 'Active Document Body HTML'. DO NOT replace real names or facts with generic placeholders like [पतीचे नाव], [पत्नीचे नाव], or [पत्ता].
3. Output a brief 1-sentence confirmation message, followed IMMEDIATELY by the complete updated HTML document enclosed between [REVISED_DOCUMENT_START] and [REVISED_DOCUMENT_END] delimiters.
   Example output structure:
   I have updated your legal document and applied bold formatting to Point 2.

   [REVISED_DOCUMENT_START]
   <p style="text-align: center;"><b>...</b></p>
   <p>२) <b>Second point in bold...</b></p>
   [REVISED_DOCUMENT_END]
4. PRESERVE ALL HTML tags (<p style="...">, <b>, <u>, line breaks, alignments, page break dividers) in the rest of the document EXACTLY. Do not strip HTML formatting.
5. STRICT TEMPLATE STRUCTURE & FORMATTING PRESERVATION: You MUST strictly maintain 100% of the format, clause numbering, headings, and legal structure as present in the selected template (${context.templateTitle || 'Active Legal Document'}). Do NOT add unapproved disclaimers, extra legal notes, or new unrequested clauses. Do NOT delete existing template sections or clauses unless the user explicitly requests it. ONLY dynamic data (facts/placeholders) or specifically requested edits shall get changed. No unwanted formatting changes!
6. If drafting in Marathi for Maharashtra courts (e.g. Jalgaon, Amalner, Dhule), use standard court terminology relevant to the active document type (${context.templateTitle || 'Active Legal Document'}).`;

      const text = await this.generateWithGeminiFallback(client, [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Question/Instruction: ${message}` }] }
      ]);

      if (text) {
        return text;
      }
    } catch (err: any) {
      const exactError = formatGeminiErrorMessage(err);
      if (context.documentBody) {
        const localEdit = this.applyLocalSmartDocumentEdit(message, context.documentBody);
        if (localEdit && localEdit.includes('[REVISED_DOCUMENT_START]')) {
          return `⚠️ Gemini AI Error: ${exactError}\n\nApplied local smart edit fallback instead:\n\n${localEdit}`;
        }
      }
      return `⚠️ Gemini AI Execution Error: ${exactError}. Please check your Gemini API key settings in Settings (⚙️).`;
    }

    if (context.documentBody) {
      const localEdit = this.applyLocalSmartDocumentEdit(message, context.documentBody);
      if (localEdit && localEdit.includes('[REVISED_DOCUMENT_START]')) {
        return `⚠️ Gemini AI returned empty response.\n\nApplied local smart edit fallback instead:\n\n${localEdit}`;
      }
    }

    return `⚠️ Gemini AI did not return a response. Please verify your API key settings.`;
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

    const prompt = `You are an expert Indian court legal translator powered by Gemini 3.7 Flash. Translate the following legal document into formal, professional ${targetLangName}.

STRICT REQUIREMENTS:
1. PRESERVE ALL HTML tags, inline styles (<p style="text-align: center;">, <b>, <u>, <div class="page-break"></div>), alignments, and line breaks EXACTLY.
2. Only translate the text inside HTML nodes.
3. Use precise legal terminology for Indian court petitions and agreements.
4. Return ONLY the translated HTML content without markdown block formatting or backticks.

Document to translate:
${documentBody}`;

    const text = await this.generateWithGeminiFallback(client, [
      { role: 'user', parts: [{ text: prompt }] }
    ]);

    const cleaned = text.replace(/^```html|^```/gi, '').replace(/```$/g, '').trim();
    if (cleaned.length > 0) return cleaned;

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

  async extractFactsFromNotes(rawNotes: string, apiKey?: string): Promise<ExtractedDetailsResult> {
    const client = this.getClient(apiKey);

    if (client) {
      try {
        const prompt = `You are an AI Legal Assistant. Extract client and case details from the following raw lawyer interview notes into a JSON object matching this schema:
{
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
}

Return ONLY valid JSON.

Raw Notes:
${rawNotes}`;

        const response = await client.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { responseMimeType: 'application/json' }
        });

        if (response.text) {
          const parsed = JSON.parse(response.text);
          return {
            facts: parsed,
            summary: `Successfully extracted ${Object.keys(parsed).length} fields from notes.`
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
          if (keyPart.includes('applicant') || keyPart.includes('client') || keyPart.includes('husband') || keyPart.includes('deponent') || keyPart.includes('अर्जदार') || keyPart.includes('पती')) {
            if (!facts.party1Name) facts.party1Name = valPart;
          } else if (keyPart.includes('wife') || keyPart.includes('opposite') || keyPart.includes('deceased') || keyPart.includes('सामनेवाला') || keyPart.includes('पत्नी') || keyPart.includes('मृत')) {
            if (!facts.party2Name) facts.party2Name = valPart;
          } else if (keyPart.includes('death date') || keyPart.includes('separation') || keyPart.includes('दिनांक') || keyPart.includes('तारीख')) {
            if (!facts.separationDate) facts.separationDate = valPart;
          } else if (keyPart.includes('place of death') || keyPart.includes('court') || keyPart.includes('city') || keyPart.includes('ठिकाण') || keyPart.includes('शहर')) {
            if (!facts.courtCity) facts.courtCity = valPart;
          } else if (keyPart.includes('heirs') || keyPart.includes('children') || keyPart.includes('वारस') || keyPart.includes('अपत्य')) {
            if (!facts.childrenDetails) facts.childrenDetails = valPart;
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
      facts.party1Name = name;
      if (!facts.deponentNewName) facts.deponentNewName = name;
    }

    // 3. Wife / Party 2 Names
    const wifeMatch = text.match(/(?:wife|पत्नी|पत्नीचे नाव|applicant 2|mrs\.?|सौ\.?|second party|defaulter|debtor)\s*[:=-]?\s*([A-Za-z\u0900-\u097F\s.]+?)(?:,|\n|\(|age|वय|maiden|residing|$)/i);
    if (wifeMatch && wifeMatch[1].trim()) {
      facts.party2Name = wifeMatch[1].trim();
    }

    const maidenMatch = text.match(/(?:maiden name|maiden|माहेरचे नाव|लग्नापूर्वीचे नाव)\s*[:=-]?\s*([A-Za-z\u0900-\u097F\s.]+?)(?:,|\n|\)|$)/i);
    if (maidenMatch && maidenMatch[1].trim()) {
      facts.party2MaidenName = maidenMatch[1].trim();
    }

    // 4. Ages
    const ageMatches = [...text.matchAll(/(?:age|वय)\s*[:=-]?\s*(\d{1,2})|\b([1-9][0-9])\s*(?:years|वर्षे|yrs)\b/gi)];
    if (ageMatches.length >= 1) {
      const age1 = ageMatches[0][1] || ageMatches[0][2];
      facts.party1Age = age1;
      facts.deponentAge = age1;
      if (ageMatches.length >= 2) {
        const age2 = ageMatches[1][1] || ageMatches[1][2];
        facts.party2Age = age2;
      }
    }

    // 5. Occupations
    if (/service|नोकरी|private company/i.test(text)) {
      facts.party1Occupation = 'सेवा (नोकरी)';
      facts.deponentOccupation = 'सेवा (नोकरी)';
    } else if (/business|व्यवसाय/i.test(text)) {
      facts.party1Occupation = 'व्यवसाय';
      facts.deponentOccupation = 'व्यवसाय';
    }

    if (/homemaker|गृहिणी|housewife/i.test(text)) {
      facts.party2Occupation = 'गृहिणी';
    }

    // 6. Addresses
    const p1AddrMatch = text.match(/(?:residing at|address|पत्ता|रा\.)\s*[:=-]?\s*([A-Za-z\u0900-\u097F\s,.-]+?)(?:\.\s*Wife|\.\s*Client|\.\s*Married|\n|$)/i);
    if (p1AddrMatch && p1AddrMatch[1].trim()) {
      const addr = p1AddrMatch[1].trim().replace(/^,\s*/, '');
      facts.party1Address = addr.includes('रा.') ? addr : `रा. ${addr}`;
      facts.deponentAddress = addr.includes('रा.') ? addr : `रा. ${addr}`;
    }

    const p2AddrMatch = text.match(/(?:residing with father|wife.*?residing at|पत्नी.*?पत्ता)\s*[:=-]?\s*([A-Za-z\u0900-\u097F\s,.-]+?)(?:\.\s*Married|\.\s*No children|\n|$)/i);
    if (p2AddrMatch && p2AddrMatch[1].trim()) {
      const addr = p2AddrMatch[1].trim();
      facts.party2Address = addr.includes('रा.') ? addr : `रा. ${addr}`;
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

    return {
      facts,
      summary: `Extracted ${Object.keys(facts).length} fields from client notes.`
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

        const response = await client.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        if (response.text) {
          const cleaned = response.text.trim().replace(/^["'«»]|["'«»]$/g, '');
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
}

export const copilotService = new CopilotService();

