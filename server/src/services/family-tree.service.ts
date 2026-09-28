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
      try {
        const parsed = JSON.parse(input);
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

    return `<div class="court-family-tree-container" style="margin: 12pt 0 16pt 0; text-align: center;">\n${htmlParts.join('\n')}\n</div>`;
  }

  private renderBranchHtml(branch: FamilyTreeBranch): string {
    const headText = branch.head || '';
    if (!headText.trim() && (!branch.children || branch.children.length === 0)) {
      return '';
    }

    const childrenList = (branch.children || []).map((c) => {
      if (typeof c === 'string') return { name: c };
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
      const colWidthPercent = Math.max(12, Math.floor(100 / numCols));

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
   * Generates a structured family tree using Gemini AI from lawyer's input notes/facts.
   */
  async generateWithAi(
    input: string | Record<string, any>,
    apiKey?: string
  ): Promise<{ treeData: FamilyTreeData; html: string; summary: string }> {
    const client = this.getClient(apiKey);
    const rawText = typeof input === 'string' ? input : JSON.stringify(input, null, 2);

    if (client) {
      try {
        const prompt = `You are an expert AI Legal Drafter for Maharashtra Courts. 
Analyze the provided lawyer's case notes, legal heirs list, or family relations narrative, and construct a complete, authentic Maharashtra Court Family Tree (वंशावृक्ष / वंशावळ) hierarchy in JSON format.

Output JSON Schema strictly matching:
{
  "title": "अर्जदार यांचा वंशावृक्ष/ वंशावळ",
  "branches": [
    {
      "head": "A) [Root Ancestor/Deceased Name, e.g. राघो मोतीराम महाजन]",
      "headStatus": "optional status, e.g. मयत",
      "children": [
        { "name": "ब्रह्मा.", "relation": "मुलगा/मुलगी/पत्नी optional", "status": "हयात/मयत optional" },
        { "name": "B-विष्णू", "relation": "", "status": "अविवाहित मयत" },
        { "name": "लक्ष्मीबाई.", "relation": "", "status": "" },
        { "name": "C-काशीराम.", "relation": "", "status": "" },
        { "name": "D-जीवराम.", "relation": "", "status": "" },
        { "name": "E-जसूबाई", "relation": "", "status": "" }
      ]
    },
    {
      "head": "B-विष्णू अविवाहित मयत",
      "children": [
        { "name": "ब्रह्मा." },
        { "name": "लक्ष्मीबाई." },
        { "name": "C-काशीराम." },
        { "name": "D-जीवराम." },
        { "name": "E-जसूबाई" }
      ]
    },
    {
      "head": "C-काशीराम.",
      "children": [
        { "name": "मधुकर." },
        { "name": "लखीचंद." },
        { "name": "सुमनबाई." },
        { "name": "नर्मदाबाई." },
        { "name": "साहूबाई" }
      ]
    }
  ]
}

Rules:
1. Extract all generations and family branches accurately from the notes (Ancestor, Sons, Daughters, Spouses, Heirs, Grandchildren).
2. If any person is unmarried deceased ("अविवाहित मयत") or deceased ("मयत"), reflect it in their branch head or status.
3. Use Marathi Devanagari text. Keep prefixes like A), B-, C), 1), 2) if present in notes.
4. Return ONLY valid JSON.

Lawyer's Notes / Family Details:
${rawText}`;

        const response = await client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ text: prompt }],
          config: {
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          },
        });

        const textOutput = response.text || '';
        const cleanedJson = textOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
        const treeData: FamilyTreeData = JSON.parse(cleanedJson);

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
      : this.parseTreeFromText(rawText);

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
   * Parses simple text hierarchy / bulleted list into FamilyTreeData.
   */
  parseTreeFromText(text: string): FamilyTreeData {
    if (!text || !text.trim()) {
      return { title: 'अर्जदार यांचा वंशावृक्ष/ वंशावळ', branches: [] };
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const branches: FamilyTreeBranch[] = [];
    let currentBranch: FamilyTreeBranch | null = null;

    for (const line of lines) {
      if (line.includes('वंशावळ') || line.includes('वंशावृक्ष')) {
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
          currentBranch.children.push({ name: childName });
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
        children: lines.slice(1).map(name => ({ name })),
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
