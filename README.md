# LegalAssist

LegalAssist is a full-stack legal drafting workspace for advocates and legal teams. It combines a React front end with a Node/Express API to help users generate, review, export, and customize legal documents with AI assistance.

The app is designed around Indian legal drafting workflows, especially Marathi and English petitions, affidavits, and commercial documents.

## Overview

- Draft legal documents from reusable templates
- Fill client facts through guided forms or raw interview notes
- Review statutory compliance and legal language suggestions
- Translate between Marathi and English
- Export clean Word documents for filing or circulation
- Save draft work and manage custom templates

## Tech Stack

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + TypeScript
- AI: Google Gemini via the official GenAI SDK
- Export: DOCX generation with the docx library
- UI: CopilotKit sidebar integration for legal drafting assistance

## Project Structure

```text
.
├── client/                  # Vite React app
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── server/                 # Express + TypeScript API
│   ├── src/
│   ├── assets/
│   └── package.json
├── data/                   # template and schema data
├── package.json            # root scripts
├── README.md
├── vercel.json
└── .gitignore
```

## Architecture

LegalAssist follows a simple three-layer architecture:

1. Frontend workspace
   - The React app in the `client` folder provides the editor, template panel, client data forms, and AI sidebar.
   - The main shell is managed by `client/src/App.tsx`, which injects the Copilot sidebar and keeps the legal drafting UI connected to the backend.
   - This layer is responsible for form capture, document editing, export actions, and user interactions.

2. Backend API layer
   - The Express server in `server/src/index.ts` exposes routes for templates, rendering, AI generation, translation, compliance checks, export, and draft storage.
   - It acts as the central integration point between the UI and AI services.
   - Requests are processed with Gemini-powered legal assistance, template merging logic, and DOCX export generation.

3. Domain/data layer
   - Templates and legal content are stored in `server/src/services` and `data/`.
   - This layer handles template retrieval, draft persistence, custom-template management, compliance logic, and export/document formatting.
   - It keeps the app modular so the UI does not need to know anything about every legal rule or export implementation.

### Runtime flow

- The user opens a legal template in the editor.
- The client loads template metadata and client facts from state and saved drafts.
- The server merges facts into the template and runs compliance checks.
- Gemini-powered endpoints can rewrite clause text, translate, extract facts, or suggest edits.
- The document is exported as a DOCX file or saved as a draft for later use.

## Key Files and Their Purpose

### Root files

- `package.json` — root scripts for installing and starting both frontend and backend projects.
- `vercel.json` — deployment configuration for hosting the app on Vercel.
- `README.md` — project documentation and local setup guide.

### Client application

- `client/src/App.tsx` — top-level app entry, theme management, Copilot sidebar setup, and right-pane AI layout.
- `client/src/main.tsx` — bootstraps the React application.
- `client/src/types.ts` — shared TypeScript definitions used across the frontend.
- `client/src/index.css` — global styles and Tailwind base styling.

### Client components

- `client/src/components/LegalWorkspace.tsx` — main legal drafting workspace; orchestrates template selection, form inputs, document preview, and AI actions.
- `client/src/components/LexicalEditor.tsx` — rich text editing area for legal drafting and content manipulation.
- `client/src/components/TipTapEditor.tsx` — alternative editor implementation using TipTap for rich document editing.
- `client/src/components/TemplateEditorModal.tsx` — editor for customizing or creating legal template content.
- `client/src/components/TemplateManagerModal.tsx` — manages built-in and custom templates.
- `client/src/components/FormWizardModal.tsx` — step-based guided collection of case or client facts.
- `client/src/components/ClientNotesModal.tsx` — allows users to paste raw notes and extract structured facts.
- `client/src/components/FamilyTreeModal.tsx` — interface for generating or viewing family-tree style legal information.
- `client/src/components/SettingsModal.tsx` — stores API configuration and runtime preferences such as the Gemini key.
- `client/src/components/TipTapCopilotExtension.ts` — Copilot-related editor extension logic integrated into the TipTap editor.

### Client utilities

- `client/src/utils/date.ts` — date formatting and helper logic used across legal workflows.
- `client/src/utils/keyValueParser.ts` — parses key/value data used in templates or fact extraction.
- `client/src/utils/templateQuestionnaires.ts` — questionnaire definitions for guided legal forms.
- `client/src/utils/transliterate.ts` — transliteration utilities for Marathi/Devanagari workflows.

