import { GoogleGenAI } from '@google/genai';

export interface FamilyTreeChild {
  name: string;
  prefix?: string;
  relation?: string;
  status?: string; // e.g. "मयत", "हयात", "अविवाहित मयत"
  subChildren?: FamilyTreeChild[];
}

export interface FamilyTreeBranch {
  head: string;
  headPrefix?: string;
  headStatus?: string;
  children: (string | FamilyTreeChild)[];
  subBranches?: FamilyTreeBranch[];
  notes?: string;
}

export interface FamilyTreeData {
  title?: string;
  branches: FamilyTreeBranch[];
}

export class FamilyTreeService {
  private getClient(customKey?: string): GoogleGenAI | null {
    const key = customKey || process.env.GEMINI_API_KEY;
    if (key && typeof key === 'string' && key.trim().length > 5 && key.trim() !== 'undefined' && key.trim() !== 'null') {
      return new GoogleGenAI({ apiKey: key.trim() });
    }
    return null;
  }

  /**
   * Generates a court-standard HTML representation of a family tree (वंशावृक्ष / वंशावळ)
   * that is 100% compatible with SplitView, Headless PDF, and DOCX export.
   */
  renderFamilyTreeHtml(input: FamilyTreeData | string): string {
    let data: FamilyTreeData;

    if (typeof input === 'string') {
      const trimmed = input.trim();
      // If already rendered HTML diagram, return directly without re-parsing
      if (
        trimmed.startsWith('<div') ||
        trimmed.startsWith('<table') ||
        trimmed.includes('family-tree-table') ||
        trimmed.includes('court-family-tree-container')
      ) {
        return trimmed;
      }
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.branches || Array.isArray(parsed)) {
          data = Array.isArray(parsed) ? { branches: parsed } : parsed;
        } else {
          data = this.parseTreeFromText(input);
        }
      } catch {
        data = this.parseTreeFromText(input);
      }
    } else {
      data = input;
    }

    if (!data || !data.branches || data.branches.length === 0) {
      return '';
    }

    const title = data.title || 'अर्जदार यांचा वंशावृक्ष/ वंशावळ';
    const htmlParts: string[] = [];

    // Header Title
    htmlParts.push(`
<p class="MsoNormal family-tree-title" align="center" style="text-align: center; margin-top: 14pt; margin-bottom: 12pt; line-height: 150%;">
  <u><b><span style="font-size: 14pt; font-family: 'Noto Sans Devanagari UI', 'Mangal', sans-serif;">${this.escapeHtml(title)}</span></b></u>
</p>`);

    // Render each branch
    for (const branch of data.branches) {
      htmlParts.push(this.renderBranchHtml(branch));
    }

    return `<div class="court-family-tree-container" style="margin: 12pt 0 18pt 0; text-align: center;">\n${htmlParts.join('\n')}\n</div>`;
  }

  private renderBranchHtml(branch: FamilyTreeBranch): string {
    const headText = branch.head || '';
    if (!headText.trim() && (!branch.children || branch.children.length === 0)) {
      return '';
    }

    const childrenList = (branch.children || []).map((c) => {
      if (typeof c === 'string') {
        return this.parseChildString(c);
      }
      return c;
    });

    let branchHtml = `
<div class="family-tree-branch" style="text-align: center; margin-bottom: 22pt; font-family: 'Noto Sans Devanagari UI', 'Mangal', sans-serif;">
  <p class="family-tree-head" align="center" style="text-align: center; font-weight: bold; font-size: 13pt; margin-bottom: 2pt; line-height: 140%;">
    <b>${this.escapeHtml(headText)}${branch.headStatus ? ` <span style="font-size: 11pt; font-weight: normal; color: #444;">(${this.escapeHtml(branch.headStatus)})</span>` : ''}</b>
  </p>
  <p class="family-tree-arrow" align="center" style="text-align: center; font-size: 13pt; margin: 0 0 2pt 0; line-height: 1; color: #333;">
    ↓
  </p>`;

    if (childrenList.length > 0) {
      const numCols = childrenList.length;
      const colWidthPercent = Math.max(10, Math.floor(100 / numCols));

      branchHtml += `
  <table class="family-tree-table" align="center" border="0" cellspacing="0" cellpadding="0" style="width: 95%; max-width: 750px; margin: 0 auto; border-collapse: collapse; text-align: center; border: none;">
    <tbody>
      <!-- Connector Bar Row -->
      <tr>
        ${childrenList.map((_, idx) => {
          let borderStyle = 'border-top: 2px solid #444;';
          if (numCols === 1) {
            borderStyle = '';
          } else if (idx === 0) {
            borderStyle = 'border-top: 2px solid #444; border-left: none;';
          } else if (idx === numCols - 1) {
            borderStyle = 'border-top: 2px solid #444; border-right: none;';
          }
          return `<td width="${colWidthPercent}%" style="width: ${colWidthPercent}%; padding: 0; height: 10px; ${borderStyle} text-align: center; vertical-align: top;">
            <div style="font-size: 11pt; line-height: 1; color: #444; margin-top: -1px;">↓</div>
          </td>`;
        }).join('')}
      </tr>
      <!-- Children Names Row -->
      <tr>
        ${childrenList.map((child) => `
          <td width="${colWidthPercent}%" style="width: ${colWidthPercent}%; padding: 4pt 4pt; text-align: center; vertical-align: top; font-size: 12pt; line-height: 130%;">
            <b>${this.escapeHtml(child.name)}</b>
            ${child.relation ? `<div style="font-size: 10.5pt; font-weight: normal; color: #333;">${this.escapeHtml(child.relation)}</div>` : ''}
            ${child.status ? `<div style="font-size: 10pt; font-weight: normal; color: #666;">(${this.escapeHtml(child.status)})</div>` : ''}
          </td>
        `).join('')}
      </tr>
    </tbody>
  </table>`;
    }

    branchHtml += `\n</div>`;

    // Render nested sub-branches if any
    if (branch.subBranches && branch.subBranches.length > 0) {
      for (const sub of branch.subBranches) {
        branchHtml += '\n' + this.renderBranchHtml(sub);
      }
    }

    return branchHtml;
  }

  /**
   * Parses string like "सौ. सुनिता (पत्नी)" or "B-विष्णू (अविवाहित मयत)" into FamilyTreeChild object.
   */
  private parseChildString(raw: string): FamilyTreeChild {
    const s = raw.trim();
    const match = /^(.*?)\s*\((.*?)\)$/.exec(s);
    if (match) {
      const name = match[1].trim();
      const paren = match[2].trim();
      const isStatus = paren.includes('मयत') || paren.includes('हयात') || paren.includes('नाहीत');
      return {
        name,
        relation: isStatus ? undefined : paren,
        status: isStatus ? paren : undefined,
      };
    }
    return { name: s };
  }

  /**
   * Generates a structured family tree using Gemini AI from lawyer's input notes/facts.
   * Handles complex multi-generational Marathi narrative text.
   */
  async generateWithAi(
    input: string | Record<string, any>,
    apiKey?: string
  ): Promise<{ treeData: FamilyTreeData; html: string; summary: string }> {
    const client = this.getClient(apiKey);
    const rawText = typeof input === 'string' ? input : JSON.stringify(input, null, 2);

    if (client) {
      try {
        const prompt = `You are an expert Maharashtra Court Legal Document Drafter. Analyze the following Marathi legal narrative about a deceased person's family and heirs, then construct a complete, multi-generational Family Tree (वंशावृक्ष / वंशावळ) in strict JSON format.

JSON OUTPUT SCHEMA (strict):
{
  "title": "अर्जदार यांचा वंशावृक्ष/ वंशावळ",
  "branches": [
    {
      "head": "कै. [मूळ पुरुष पूर्ण नाव]",
      "headStatus": "मयत",
      "children": [
        { "name": "[पत्नी नाव]", "relation": "पत्नी", "status": "मयत/हयात" },
        { "name": "कै. [पुत्र नाव]", "relation": "मुलगा", "status": "मयत" },
        { "name": "[जिवंत पुत्र]", "relation": "मुलगा", "status": "हयात" },
        { "name": "[मुलगी नाव]", "relation": "मुलगी", "status": "हयात" }
      ]
    },
    {
      "head": "कै. [मयत मुलाचे नाव] यांचे वारस",
      "headStatus": "मयत",
      "children": [
        { "name": "[पत्नी]", "relation": "पत्नी", "status": "हयात" },
        { "name": "[नातू]", "relation": "मुलगा", "status": "अल्पवयीन" }
      ]
    }
  ]
}

RULES (follow strictly):
1. Branch 1 = ROOT ANCESTOR (मूळ पुरुष / मयत आजोबा/आजी) with ALL direct children (sons + daughters) + spouse.
2. For every DECEASED son/daughter who has surviving heirs => create a SEPARATE branch for their heirs.
3. For living sons/daughters who have children mentioned as heirs => create a branch.
4. अविवाहित मयत (unmarried deceased) persons: headStatus = "अविवाहित मयत", children = [{name: "वारस नाहीत", status: "अविवाहित व निःसंतान मयत"}].
5. Include ages if mentioned, using Marathi numerals (e.g. वय ३८).
6. Use कै. prefix for ALL deceased persons in name field.
7. Use Marathi Devanagari text throughout.
8. Minor children (अल्पवयीन): add "अल्पवयीन" in status.
9. Married daughters: include in root branch with married surname if known.
10. Return ONLY valid JSON. No markdown. No explanations. No extra text.

INPUT NARRATIVE:
${rawText}`;

        const modelsToTry = [
          'gemini-3.8-flash',
          'gemini-3.7-flash',
          'gemini-3.6-flash',
          'gemini-3.1-flash-lite',
        ];

        let textOutput = '';
        for (const model of modelsToTry) {
          try {
            const response = await client.models.generateContent({
              model,
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              config: {
                maxOutputTokens: 8192,
                temperature: 0.1,
                responseMimeType: 'application/json',
              },
            });
            if (response.text && response.text.trim()) {
              textOutput = response.text.trim();
              break;
            }
          } catch (modelErr: any) {
            console.warn(`⚠️ Gemini AI Family Tree model ${model} failed, trying next:`, modelErr?.message);
          }
        }
        const cleanedJson = textOutput.replace(/```json/gi, '').replace(/```/g, '').trim();

        let treeData: FamilyTreeData;
        try {
          treeData = JSON.parse(cleanedJson);
        } catch {
          // Try to extract JSON object from response if extra text wrapped around it
          const jsonMatch = /\{[\s\S]*\}/.exec(cleanedJson);
          if (jsonMatch) {
            treeData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('Invalid JSON response from AI');
          }
        }

        if (!treeData.branches || treeData.branches.length === 0) {
          throw new Error('Empty branches in AI response');
        }

        const html = this.renderFamilyTreeHtml(treeData);
        const summary = `वंशावळ यशस्वीरित्या तयार करण्यात आली (${treeData.branches.length} शाखा).`;

        return { treeData, html, summary };
      } catch (err: any) {
        console.warn('⚠️ Gemini AI Family Tree generation failed, using fallback parser:', err.message);
      }
    }

    // Fallback: Rule-based generation from facts/notes
    const fallbackTree = typeof input === 'object'
      ? this.generateFallbackFromFacts(input)
      : this.parseMarathiNarrative(rawText);

    const html = this.renderFamilyTreeHtml(fallbackTree);
    return {
      treeData: fallbackTree,
      html,
      summary: `वंशावळ तयार करण्यात आली (${fallbackTree.branches.length} शाखा).`,
    };
  }

  /**
   * Intelligently constructs a family tree from structured client facts (e.g. deceased + heirs).
   */
  generateFallbackFromFacts(facts: Record<string, any>): FamilyTreeData {
    const deceased = facts.deceasedName || facts.party1Name || 'मूळ पुरुष / मयत';
    const children: FamilyTreeChild[] = [];

    // Extract heirs / parties 1 to 10
    for (let i = 1; i <= 10; i++) {
      const name = facts[`party${i}Name`] || facts[`applicant${i}Name`] || facts[`heir${i}Name`] || facts[`वारस${i}`];
      if (name && typeof name === 'string' && name.trim().length > 1 && !name.includes('____') && !name.includes('नाव')) {
        const relation = facts[`relation${i}`] || facts[`party${i}Relation`] || '';
        const age = facts[`party${i}Age`] ? `${facts[`party${i}Age`]} वर्षे` : '';
        const status = facts[`party${i}Status`] || '';
        children.push({
          name: name.trim(),
          relation: [relation, age].filter(Boolean).join(' - '),
          status,
        });
      }
    }

    const branches: FamilyTreeBranch[] = [
      {
        head: deceased.includes('मयत') ? deceased : `${deceased} (मयत)`,
        children: children.length > 0 ? children : [{ name: 'वारसदार माहिती उपलब्ध नाही' }],
      },
    ];

    return {
      title: 'अर्जदार यांचा वंशावृक्ष/ वंशावळ',
      branches,
    };
  }

  /**
   * Parses complex Marathi prose narrative about a family into FamilyTreeData.
   * Handles multi-generational descriptions with deaths, ages, spouses, children.
   */
  private parseSectionedNarrative(text: string): FamilyTreeData | null {
    if (!/^\s*शाखा\s*\d+\s*[:：]/m.test(text)) return null;

    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const branches: FamilyTreeBranch[] = [];
    let root: FamilyTreeBranch | null = null;
    let currentBranch: FamilyTreeBranch | null = null;
    let targetBranch: FamilyTreeBranch | null = null;

    const parseHead = (value: string): { name: string; status?: string } => {
      let name = value.trim();
      let status: string | undefined;
      const annotation = /\s*\(([^()]*)\)\s*$/.exec(name);
      if (annotation) {
        if (/अविवाहित|निःसंतान/.test(annotation[1])) status = 'अविवाहित मयत';
        else if (/मयत/.test(annotation[1])) status = 'मयत';
        name = name.slice(0, annotation.index).trim();
      }
      const statusSuffix = /\s+(अविवाहित\s+मयत|निःसंतान\s+मयत|मयत)\s*$/.exec(name);
      if (statusSuffix) {
        status = /अविवाहित|निःसंतान/.test(statusSuffix[1]) ? 'अविवाहित मयत' : 'मयत';
        name = name.slice(0, statusSuffix.index).trim();
      }
      return { name, status };
    };

    const parseChild = (value: string): FamilyTreeChild | null => {
      const raw = value.trim().replace(/^[•*\-]\s*/, '').trim();
      if (!raw || /^(?:मुले|मुली)\s*[-:]\s*(?:नाहीत|नाही)/.test(raw)) return null;
      const spouse = /^(पती|पत्नी)\s*[-:]\s*(.+)$/.exec(raw);
      if (spouse) return { name: spouse[2].trim().replace(/[.।]+$/, ''), relation: spouse[1] };

      const child = this.parseChildString(raw);
      child.name = child.name.replace(/[.।]+$/, '');
      return child;
    };

    const addChildren = (branch: FamilyTreeBranch, raw: string) => {
      for (const part of raw.split(/[,;]|\s+व\s+/)) {
        const child = parseChild(part);
        if (child) branch.children.push(child);
      }
    };

    for (const line of lines) {
      const section = /^शाखा\s*\d+\s*[:：]\s*(.*)$/i.exec(line);
      if (section) {
        const parsedHead = parseHead(section[1]);
        if (!parsedHead.name) continue;
        currentBranch = {
          head: parsedHead.name,
          headStatus: parsedHead.status,
          children: [],
        };
        branches.push(currentBranch);
        targetBranch = currentBranch;
        continue;
      }

      const heirs = /^वारसदार\s*[:：]\s*(.*)$/i.exec(line);
      if (heirs && targetBranch) {
        addChildren(targetBranch, heirs[1]);
        continue;
      }

      if (/^(?:वंशावळ|वंशावृक्ष|मुले\s+व\s+मुली|मुले|मुली)\s*[:：]?\s*$/.test(line)) {
        continue;
      }

      if (!root) {
        const parsedRoot = parseHead(line);
        root = {
          head: parsedRoot.name,
          headStatus: parsedRoot.status,
          children: [],
        };
        branches.unshift(root);
        targetBranch = root;
        continue;
      }

      if (!targetBranch) continue;
      const child = parseChild(line);
      if (child) targetBranch.children.push(child);
    }

    if (currentBranch?.headStatus === 'अविवाहित मयत' && currentBranch.children.length === 0) {
      currentBranch.children.push({ name: 'वारस नाहीत', status: 'अविवाहित व निःसंतान मयत' });
    }

    return root ? { title: 'अर्जदार यांचा वंशावृक्ष/ वंशावळ', branches } : null;
  }

  parseMarathiNarrative(text: string): FamilyTreeData {
    if (!text || !text.trim()) {
      return { title: 'अर्जदार यांचा वंशावृक्ष/ वंशावळ', branches: [] };
    }

    const sectionedTree = this.parseSectionedNarrative(text);
    if (sectionedTree) return sectionedTree;

    const branches: FamilyTreeBranch[] = [];
    const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(Boolean);
    const fullText = paragraphs.join(' ');

    // ── STEP 1: Identify root ancestor and direct children ──
    let rootName = '';
    let rootChildren: FamilyTreeChild[] = [];

    // Find root कै. person (first mention)
    const kaiMatch = /(?:कै\.|कै)\s+([^\s,]+(?:\s+[^\s,]+){1,4})/.exec(fullText);
    if (kaiMatch) {
      rootName = 'कै. ' + kaiMatch[1].trim();
    }

    // Extract spouse of root (आजी / पत्नी in first paragraph)
    if (rootName && paragraphs[0]) {
      const spouseMatch = /(?:आजी|पत्नी)\s+([^\s,]+(?:\s+[^\s,]+){1,3})/.exec(paragraphs[0]);
      if (spouseMatch) {
        const spouseName = spouseMatch[1].trim();
        const isMayat = fullText.includes(spouseName) && /मयत/.test(fullText.substring(fullText.indexOf(spouseName), fullText.indexOf(spouseName) + 100));
        rootChildren.push({ name: isMayat ? `कै. ${spouseName}` : spouseName, relation: 'पत्नी', status: isMayat ? 'मयत' : 'हयात' });
      }
    }

    // Extract sons listed in root paragraph: "रमेश, वसंत, नीलेश, सुभाष ही चार मुले"
    const sonsM = /([\u0900-\u097F]+(?:,\s*[\u0900-\u097F]+)+)\s+ही(?:\s+\w+)?\s+मुले/.exec(fullText)
               || /मुले:\s*([\u0900-\u097F]+(?:,\s*[\u0900-\u097F]+)+)/.exec(fullText);
    if (sonsM) {
      const sonNames = sonsM[1].split(/,\s*/).map(s => s.trim()).filter(Boolean);
      for (const son of sonNames) {
        const isMayat = new RegExp(son + '[^।\n]{0,30}मयत').test(fullText);
        rootChildren.push({
          name: isMayat ? `कै. ${son}` : son,
          relation: 'मुलगा',
          status: isMayat ? 'मयत' : 'हयात',
        });
      }
    }

    // Extract daughters: "मीनाबाई व आशाबाई या दोन मुली"
    const dauM = /([\u0900-\u097F]+(?:\s+व\s+[\u0900-\u097F]+|,\s*[\u0900-\u097F]+)*)\s+(?:या|ह्या)(?:\s+\w+)?\s+मुली/.exec(fullText)
              || /मुली:\s*([\u0900-\u097F]+(?:,\s*[\u0900-\u097F]+)+)/.exec(fullText);
    if (dauM) {
      const dauNames = dauM[1].split(/\s+व\s+|,\s*/).map(s => s.trim()).filter(Boolean);
      for (const dau of dauNames) {
        rootChildren.push({ name: dau, relation: 'मुलगी', status: 'हयात' });
      }
    }

    if (rootName && rootChildren.length > 0) {
      branches.push({ head: rootName, headStatus: 'मयत', children: rootChildren });
    }

    // ── STEP 2: Per-paragraph heir branch extraction ──
    const processedPersons = new Set<string>();
    if (rootName) processedPersons.add(rootName);

    for (const para of paragraphs) {
      // Skip root ancestor paragraph
      if (rootName && para.includes(kaiMatch![1])) continue;

      // Check for अविवाहित मयत
      const personMatch = /(?:कै\.|कै)\s+([^\s,]+(?:\s+[^\s,]+){1,4})/i.exec(para);
      if (!personMatch) continue;

      const personNameRaw = personMatch[1].trim();
      const personName = 'कै. ' + personNameRaw;
      if (processedPersons.has(personName)) continue;
      processedPersons.add(personName);

      const isAvivahit = /अविवाहित|निःसंतान/.test(para);
      if (isAvivahit) {
        branches.push({
          head: personName,
          headStatus: 'अविवाहित मयत',
          children: [{ name: 'वारस नाहीत', status: 'अविवाहित व निःसंतान मयत' }],
        });
        continue;
      }

      const heirChildren: FamilyTreeChild[] = [];

      // Wife
      const wifeM = /पत्नी\s+([\u0900-\u097F]+(?:\s+[\u0900-\u097F]+){0,3})(?:\s+\(वय\s*([\d\u0966-\u096F]+)[^)]*\))?/.exec(para);
      if (wifeM) {
        const wifeName = wifeM[1].trim();
        const wifeAge = wifeM[2] ? `वय ${wifeM[2]}` : '';
        const afterWife = para.substring(para.indexOf(wifeName));
        const wifeStatus = /मयत/.test(afterWife.substring(0, 60)) ? 'मयत' : 'हयात';
        heirChildren.push({ name: wifeName, relation: 'पत्नी', status: [wifeStatus, wifeAge].filter(Boolean).join(', ') });
      }

      // Sons
      const sonMatcher = /(?:मुलगा|पुत्र)\s+(?:कै\.\s*)?([\u0900-\u097F]+(?:\s+[\u0900-\u097F]+){0,3})(?:\s+\(वय\s*([\d\u0966-\u096F]+)[^)]*\))?/gi;
      for (const m of para.matchAll(sonMatcher)) {
        const sonNameRaw = m[1].trim();
        const sonAge = m[2] ? `वय ${m[2]}` : '';
        const pos = para.indexOf(sonNameRaw);
        const isMayat = pos > 0 && /कै\./.test(para.substring(Math.max(0, pos - 6), pos + 2));
        heirChildren.push({
          name: isMayat ? `कै. ${sonNameRaw}` : sonNameRaw,
          relation: 'मुलगा',
          status: [isMayat ? 'मयत' : 'हयात', sonAge].filter(Boolean).join(', '),
        });
      }

      // Daughters
      const dauMatcher = /(?:मुलगी|कन्या)\s+([\u0900-\u097F]+(?:\s+[\u0900-\u097F]+){0,3})(?:\s+\(वय\s*([\d\u0966-\u096F]+)[^)]*\))?/gi;
      for (const m of para.matchAll(dauMatcher)) {
        const dauName = m[1].trim();
        const dauAge = m[2] ? `वय ${m[2]}` : '';
        heirChildren.push({ name: dauName, relation: 'मुलगी', status: ['हयात', dauAge].filter(Boolean).join(', ') });
      }

      if (heirChildren.length > 0) {
        branches.push({
          head: `${personName} यांचे वारस`,
          headStatus: 'मयत',
          children: heirChildren,
        });
      }
    }

    // If no branches at all, fall back to simple text parser
    if (branches.length === 0) {
      return this.parseTreeFromText(text);
    }

    return { title: 'अर्जदार यांचा वंशावृक्ष/ वंशावळ', branches };
  }

  /**
   * Parses simple text hierarchy / bulleted list / inline text into FamilyTreeData.
   */
  parseTreeFromText(text: string): FamilyTreeData {
    if (!text || !text.trim()) {
      return { title: 'अर्जदार यांचा वंशावृक्ष/ वंशावळ', branches: [] };
    }

    const raw = text.trim();

    // Check for inline single-sentence format:
    // e.g. "A) धर्मेंद्र विजय महाजन (मयत) - वारसदार: सौ. सुनिता (पत्नी), राहुल (मुलगा), स्नेहल (मुलगी), सौ. शांताबाई (आई)"
    // or "धर्मेंद्र महाजन (मयत): सुनिता (पत्नी), राहुल (मुलगा)"
    const inlineMatch = /^(.*?)\s*(?:[-–—]\s*(?:वारसदार|वारस|मुले|मुली|अपत्ये)?\s*:|:\s*)(.*)$/i.exec(raw);
    if (inlineMatch && !raw.includes('\n')) {
      const head = inlineMatch[1].trim();
      const childrenStr = inlineMatch[2].trim();
      const rawChildren = childrenStr.split(/[,;\n]|(?:\s+व\s+)|\band\b/).map(c => c.trim()).filter(Boolean);
      const children = rawChildren.map(c => this.parseChildString(c));
      return {
        title: 'अर्जदार यांचा वंशावृक्ष/ वंशावळ',
        branches: [
          {
            head,
            children: children.length > 0 ? children : [{ name: childrenStr }],
          }
        ],
      };
    }

    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const branches: FamilyTreeBranch[] = [];
    let currentBranch: FamilyTreeBranch | null = null;

    for (const line of lines) {
      if (line.includes('वंशावळ') || line.includes('वंशावृक्ष')) {
        continue;
      }

      // Check if line is an inline branch with children: e.g. "शाखा 1: B-विष्णू - वारस: ब्रह्मा., लक्ष्मीबाई."
      const lineInline = /^(.*?)\s*(?:[-–—]\s*(?:वारसदार|वारस|मुले|मुली|अपत्ये)?\s*:|:\s*)(.+)$/i.exec(line);
      if (lineInline && lineInline[2].includes(',')) {
        if (currentBranch && currentBranch.children.length > 0) {
          branches.push(currentBranch);
          currentBranch = null;
        }
        const bHead = lineInline[1].replace(/^(?:शाखा\s*\d+\s*[:\-]?\s*)/i, '').trim();
        const bChildren = lineInline[2].split(/[,;\n]|(?:\s+व\s+)|\band\b/).map(c => c.trim()).filter(Boolean).map(c => this.parseChildString(c));
        branches.push({
          head: bHead,
          children: bChildren,
        });
        continue;
      }

      // Branch head lines (e.g. "A) राघो मोतीराम महाजन" or "C-काशीराम." or lines with ":" or headers)
      const isHead = /^[A-Z0-9]+[\)\.\-]\s*|^[०-९\d]+[\)\.\-]\s*|:$/.test(line) || (!line.startsWith('-') && !line.startsWith('•') && !line.startsWith('*') && !currentBranch);

      if (isHead && !line.startsWith('-') && !line.startsWith('•') && !line.startsWith('*')) {
        if (currentBranch && currentBranch.children.length > 0) {
          branches.push(currentBranch);
        }
        currentBranch = {
          head: line.replace(/:$/, '').trim(),
          children: [],
        };
      } else if (currentBranch) {
        // Child item
        const childName = line.replace(/^[\-\*•\d\.\)]+\s*/, '').trim();
        if (childName) {
          currentBranch.children.push(this.parseChildString(childName));
        }
      } else {
        currentBranch = {
          head: line.trim(),
          children: [],
        };
      }
    }

    if (currentBranch) {
      branches.push(currentBranch);
    }

    if (branches.length === 0 && lines.length > 0) {
      branches.push({
        head: lines[0],
        children: lines.slice(1).map(name => this.parseChildString(name)),
      });
    }

    return {
      title: 'अर्जदार यांचा वंशावृक्ष/ वंशावळ',
      branches,
    };
  }

  private escapeHtml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

export const familyTreeService = new FamilyTreeService();
