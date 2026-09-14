import fs from 'fs';
import path from 'path';
import os from 'os';
import { templateService } from './template.service.js';
import { exportService } from './export.service.js';
import { ClientFacts, LegalTemplate, FieldDefinition } from '../types/index.js';

interface TelegramSession {
  chatId: number;
  state: 'IDLE' | 'SELECTING_TEMPLATE' | 'IN_WIZARD';
  templateId?: string;
  currentFieldIndex: number;
  facts: ClientFacts;
  updatedAt: number;
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export class TelegramBotService {
  private botToken: string = process.env.TELEGRAM_BOT_TOKEN || '';
  private botUsername: string = '';
  private isPolling: boolean = false;
  private offset: number = 0;
  private pollTimer: NodeJS.Timeout | null = null;
  private activePollId: number = 0;
  private sessions: Map<number, TelegramSession> = new Map();

  constructor() {
    this.botToken = this.loadSavedToken();
    if (this.botToken && !process.env.VERCEL) {
      this.startPolling();
    }
  }

  private getStoragePath(): string {
    if (process.env.VERCEL) {
      return path.join(os.tmpdir(), 'telegram-config.json');
    }
    return path.join(process.cwd(), 'data', 'telegram-config.json');
  }

  private loadSavedToken(): string {
    if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN.trim();
    try {
      const targetFile = this.getStoragePath();
      if (fs.existsSync(targetFile)) {
        const raw = fs.readFileSync(targetFile, 'utf8');
        const parsed = JSON.parse(raw);
        return (parsed.token || '').trim();
      }
    } catch {}
    return '';
  }

  private saveTokenToStorage(token: string): void {
    try {
      const targetFile = this.getStoragePath();
      const dir = path.dirname(targetFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(targetFile, JSON.stringify({ token }, null, 2), 'utf8');
    } catch (err) {
      console.warn('Failed to save telegram token to storage:', err);
    }
  }

  public setBotToken(token: string) {
    const trimmed = (token || '').trim();
    if (this.botToken === trimmed && (this.isPolling || process.env.VERCEL)) {
      return;
    }
    this.stopPolling();
    this.botToken = trimmed;
    this.saveTokenToStorage(trimmed);

    if (this.botToken && !process.env.VERCEL) {
      this.startPolling();
    }
  }

  public async setWebhook(webhookUrl: string): Promise<{ success: boolean; description?: string }> {
    if (!this.botToken) return { success: false, description: 'No Telegram Bot token configured' };
    try {
      this.stopPolling();
      const url = `https://api.telegram.org/bot${this.botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
      const res = await fetch(url);
      const data: any = await res.json();
      if (data.ok) {
        console.log(`🤖 Telegram Webhook successfully set to: ${webhookUrl}`);
        return { success: true, description: data.description || 'Webhook registered successfully' };
      }
      return { success: false, description: data.description || 'Failed to set Telegram webhook' };
    } catch (err: any) {
      return { success: false, description: err.message || 'Webhook registration error' };
    }
  }

  public getBotToken(): string {
    return this.botToken;
  }

  public getBotUsername(): string {
    return this.botUsername;
  }

  public isBotActive(): boolean {
    return this.isPolling && !!this.botToken;
  }

  public async testConnection(): Promise<{ success: boolean; botName?: string; error?: string }> {
    if (!this.botToken) return { success: false, error: 'No Telegram Bot token configured' };
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/getMe`);
      const data: any = await res.json();
      if (data.ok && data.result) {
        this.botUsername = data.result.username || data.result.first_name || '';
        return { success: true, botName: this.botUsername };
      }
      return { success: false, error: data.description || 'Invalid Telegram Bot Token' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to connect to Telegram API' };
    }
  }

  public async startPolling() {
    if (!this.botToken) return;
    
    // Stop any existing loop and increment poll ID guard
    this.stopPolling();
    this.isPolling = true;
    const currentPollId = ++this.activePollId;

    // Clear any active webhooks so getUpdates polling works cleanly
    try {
      await fetch(`https://api.telegram.org/bot${this.botToken}/deleteWebhook?drop_pending_updates=false`);
    } catch (err) {
      console.error('Failed to delete Telegram webhook:', err);
    }

    // Test token and get bot details
    await this.testConnection();
    console.log(`🤖 Telegram Bot Service started for @${this.botUsername || 'Bot'} (Poll ID: ${currentPollId})`);

    this.pollLoop(currentPollId);
  }

  public stopPolling() {
    this.isPolling = false;
    this.activePollId++;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('🤖 Telegram Bot Service stopped.');
  }

  private async pollLoop(pollId: number) {
    if (!this.isPolling || pollId !== this.activePollId || !this.botToken) return;

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${this.offset}&timeout=10`;
      const res = await fetch(url);
      
      if (!this.isPolling || pollId !== this.activePollId) return;

      if (res.ok) {
        const data: any = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            this.offset = Math.max(this.offset, update.update_id + 1);
            await this.handleUpdate(update);
          }
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.error(`Telegram polling HTTP ${res.status} Error:`, errJson);
      }
    } catch (err) {
      console.error('Telegram polling network error:', err);
    } finally {
      if (this.isPolling && pollId === this.activePollId) {
        this.pollTimer = setTimeout(() => this.pollLoop(pollId), 1000);
      }
    }
  }

  public async handleUpdate(update: any) {
    if (update.message) {
      const message = update.message;
      const chatId = message.chat?.id;
      const text = (message.text || '').trim();

      if (!chatId) return;

      const lower = text.toLowerCase();
      if (text === '/start' || text === '/new' || text === '/restart' || lower.includes('hello') || lower.includes('hi')) {
        await this.handleStart(chatId);
        return;
      }

      if (text === '/cancel' || lower === 'cancel') {
        this.sessions.delete(chatId);
        await this.sendMessage(chatId, '❌ <b>Session cancelled.</b> Type /start to begin a new legal document draft.');
        return;
      }

      if (text === '/help') {
        await this.sendMessage(chatId, `🏛️ <b>LegalAssist Telegram Bot Help</b>\n\n• /start or /new - Select a legal template & start form wizard\n• /skip - Skip optional question\n• /cancel - Cancel current session\n• /help - View commands help`);
        return;
      }

      // Check current session
      const session = this.sessions.get(chatId);
      if (!session || session.state === 'IDLE') {
        await this.handleStart(chatId);
        return;
      }

      if (session.state === 'IN_WIZARD') {
        if (text === '/skip' || lower === 'skip') {
          await this.processAnswer(chatId, session, '');
        } else {
          await this.processAnswer(chatId, session, text);
        }
      }
    } else if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message?.chat?.id;
      const data = cb.data || '';

      if (!chatId) return;

      // Acknowledge button click
      await fetch(`https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cb.id })
      }).catch(() => {});

      if (data.startsWith('tmpl_')) {
        const templateId = data.replace('tmpl_', '');
        await this.startWizardForTemplate(chatId, templateId);
      } else if (data.startsWith('ans_')) {
        const value = data.replace('ans_', '');
        const session = this.sessions.get(chatId);
        if (session && session.state === 'IN_WIZARD') {
          await this.processAnswer(chatId, session, value);
        }
      } else if (data === 'cmd_skip') {
        const session = this.sessions.get(chatId);
        if (session && session.state === 'IN_WIZARD') {
          await this.processAnswer(chatId, session, '');
        }
      } else if (data === 'cmd_cancel') {
        this.sessions.delete(chatId);
        await this.sendMessage(chatId, '❌ <b>Draft session cancelled.</b> Type /start anytime to begin again.');
      }
    }
  }

  private async handleStart(chatId: number) {
    const templates = templateService.getAllTemplates();
    if (!templates || templates.length === 0) {
      await this.sendMessage(chatId, '⚠️ No legal templates found in system.');
      return;
    }

    const inlineKeyboard: any[][] = [];
    templates.forEach((t) => {
      inlineKeyboard.push([
        {
          text: `📜 ${t.title}${t.titleMr ? ` (${t.titleMr})` : ''}`,
          callback_data: `tmpl_${t.id}`
        }
      ]);
    });

    this.sessions.set(chatId, {
      chatId,
      state: 'SELECTING_TEMPLATE',
      currentFieldIndex: 0,
      facts: {},
      updatedAt: Date.now()
    });

    await this.sendMessageWithKeyboard(
      chatId,
      `🏛️ <b>Welcome to LegalAssist Automated Legal Drafter!</b>\n\nPlease select a Legal Template to start your automated step-by-step drafting session:`,
      { inline_keyboard: inlineKeyboard }
    );
  }

  private async startWizardForTemplate(chatId: number, templateId: string) {
    const template = templateService.getTemplate(templateId);
    if (!template) {
      await this.sendMessage(chatId, '❌ Selected template not found. Type /start to select again.');
      return;
    }

    const fields = this.getEffectiveFields(template);
    const initialFacts: ClientFacts = {
      courtCity: 'अमळनेर',
      courtName: template.defaultCourt || 'मे. दिवाणी न्यायाधीश वरिष्ठ स्तर',
      caseYear: new Date().getFullYear().toString()
    };

    // Pre-populate default values from template fields
    fields.forEach((f) => {
      if (f.defaultValue !== undefined && f.defaultValue !== '') {
        initialFacts[f.key] = f.defaultValue;
      }
    });

    const session: TelegramSession = {
      chatId,
      state: 'IN_WIZARD',
      templateId,
      currentFieldIndex: 0,
      facts: initialFacts,
      updatedAt: Date.now()
    };

    this.sessions.set(chatId, session);

    const safeTitle = escapeHtml(template.title);
    const safeTitleMr = template.titleMr ? ` (${escapeHtml(template.titleMr)})` : '';
    await this.sendMessage(
      chatId,
      `✅ <b>Selected Template:</b> ${safeTitle}${safeTitleMr}\n\n⚡ <b>Form Wizard Started!</b> Please answer the questions step-by-step below:`
    );

    await this.sendCurrentQuestion(chatId, session);
  }

  private getEffectiveFields(template: LegalTemplate): FieldDefinition[] {
    const fields = [...(template.fields || [])];
    const text = template.templateText || '';

    if (template.courtApplicable !== false || text.includes('{courtName}') || text.includes('{courtCity}')) {
      if (!fields.some((f) => f.key === 'courtCity')) {
        fields.unshift({
          key: 'courtCity',
          label: 'Court City',
          labelMr: 'कोर्टाचे शहर',
          type: 'text',
          required: true,
          defaultValue: 'अमळनेर',
          group: 'court'
        });
      }
      if (!fields.some((f) => f.key === 'courtName')) {
        fields.unshift({
          key: 'courtName',
          label: 'Court Name / Authority',
          labelMr: 'कोर्टाचे नाव',
          type: 'text',
          required: true,
          defaultValue: template.defaultCourt || 'मे. दिवाणी न्यायाधीश वरिष्ठ स्तर',
          group: 'court'
        });
      }
    }
    return fields;
  }

  private async sendCurrentQuestion(chatId: number, session: TelegramSession) {
    if (!session.templateId) return;
    const template = templateService.getTemplate(session.templateId);
    if (!template) return;

    const fields = this.getEffectiveFields(template);
    if (session.currentFieldIndex >= fields.length) {
      await this.finishWizardAndSendDocx(chatId, session);
      return;
    }

    const field = fields[session.currentFieldIndex];
    const stepNum = session.currentFieldIndex + 1;
    const totalSteps = fields.length;

    const defaultValue = session.facts[field.key] ?? field.defaultValue;
    const hasDefault = defaultValue !== undefined && defaultValue !== null && String(defaultValue).trim() !== '';

    let questionText = `📋 <b>Step ${stepNum} of ${totalSteps}</b>: ${escapeHtml(field.label)}\n`;
    if (field.labelMr) {
      questionText += `<b>${escapeHtml(field.labelMr)}</b>\n`;
    }

    if (hasDefault) {
      questionText += `\n💡 <i>Default / डिफॉल्ट:</i> <b>${escapeHtml(String(defaultValue))}</b>`;
    }

    questionText += `\n\n<i>Key:</i> <code>{${escapeHtml(field.key)}}</code>`;

    const inlineKeyboard: any[][] = [];

    if (hasDefault) {
      const shortVal = String(defaultValue).length > 20 ? String(defaultValue).slice(0, 18) + '...' : String(defaultValue);
      inlineKeyboard.push([
        { text: `✅ Use Default: ${shortVal}`, callback_data: `ans_${defaultValue}` }
      ]);
    }

    if (field.type === 'boolean') {
      inlineKeyboard.push([
        { text: '✅ Yes (होय)', callback_data: 'ans_true' },
        { text: '❌ No (नाही)', callback_data: 'ans_false' }
      ]);
    } else if (field.type === 'select' && Array.isArray(field.options) && field.options.length > 0) {
      field.options.forEach((opt: any) => {
        const val = typeof opt === 'string' ? opt : opt.value;
        const lbl = typeof opt === 'string' ? opt : opt.label;
        inlineKeyboard.push([
          { text: `🔹 ${lbl}`, callback_data: `ans_${val}` }
        ]);
      });
    }

    // Navigation options
    inlineKeyboard.push([
      { text: '⏭️ Skip (वगळा)', callback_data: 'cmd_skip' },
      { text: '❌ Cancel', callback_data: 'cmd_cancel' }
    ]);

    await this.sendMessageWithKeyboard(chatId, questionText, { inline_keyboard: inlineKeyboard });
  }

  private async processAnswer(chatId: number, session: TelegramSession, value: string) {
    if (!session.templateId) return;
    const template = templateService.getTemplate(session.templateId);
    if (!template) return;

    const fields = this.getEffectiveFields(template);
    const field = fields[session.currentFieldIndex];

    if (field) {
      if (value.trim()) {
        if (field.type === 'boolean') {
          session.facts[field.key] = value === 'true' || value === '1' || value.toLowerCase() === 'yes';
        } else {
          session.facts[field.key] = value.trim();
        }
      } else {
        // If skipped/empty answer, check if default value exists and keep it
        if (!session.facts[field.key] && field.defaultValue !== undefined) {
          session.facts[field.key] = field.defaultValue;
        }
      }
    }

    session.currentFieldIndex++;
    session.updatedAt = Date.now();

    if (session.currentFieldIndex >= fields.length) {
      await this.finishWizardAndSendDocx(chatId, session);
    } else {
      await this.sendCurrentQuestion(chatId, session);
    }
  }

  private async finishWizardAndSendDocx(chatId: number, session: TelegramSession) {
    if (!session.templateId) return;
    const template = templateService.getTemplate(session.templateId);
    if (!template) return;

    await this.sendMessage(chatId, `🎉 <b>All particulars recorded successfully!</b>\n⚙️ <i>Generating court-compliant .docx legal document...</i>`);

    try {
      // Merge template with facts
      const mergedHtml = templateService.mergeTemplate(template, session.facts);

      // Generate DOCX Buffer
      const docxBuffer = await exportService.generateDocx({
        title: template.title,
        content: mergedHtml,
        paperSize: 'legal'
      });

      const fileName = `${template.title.replace(/[^a-zA-Z0-9_\-]/g, '_')}_Draft.docx`;

      // Upload DOCX to Telegram Chat
      await this.sendDocument(
        chatId,
        docxBuffer,
        fileName,
        `📄 <b>Here is your completed court document draft:</b>\n\n• <b>Template:</b> ${escapeHtml(template.title)}\n• <b>Format:</b> Microsoft Word (.docx)\n• <b>Paper Size:</b> Legal (8.5" x 14")`
      );

      this.sessions.delete(chatId);
    } catch (err: any) {
      console.error('Failed to generate Telegram document:', err);
      await this.sendMessage(chatId, `❌ Failed to generate document: ${escapeHtml(err.message || 'Unknown error')}`);
    }
  }

  public async sendMessage(chatId: number, text: string) {
    if (!this.botToken) return;
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML'
        })
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        console.error('Telegram sendMessage HTTP Error:', res.status, errJson);
        // Fallback: send plain text if HTML parsing failed
        if (res.status === 400) {
          const plainText = text.replace(/<[^>]*>/g, '');
          await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: plainText
            })
          });
        }
      }
    } catch (err) {
      console.error('Failed to send Telegram message:', err);
    }
  }

  public async sendMessageWithKeyboard(chatId: number, text: string, replyMarkup: any) {
    if (!this.botToken) return;
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          reply_markup: replyMarkup
        })
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        console.error('Telegram sendMessageWithKeyboard HTTP Error:', res.status, errJson);
        if (res.status === 400) {
          const plainText = text.replace(/<[^>]*>/g, '');
          await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: plainText,
              reply_markup: replyMarkup
            })
          });
        }
      }
    } catch (err) {
      console.error('Failed to send Telegram keyboard message:', err);
    }
  }

  public async sendDocument(chatId: number, buffer: Buffer, filename: string, caption?: string) {
    if (!this.botToken) return;
    try {
      const formData = new FormData();
      formData.append('chat_id', String(chatId));
      if (caption) {
        formData.append('caption', caption);
        formData.append('parse_mode', 'HTML');
      }

      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      formData.append('document', blob, filename);

      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendDocument`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        console.error('Telegram sendDocument HTTP Error:', res.status, errJson);
      }
    } catch (err) {
      console.error('Failed to send Telegram document:', err);
    }
  }
}

export const telegramBotService = new TelegramBotService();