### Server entry and app setup

- `server/src/index.ts` — main Express application. Defines all REST routes, AI endpoints, Copilot runtime routes, and the HTTP server startup logic.

### Server services

- `server/src/services/copilot.service.ts` — main AI orchestration layer for Gemini-based chat, document generation, translation, clause drafting, legal audits, and fact extraction.
- `server/src/services/template.service.ts` — loads template definitions, merges facts into templates, and performs legal compliance checks.
- `server/src/services/export.service.ts` — generates downloadable DOCX output and formats content for court/legal document export.
- `server/src/services/draft-store.service.ts` — saves and loads user drafts and document history.
- `server/src/services/template-store.service.ts` — manages custom template persistence and storage.
- `server/src/services/supabase.service.ts` — integration with Supabase for data persistence or storage workflows.
- `server/src/services/family-tree.service.ts` — handles family tree-related data generation and processing.
- `server/src/services/telegram.service.ts` — Telegram bot setup and webhook handling for messaging or automation.

### Server type definitions and assets

- `server/src/types/index.ts` — shared server-side TypeScript interfaces and legal-domain types.
- `server/src/assets/fonts/embedded-fonts.ts` — bundled font definitions for legal document rendering/export.
- `server/assets/fonts/` — static fonts used by the server for document styling.

### Data folder

- `data/custom-drafts.json` — saved draft data in JSON format.
- `data/custom-templates.json` — custom template definitions and template metadata.
- `data/template-pdfs/` — reference PDFs for templates used in preview or validation flows.
- `data/supabase_schema.sql` — database schema for Supabase-backed data storage.
- `data/telegram-config.json` — bot configuration for Telegram integration.

## Main Features

### Legal templates

The application includes built-in legal templates, including:

- Mutual consent divorce petition under Section 13B
- Section 13B waiver application
- General affidavit / sworn declaration
- NDA / confidentiality agreement
- Recovery notice / legal demand notice

### AI-assisted drafting

- Generate or refine clause text from prompts
- Check grammar and legal drafting quality
- Audit statutory compliance against the selected template
- Suggest follow-up legal actions and clauses
- Extract facts from unstructured notes or WhatsApp-style inputs

### Document workflow

- Merge template placeholders with fact data
- Preview rendered legal text
- Export to DOCX format with court-friendly formatting
- Manage custom templates and saved drafts

### Special support for Marathi legal drafting

- Devanagari-friendly text handling
- Transliteration support for Marathi drafting
- Court petition formatting tuned for Indian legal language workflows

## Prerequisites

- Node.js 18+
- npm 9+
- A Gemini API key from Google AI Studio

## Setup

### 1. Install dependencies

From the project root:

```bash
npm run install:all
```

### 2. Configure environment

Create a `.env` file inside the `server` folder:

```env
PORT=4000
GEMINI_API_KEY=your_gemini_api_key_here
```

You can also enter the API key in the Settings modal in the app UI.

### 3. Start the app

Run the backend:

```bash
npm run dev:server
```

Run the frontend in a second terminal:

```bash
npm run dev:client
```

Then open:

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000

## Useful API Endpoints

The server exposes a number of endpoints for templates, rendering, drafts, and AI features:

- `GET /api/health` — backend health check
- `GET /api/templates` — list available templates
- `GET /api/templates/:id` — get one template
- `POST /api/documents/render` — fill template placeholders with facts
- `POST /api/documents/audit` — compliance audit check
- `POST /api/documents/export/docx` — generate a DOCX file
- `GET /api/drafts` / `POST /api/drafts` — save and list drafts
- `POST /api/copilot/extract` — extract legal facts from raw notes
- `POST /api/copilot/generate-from-prompt` — generate draft text from prompt
- `POST /api/copilot/translate` — translate document text
- `POST /api/copilot/grammar` — grammar/legal language review
- `POST /api/copilot/draft-clause` — create clause text

## Notes for Local Development

- The frontend stores the Gemini key in browser local storage for convenience.
- The backend reads `GEMINI_API_KEY` from environment variables for API operations that require server-side access.
- Built-in legal content and template configuration live under the server and data folders.

## License

This project is intended for internal legal technology workflows and is not legal advice.

## Disclaimer

The application helps generate legal drafting content and should be reviewed by a qualified advocate or legal professional before use in litigation, filings, or contractual execution.

