# JurisCopilot — AI Legal Document Drafting Studio

An intelligent legal document drafting application with an embedded **AI Copilot API** powered by **[CopilotKit](https://www.copilotkit.ai/)**, **Node.js + TypeScript**, and **React**.

Designed specifically for advocates, legal practitioners, and law firms to draft, redline, validate, and export court-compliant and corporate legal documents.

---

## 🏛️ Architecture & Two-Way CopilotKit Sync

Unlike traditional chatbots that require tedious copy-pasting, JurisCopilot uses a **two-way synchronization loop**:

1. **Frontend Context (`useCopilotReadable`)**:
   - The Copilot continuously observes whatever the lawyer is looking at: the active template, party names, marriage dates, separation duration, child custody terms, alimony amount, and compliance status.
2. **Frontend Actions (`useCopilotAction`)**:
   - **`updateDocumentBody`**: Visually mutates text inside the document editor directly in-place.
   - **`populateClientForm`**: Extracts entities from unstructured lawyer interview notes or WhatsApp messages and fills the input wizard automatically.
   - **`insertLegalClause`**: Directly appends or inserts tailored clauses (e.g., Alimony Waiver, Child Custody, High Court Compliance, Non-Compete).
   - **`selectTemplate`**: Switches active templates on demand.

---

## 📜 Pre-Configured Legal Templates

1. **Hindu Marriage Act Section 13B Mutual Consent Divorce Petition (मराठी & English)**
   - Formatted to Maharashtra court standards (Amalner, Jalgaon, Dhule, etc.).
   - Includes court header, party blocks with maiden name, Hindu rites marriage clause, mandatory **Non-Pregnancy assertion**, 1+ year separation statement, comprehensive settlement terms (custody, alimony, stridhan, waiver), Bombay High Court guidelines compliance, cause of action/jurisdiction, prayer, and signed verification **Affidavit (प्रतिज्ञालेख)**.
2. **Section 13B(2) 6-Month Period Waiver Application (कलम १३-ब (२) अंतर्गत ६ महिन्यांची मुदत माफ करणेबाबत अर्ज)**
   - Aligned with the Supreme Court benchmark ruling in _Amardeep Singh v. Harveen Kaur_.
3. **Mutual Non-Disclosure Agreement (NDA)**
   - Bilateral commercial confidentiality agreement with non-solicitation, term definitions, exclusions, and governing law.
4. **Legal Notice for Recovery of Dues / Contract Breach**
   - Advocate notice demanding outstanding debt payment within 15 days under CPC / NI Act.
5. **General Court Affidavit (प्रतिज्ञापत्र / प्रतिज्ञालेख)**
   - Devanagari legal affidavit under solemn oath for revenue, civil, or municipal authorities.

---

## 🚀 Quick Start

### 1. Prerequisites

- Node.js v18+ (tested on Node v26)
- npm v9+

### 2. Start Backend Server

```bash
cd server
npm run dev
```

The server runs on **http://localhost:4000** with endpoints:

- `POST /api/copilot`: CopilotKit runtime handler
- `GET /api/templates`: Legal template catalog
- `POST /api/documents/render`: Merges client facts into template text
- `POST /api/documents/export/docx`: Generates court-formatted Word `.docx` file
- `POST /api/copilot/extract`: Auto-extracts facts from unstructured notes

### 3. Start Frontend Client

```bash
cd client
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## ⚖️ Court-Ready Word (.docx) Export

Exported Word documents feature:

- 1-inch margins (with extra 1.5" gutter on the left for legal court filing/tagging).
- **Mangal / Mukta** Devanagari typography for Marathi court petitions.
- **Times New Roman** for English agreements.
- Formal signature blocks for Petitioners and Advocates.
