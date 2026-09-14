import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
// @ts-ignore
import { createCopilotExpressHandler } from '@copilotkit/runtime/v2/express';
// @ts-ignore
import { CopilotRuntime, BuiltInAgent } from '@copilotkit/runtime/v2';
import { templateService } from './services/template.service.js';
import { copilotService, formatGeminiErrorMessage } from './services/copilot.service.js';
import { exportService } from './services/export.service.js';
import { telegramBotService } from './services/telegram.service.js';
import { ClientFacts } from './types/index.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['*']
}));

app.use(express.json({ limit: '10mb' }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'JurisCopilot Legal API',
    time: new Date().toISOString(),
    geminiConfigured: !!process.env.GEMINI_API_KEY
  });
});

// Templates Routes
app.get('/api/templates', (req, res) => {
  const templates = templateService.getAllTemplates();
  res.json(templates);
});

app.get('/api/templates/:id', (req, res) => {
  const template = templateService.getTemplate(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.json(template);
});

// Create a new custom template
app.post('/api/templates', (req, res) => {
  try {
    const template = req.body as any;
    if (!template.id || !template.title || !template.templateText) {
      return res.status(400).json({ error: 'id, title, and templateText are required' });
    }
    // Prevent overwriting built-in templates via POST
    const existing = templateService.getTemplate(template.id);
    if (existing?.isBuiltIn) {
      return res.status(409).json({ error: `Template id "${template.id}" is a built-in template. Use POST /api/templates/${template.id}/clone to create a copy.` });
    }
    const saved = templateService.saveTemplate({
      standardClauses: [],
      fields: [],
      statutoryRequirements: [],
      category: 'general',
      language: 'mr',
      description: '',
      ...template,
    });
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update (replace) a custom template
app.put('/api/templates/:id', (req, res) => {
  try {
    const existing = templateService.getTemplate(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Template not found' });
    if (existing.isBuiltIn) {
      return res.status(403).json({ error: 'Cannot directly edit a built-in template. Clone it first.' });
    }
    const updated = templateService.saveTemplate({ ...req.body, id: req.params.id });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a custom template
app.delete('/api/templates/:id', (req, res) => {
  try {
    templateService.deleteTemplate(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    const isBuiltIn = err.message.includes('built-in');
    res.status(isBuiltIn ? 403 : 404).json({ error: err.message });
  }
});

// Clone a template (built-in or custom) into a new custom template
app.post('/api/templates/:id/clone', (req, res) => {
  try {
    const { newId, newTitle } = req.body;
    if (!newId || !newTitle) return res.status(400).json({ error: 'newId and newTitle are required' });
    const cloned = templateService.cloneTemplate(req.params.id, newId, newTitle);
    res.status(201).json(cloned);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Render / Merge Template with Facts
app.post('/api/documents/render', (req, res) => {
  const { templateId, facts } = req.body;
  const template = templateService.getTemplate(templateId);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  const mergedText = templateService.mergeTemplate(template, facts || {});
  const compliance = templateService.auditCompliance(template, facts || {}, mergedText);

  res.json({
    text: mergedText,
    compliance
  });
});

// Compliance Audit Endpoint
app.post('/api/documents/audit', (req, res) => {
  const { templateId, facts, draftText } = req.body;
  const template = templateService.getTemplate(templateId);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  const compliance = templateService.auditCompliance(template, facts || {}, draftText || '');
  res.json(compliance);
});

// Export Document to .docx
app.post('/api/documents/export/docx', async (req, res) => {
  try {
    const { title, content, isDevanagari, paperSize } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const buffer = await exportService.generateDocx({
      title: title || 'Legal_Document',
      content,
      isDevanagari: isDevanagari ?? (content.includes('अ') || content.includes('आ') || content.includes('जळगाव')),
      paperSize: paperSize || 'legal',
    });

    const safeTitle = (title || 'Legal_Document')
      .replace(/[^a-zA-Z0-9_\u0900-\u097F]/g, '_')
      .slice(0, 50);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.docx"`);
    res.send(buffer);
  } catch (err: any) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Failed to generate Word document', details: err.message });
  }
});

// Telegram Bot API Routes
app.get('/api/telegram/status', (req, res) => {
  res.json({
    token: telegramBotService.getBotToken(),
    active: telegramBotService.isBotActive(),
    username: telegramBotService.getBotUsername(),
  });
});

app.post('/api/telegram/config', (req, res) => {
  const { token } = req.body;
  telegramBotService.setBotToken(token || '');
  res.json({
    token: telegramBotService.getBotToken(),
    active: telegramBotService.isBotActive(),
    username: telegramBotService.getBotUsername(),
  });
});

app.post('/api/telegram/test', async (req, res) => {
  const result = await telegramBotService.testConnection();
  res.json(result);
});

// AI Copilot Endpoints
app.post('/api/copilot/chat', async (req, res) => {
  try {
    const { message, context, apiKey } = req.body;
    const response = await copilotService.processChat({
      message: message || '',
      context: context || {},
      apiKey
    });
    res.json({ reply: response });
  } catch (err: any) {
    console.error('Copilot chat error:', err);
    res.status(500).json({ error: 'Failed to process AI chat', details: err.message });
  }
});

// Extract Client Details from Unstructured Notes
app.post('/api/copilot/extract', async (req, res) => {
  try {
    const { rawNotes, apiKey } = req.body;
    if (!rawNotes) {
      return res.status(400).json({ error: 'rawNotes is required' });
    }

    const result = await copilotService.extractFactsFromNotes(rawNotes, apiKey);
    res.json(result);
  } catch (err: any) {
    console.error('Copilot extract error:', err);
    res.status(500).json({ error: 'Failed to extract facts', details: err.message });
  }
});

// Transliterate English text/numbers into Devanagari Marathi
app.post('/api/copilot/transliterate', async (req, res) => {
  try {
    const { text, apiKey } = req.body;
    if (!text || typeof text !== 'string') {
      return res.json({ transliterated: '' });
    }

    const transliterated = await copilotService.transliterateText(text, apiKey);
    res.json({ transliterated });
  } catch (err: any) {
    console.error('Transliterate error:', err);
    res.status(500).json({ error: 'Failed to transliterate text', details: err.message });
  }
});

// Direct Document Translation Endpoint (Gemini 3.7 Flash)
app.post('/api/copilot/translate', async (req, res) => {
  try {
    const { documentBody, targetLanguage, apiKey } = req.body;
    if (!documentBody) {
      return res.status(400).json({ error: 'documentBody is required' });
    }

    const geminiKey = apiKey || (req.headers['x-gemini-api-key'] as string) || process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return res.status(400).json({ error: 'Gemini 3.7 Flash API key required. Please configure your Gemini API key in Settings (⚙️).' });
    }

    const targetLang = targetLanguage === 'mr' ? 'mr' : 'en';
    const translated = await copilotService.translateDocument({
      documentBody,
      targetLanguage: targetLang,
      apiKey: geminiKey
    });

    res.json({ translated });
  } catch (err: any) {
    console.error('Gemini 3.7 Flash translate error:', err);
    res.status(500).json({ error: 'Gemini 3.7 Flash translation failed', details: err.message });
  }
});

// --- CopilotKit Runtime v2 Protocol Support ---
const runtimeInfoData = {
  specificationVersion: 'v1',
  version: '1.70.1',
  agents: {
    default: {
      name: 'default',
      description: 'JurisCopilot Legal AI Assistant for Indian Court Petitions and Commercial Agreements',
      className: 'BuiltInAgent',
      specificationVersion: 'v1'
    }
  },
  mode: 'sse',
  threadEndpoints: {
    list: true,
    inspect: true,
    connect: true,
    mutations: false,
    realtimeMetadata: false
  },
  suggestions: true,
  a2uiEnabled: false,
  openGenerativeUIEnabled: false,
  telemetryDisabled: true
};

// Info endpoints (GET & POST)
app.all(['/api/copilot/info', '/api/copilot/agent/:agent/info', '/api/copilot/agents/:agent/info'], (req, res) => {
  res.json(runtimeInfoData);
});

// Connect endpoints (POST & GET) - Prevents 404 on /agent/default/connect
app.all(['/api/copilot/connect', '/api/copilot/agent/:agent/connect', '/api/copilot/agents/:agent/connect'], (req, res) => {
  const threadId = req.body?.threadId || `thread_${Date.now()}`;
  res.json({
    threadId,
    agentName: req.params.agent || 'default',
    status: 'connected',
    specificationVersion: 'v1'
  });
});

// Primary AG-UI Stream Handler for JurisCopilot Gemini AI Engine
app.all(['/api/copilot', '/api/copilot/*', '/api/copilot/agents/:agent/run', '/api/copilot/agent/:agent/run'], async (req, res) => {
  const reqPath = req.path || '';

  if (req.body?.method === 'info' || reqPath.endsWith('/info')) {
    return res.json(runtimeInfoData);
  }

  if (reqPath.endsWith('/connect')) {
    const threadId = req.body?.threadId || `thread_${Date.now()}`;
    return res.json({
      threadId,
      agentName: req.params.agent || 'default',
      status: 'connected',
      specificationVersion: 'v1'
    });
  }

  const rawKeys = [
    req.headers['x-gemini-api-key'] as string,
    req.body?.apiKey,
    req.body?.properties?.apiKey,
    req.body?.clientContext?.apiKey,
    process.env.GEMINI_API_KEY
  ];

  let geminiKey: string | undefined;
  for (const k of rawKeys) {
    if (k && typeof k === 'string' && k.trim().length > 5 && k.trim() !== 'undefined' && k.trim() !== 'null') {
      geminiKey = k.trim();
      break;
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  const runId = req.body?.runId || `run_${Date.now()}`;
  const thread_id = req.body?.threadId || `thread_${Date.now()}`;
  const msgId = `msg_${Date.now()}`;
  const agentName = req.params.agent || 'default';

  const emit = (event: string, data: object) => {
    res.write(`data: ${JSON.stringify({ type: event, specificationVersion: 'v1', ...data })}\n\n`);
  };

  try {
    emit('RUN_STARTED', {
      thread_id,
      threadId: thread_id,
      run_id: runId,
      runId,
      agent_name: agentName,
      agentName,
      specificationVersion: 'v1'
    });

    function buildClientContext(body: any): any {
      const cc = body?.clientContext || body?.context || body?.readable;
      let docBody = cc?.documentBody || cc?.body;
      let title = cc?.templateTitle || cc?.title;
      let facts = cc?.clientFacts || cc?.facts;

      if (!docBody || !title || !facts) {
        const checkItem = (item: any) => {
          const val = item?.value || item;
          if (!docBody && (val?.documentBody || val?.body)) docBody = val.documentBody || val.body;
          if (!title && (val?.templateTitle || val?.title)) title = val.templateTitle || val.title;
          if (!facts && (val?.party1Name || val?.courtCity || val?.clientFacts)) facts = val.clientFacts || val;
        };

        if (Array.isArray(cc)) cc.forEach(checkItem);
        if (Array.isArray(body?.readable)) body.readable.forEach(checkItem);
        if (Array.isArray(body?.messages)) {
          body.messages.forEach((m: any) => {
            if (m?.clientContext) {
              if (Array.isArray(m.clientContext)) m.clientContext.forEach(checkItem);
              else checkItem(m.clientContext);
            }
          });
        }
      }

      return {
        documentBody: docBody || '',
        templateTitle: title || 'Active Legal Document',
        clientFacts: facts || {}
      };
    }

    const clientContext = buildClientContext(req.body);

    function extractUserMessage(body: any): string {
      if (typeof body?.message === 'string' && body.message.trim()) return body.message.trim();
      if (typeof body?.prompt === 'string' && body.prompt.trim()) return body.prompt.trim();
      const msgs = body?.messages;
      if (!Array.isArray(msgs) || msgs.length === 0) return 'Hello';
      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i];
        if (!msg) continue;
        if (typeof msg === 'string' && msg.trim()) return msg.trim();
        if (typeof msg === 'object') {
          const role = msg.role || msg.author;
          if (role === 'assistant' || role === 'system') continue;
          if (typeof msg.content === 'string' && msg.content.trim()) return msg.content.trim();
          if (typeof msg.text === 'string' && msg.text.trim()) return msg.text.trim();
          if (Array.isArray(msg.content)) {
            const textObj = msg.content.find((c: any) => typeof c === 'string' || c?.type === 'text' || c?.text);
            if (typeof textObj === 'string' && textObj.trim()) return textObj.trim();
            if (textObj?.text && textObj.text.trim()) return textObj.text.trim();
          }
          if (Array.isArray(msg.parts)) {
            const textPart = msg.parts.find((p: any) => typeof p === 'string' || p?.text);
            if (typeof textPart === 'string' && textPart.trim()) return textPart.trim();
            if (textPart?.text && textPart.text.trim()) return textPart.text.trim();
          }
        }
      }
      return 'Hello';
    }

    const latestMessage = extractUserMessage(req.body);

    if (!geminiKey) {
      emit('TEXT_MESSAGE_START', { message_id: msgId, messageId: msgId, id: msgId, role: 'assistant', specificationVersion: 'v1' });
      emit('TEXT_MESSAGE_CONTENT', { message_id: msgId, messageId: msgId, id: msgId, delta: 'Please configure your Gemini API key in Settings (⚙️) to enable full AI Copilot capability.', content: 'Please configure your Gemini API key in Settings (⚙️) to enable full AI Copilot capability.', specificationVersion: 'v1' });
      emit('TEXT_MESSAGE_END', { message_id: msgId, messageId: msgId, id: msgId, specificationVersion: 'v1' });
    } else {
      const reply = await copilotService.processChat({
        message: latestMessage,
        context: clientContext || {},
        apiKey: geminiKey,
      });

      const docMatch = reply.match(/\[REVISED_DOCUMENT_START\]([\s\S]*?)\[REVISED_DOCUMENT_END\]/);

      if (docMatch && docMatch[1]) {
        const revisedBody = docMatch[1].trim();

        emit('TEXT_MESSAGE_START', { message_id: msgId, messageId: msgId, id: msgId, role: 'assistant', specificationVersion: 'v1' });
        emit('TEXT_MESSAGE_CONTENT', { message_id: msgId, messageId: msgId, id: msgId, delta: reply, content: reply, specificationVersion: 'v1' });
        emit('TEXT_MESSAGE_END', { message_id: msgId, messageId: msgId, id: msgId, specificationVersion: 'v1' });

        const actionExecId = `exec_${Date.now()}`;

        // AG-UI Action Execution Protocol
        emit('ACTION_EXECUTION_START', {
          action_execution_id: actionExecId,
          actionExecutionId: actionExecId,
          id: actionExecId,
          name: 'updateDocumentBody',
          action_name: 'updateDocumentBody',
          actionName: 'updateDocumentBody',
          scope: 'client',
          specificationVersion: 'v1'
        });
        emit('ACTION_EXECUTION_ARGS', {
          action_execution_id: actionExecId,
          actionExecutionId: actionExecId,
          id: actionExecId,
          name: 'updateDocumentBody',
          action_name: 'updateDocumentBody',
          actionName: 'updateDocumentBody',
          args: { newBodyText: revisedBody },
          specificationVersion: 'v1'
        });
        emit('ACTION_EXECUTION_END', {
          action_execution_id: actionExecId,
          actionExecutionId: actionExecId,
          id: actionExecId,
          name: 'updateDocumentBody',
          action_name: 'updateDocumentBody',
          actionName: 'updateDocumentBody',
          specificationVersion: 'v1'
        });

        // Tool Call Protocol fallback
        emit('TOOL_CALL_START', {
          tool_call_id: actionExecId,
          toolCallId: actionExecId,
          id: actionExecId,
          name: 'updateDocumentBody',
          action_name: 'updateDocumentBody',
          actionName: 'updateDocumentBody',
          specificationVersion: 'v1'
        });
        emit('TOOL_CALL_ARGS', {
          tool_call_id: actionExecId,
          toolCallId: actionExecId,
          id: actionExecId,
          name: 'updateDocumentBody',
          action_name: 'updateDocumentBody',
          actionName: 'updateDocumentBody',
          args: { newBodyText: revisedBody },
          specificationVersion: 'v1'
        });
        emit('TOOL_CALL_END', {
          tool_call_id: actionExecId,
          toolCallId: actionExecId,
          id: actionExecId,
          specificationVersion: 'v1'
        });
      } else {
        emit('TEXT_MESSAGE_START', { message_id: msgId, messageId: msgId, id: msgId, role: 'assistant', specificationVersion: 'v1' });
        emit('TEXT_MESSAGE_CONTENT', { message_id: msgId, messageId: msgId, id: msgId, delta: reply, content: reply, specificationVersion: 'v1' });
        emit('TEXT_MESSAGE_END', { message_id: msgId, messageId: msgId, id: msgId, specificationVersion: 'v1' });
      }
    }

    emit('RUN_FINISHED', { thread_id, threadId: thread_id, run_id: runId, runId, specificationVersion: 'v1' });
  } catch (err: any) {
    console.error('CopilotKit AG-UI endpoint error:', err);
    const cleanError = formatGeminiErrorMessage(err);
    emit('TEXT_MESSAGE_START', { message_id: msgId, messageId: msgId, id: msgId, role: 'assistant', specificationVersion: 'v1' });
    emit('TEXT_MESSAGE_CONTENT', { message_id: msgId, messageId: msgId, id: msgId, delta: `⚠️ Legal AI Copilot Error: ${cleanError}`, content: `⚠️ Legal AI Copilot Error: ${cleanError}`, specificationVersion: 'v1' });
    emit('TEXT_MESSAGE_END', { message_id: msgId, messageId: msgId, id: msgId, specificationVersion: 'v1' });
    emit('RUN_FINISHED', { thread_id, threadId: thread_id, run_id: runId, runId, specificationVersion: 'v1' });
  }

  res.end();
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🏛️  JurisCopilot Legal Backend running on port ${PORT}`);
  console.log(`🔗 API Base: http://localhost:${PORT}/api`);
  console.log(`🤖 Copilot Endpoint: http://localhost:${PORT}/api/copilot`);
  console.log(`====================================================`);
});

export default app;
