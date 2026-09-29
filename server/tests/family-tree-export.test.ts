import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { ExportService } from '../src/services/export.service.js';
import { TelegramBotService } from '../src/services/telegram.service.js';

test('family tree HTML does not leak raw div/table tags into exported DOCX', async () => {
  const html = `
    <div class="court-family-tree-container" style="margin: 12pt 0 18pt 0; text-align: center;">
      <p class="MsoNormal family-tree-title" align="center" style="text-align: center; margin-top: 14pt; margin-bottom: 12pt; line-height: 150%;">
        <b><span style="font-size: 14pt; font-family: 'Noto Sans Devanagari UI', 'Mangal', sans-serif;">अर्जदार यांचा वंशावृक्ष/ वंशावळ</span></b>
      </p>
      <div class="family-tree-branch" style="text-align: center; margin-bottom: 22pt; font-family: 'Noto Sans Devanagari UI', 'Mangal', sans-serif;">
        <p class="family-tree-head" align="center" style="text-align: center; font-weight: bold; font-size: 13pt; margin-bottom: 2pt; line-height: 140%;"><b>कै. रामराव महाजन</b></p>
        <p class="family-tree-arrow" align="center" style="text-align: center; font-size: 13pt; margin: 0 0 2pt 0; line-height: 1; color: #333;">↓</p>
        <table class="family-tree-table" align="center" border="0" cellspacing="0" cellpadding="0" style="width: 95%; max-width: 750px; margin: 0 auto; border-collapse: collapse; text-align: center; border: none;">
          <tbody>
            <tr>
              <td width="50%" style="width: 50%; padding: 4pt 4pt; text-align: center; vertical-align: top; font-size: 12pt; line-height: 130%;"><b>मुलगा</b></td>
              <td width="50%" style="width: 50%; padding: 4pt 4pt; text-align: center; vertical-align: top; font-size: 12pt; line-height: 130%;"><b>मुलगी</b></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  const buffer = await new ExportService().generateDocx({
    title: 'Test family tree',
    content: html,
    paperSize: 'legal',
  });

  const tmpPath = join(process.cwd(), 'tmp_familytree_test.docx');
  writeFileSync(tmpPath, buffer);

  try {
    const xml = execSync(
      `python -X utf8 -c "import zipfile, sys; z = zipfile.ZipFile(r'${tmpPath}'); xml = z.read('word/document.xml').decode('utf-8', 'ignore'); sys.stdout.buffer.write(xml.encode('utf-8')); z.close()"`,
      { encoding: 'utf8' }
    );

    assert.doesNotMatch(xml, /court-family-tree-container|family-tree-table|<div class=|<table class=/i);
    assert.match(xml, /अर्जदार यांचा वंशावृक्ष|मुलगा|मुलगी/i);
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
});

test('telegram file names use selected template title instead of template id', () => {
  const bot = new TelegramBotService();
  const template = {
    id: 'name-change-affidavit-mr-copy-6978',
    title: 'वारस दाखला अर्ज',
    titleMr: 'वारस दाखला अर्ज',
    fields: [{ key: 'party1Name', label: 'Party 1 Name', labelMr: 'पक्षकार 1 नाव' }],
  } as any;

  const base = bot.buildTelegramFileBaseName(template, { party1Name: 'लकीचंद काशीराम महाजन' } as any);

  assert.match(base, /वारस|dakhla|varas|draft/i);
  assert.doesNotMatch(base, /name-change-affidavit/i);
});
