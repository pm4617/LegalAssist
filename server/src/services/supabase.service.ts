import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { LegalTemplate, DocumentDraft } from '../types/index.js';

dotenv.config();

const { Pool } = pg;

// Supabase REST client configuration
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_ANON_KEY
)?.trim();

// Supabase PostgreSQL Direct / Pooler configuration
const databaseUrl = process.env.DATABASE_URL?.trim();
const pgHost = process.env.PGHOST?.trim();
const pgPassword = process.env.PGPASSWORD?.trim();

let pgPool: pg.Pool | null = null;
let supabaseClient: SupabaseClient | null = null;

// Initialize PostgreSQL Pool if Database URL or PG Host/Password is set
if (databaseUrl || (pgHost && pgPassword)) {
  try {
    const poolConfig: pg.PoolConfig = {
      ssl: { rejectUnauthorized: false },
      max: 5, // Recommended for PgBouncer / serverless pooler
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000, // 30s to allow cross-region TLS handshake & pooler spin-up
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      statement_timeout: 45000,
    };

    if (databaseUrl) {
      pgPool = new Pool({
        ...poolConfig,
        connectionString: databaseUrl,
      });
    } else {
      pgPool = new Pool({
        ...poolConfig,
        host: pgHost,
        port: parseInt(process.env.PGPORT || '6543', 10),
        user: process.env.PGUSER || 'postgres',
        password: pgPassword,
        database: process.env.PGDATABASE || 'postgres',
      });
    }

    pgPool.on('error', (err) => {
      console.warn('⚠️ [Supabase DB Pool] Idle client warning (will reconnect):', err.message);
    });

    console.log('⚡ [Supabase DB] Initialized Supabase PostgreSQL cloud pooler (30s timeout, auto-retry).');
  } catch (err: any) {
    console.error('❌ [Supabase DB] Failed to initialize PostgreSQL pool:', err.message);
  }
}

/**
 * Resilient query executor with automatic retry for transient PgBouncer / network timeouts
 */
export async function executePgQuery<T extends pg.QueryResultRow = any>(
  text: string,
  params: any[] = [],
  retries: number = 2
): Promise<pg.QueryResult<T>> {
  if (!pgPool) throw new Error('Postgres pool not initialized');

  let lastError: any;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await pgPool.query<T>(text, params);
    } catch (err: any) {
      lastError = err;
      const msg = err.message || '';
      const isTransient =
        msg.includes('timeout') ||
        msg.includes('Connection terminated') ||
        msg.includes('ECONNRESET') ||
        msg.includes('closed unexpectedly') ||
        msg.includes('client has already been released');

      if (!isTransient || attempt > retries) {
        throw err;
      }
      const backoff = attempt * 1000;
      console.warn(`⚠️ [Supabase DB] Transient network latency on attempt ${attempt}/${retries + 1}. Retrying in ${backoff}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
  throw lastError;
}

// Initialize Supabase JS Client if URL and Key are provided
if (supabaseUrl && supabaseKey) {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    console.log('⚡ [Supabase API] Connected via Supabase REST API client!');
  } catch (err: any) {
    console.warn('⚠️ [Supabase API] Client init warning:', err.message);
  }
}

export const isSupabaseConfigured = (): boolean => {
  return !!(pgPool || (supabaseUrl && supabaseKey));
};

export { pgPool, supabaseClient };

function getLocalPdfDir(): string {
  const dir = path.join(process.cwd(), 'data', 'template-pdfs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Ensures table existence on boot if connected via PostgreSQL
 */
export async function ensureSupabaseTables(): Promise<void> {
  if (!pgPool) return;
  try {
    await executePgQuery(`
      CREATE TABLE IF NOT EXISTS public.custom_templates (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        template_data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_custom_templates_updated_at ON public.custom_templates(updated_at DESC);

      CREATE TABLE IF NOT EXISTS public.custom_drafts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        template_id TEXT,
        draft_data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_custom_drafts_updated_at ON public.custom_drafts(updated_at DESC);

      -- Template Reference PDFs table with CASCADE delete
      CREATE TABLE IF NOT EXISTS public.template_pdfs (
        template_id TEXT PRIMARY KEY,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT DEFAULT 'application/pdf',
        pdf_data BYTEA NOT NULL,
        created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_template_pdfs_template_id ON public.template_pdfs(template_id);
    `);
    console.log('✅ [Supabase DB] Table verification verified successfully.');
  } catch (err: any) {
    console.warn('⚠️ [Supabase DB] Table verification check (will use existing tables/fallback):', err.message);
  }
}

// Run schema verification in background after a short delay so boot queries do not compete
setTimeout(() => {
  ensureSupabaseTables().catch(() => {});
}, 500);

/**
 * -------------------------------------------------------------
 * Custom Templates Supabase Operations
 * -------------------------------------------------------------
 */

export async function fetchCustomTemplatesFromSupabase(): Promise<LegalTemplate[] | null> {
  // 1. Try PostgreSQL Pool
  if (pgPool) {
    try {
      const res = await executePgQuery(
        'SELECT template_data FROM public.custom_templates ORDER BY updated_at DESC;'
      );
      return res.rows.map((row) => row.template_data as LegalTemplate);
    } catch (err: any) {
      console.warn('⚠️ [Supabase DB] Exception fetching custom_templates via Postgres pool:', err.message);
    }
  }

  // 2. Try Supabase REST Client
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('custom_templates')
        .select('template_data')
        .order('updated_at', { ascending: false });

      if (!error && data) {
        return data.map((row: any) => (row.template_data as LegalTemplate) || row);
      }
    } catch (err: any) {
      console.warn('⚠️ [Supabase API] Exception fetching custom_templates:', err.message);
    }
  }

  return null;
}

export async function saveCustomTemplateToSupabase(template: LegalTemplate): Promise<boolean> {
  const now = new Date().toISOString();
  const createdAt = template.createdAt || now;

  if (pgPool) {
    try {
      await executePgQuery(
        `INSERT INTO public.custom_templates (id, title, category, template_data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE 
         SET title = EXCLUDED.title,
             category = EXCLUDED.category,
             template_data = EXCLUDED.template_data,
             updated_at = EXCLUDED.updated_at;`,
        [
          template.id,
          template.title || 'Untitled Template',
          template.category || 'general',
          JSON.stringify(template),
          createdAt,
          now,
        ]
      );
      return true;
    } catch (err: any) {
      console.error('❌ [Supabase DB] Error saving template to Supabase Postgres:', err.message);
    }
  }

  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('custom_templates')
        .upsert(
          {
            id: template.id,
            title: template.title,
            category: template.category || 'general',
            template_data: template,
            updated_at: now,
            created_at: createdAt,
          },
          { onConflict: 'id' }
        );
      return !error;
    } catch (err: any) {
      console.error('❌ [Supabase API] Error saving template to Supabase:', err.message);
    }
  }

  return false;
}

export async function deleteCustomTemplateFromSupabase(id: string): Promise<boolean> {
  // Also delete associated PDF attachment
  await deleteTemplatePdf(id);

  if (pgPool) {
    try {
      await executePgQuery('DELETE FROM public.custom_templates WHERE id = $1;', [id]);
      return true;
    } catch (err: any) {
      console.error(`❌ [Supabase DB] Failed to delete template "${id}":`, err.message);
    }
  }

  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('custom_templates')
        .delete()
        .eq('id', id);
      return !error;
    } catch (err: any) {
      console.error(`❌ [Supabase API] Error deleting template "${id}":`, err.message);
    }
  }

  return false;
}

export async function batchUpsertCustomTemplatesToSupabase(templates: LegalTemplate[]): Promise<boolean> {
  if (templates.length === 0) return true;

  if (pgPool) {
    try {
      for (const t of templates) {
        await saveCustomTemplateToSupabase(t);
      }
      return true;
    } catch (err: any) {
      console.warn('⚠️ [Supabase DB] Batch sync error:', err.message);
    }
  }

  if (supabaseClient) {
    try {
      const records = templates.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category || 'general',
        template_data: t,
        updated_at: t.updatedAt || new Date().toISOString(),
        created_at: t.createdAt || new Date().toISOString(),
      }));

      const { error } = await supabaseClient
        .from('custom_templates')
        .upsert(records, { onConflict: 'id' });
      return !error;
    } catch (err: any) {
      console.warn('⚠️ [Supabase API] Batch sync error:', err.message);
    }
  }

  return false;
}

/**
 * -------------------------------------------------------------
 * Template Reference PDF Operations (Stored in DB as BYTEA)
 * -------------------------------------------------------------
 */

export async function saveTemplatePdf(
  templateId: string,
  fileName: string,
  fileSize: number,
  pdfBuffer: Buffer,
  mimeType: string = 'application/pdf'
): Promise<boolean> {
  const now = new Date().toISOString();

  // 1. PostgreSQL DB Storage
  if (pgPool) {
    try {
      await executePgQuery(
        `INSERT INTO public.template_pdfs (template_id, file_name, file_size, mime_type, pdf_data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (template_id) DO UPDATE 
         SET file_name = EXCLUDED.file_name,
             file_size = EXCLUDED.file_size,
             mime_type = EXCLUDED.mime_type,
             pdf_data = EXCLUDED.pdf_data,
             updated_at = EXCLUDED.updated_at;`,
        [templateId, fileName, fileSize, mimeType, pdfBuffer, now, now]
      );
      console.log(`✅ [Supabase DB] Stored reference PDF "${fileName}" (${fileSize} bytes) for template "${templateId}".`);
    } catch (err: any) {
      console.error('❌ [Supabase DB] Error saving template PDF to Postgres:', err.message);
    }
  }

  // 2. Local disk file backup
  try {
    const dir = getLocalPdfDir();
    fs.writeFileSync(path.join(dir, `${templateId}.pdf`), pdfBuffer);
    fs.writeFileSync(
      path.join(dir, `${templateId}.json`),
      JSON.stringify({ fileName, fileSize, mimeType, updatedAt: now }, null, 2),
      'utf8'
    );
  } catch (err: any) {
    console.warn('⚠️ [Local PDF] Error writing local PDF copy:', err.message);
  }

  return true;
}

export async function getTemplatePdf(
  templateId: string
): Promise<{ fileName: string; fileSize: number; mimeType: string; pdfBuffer: Buffer } | null> {
  // 1. Fetch from PostgreSQL
  if (pgPool) {
    try {
      const res = await executePgQuery(
        'SELECT file_name, file_size, mime_type, pdf_data FROM public.template_pdfs WHERE template_id = $1;',
        [templateId]
      );
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          fileName: row.file_name,
          fileSize: row.file_size,
          mimeType: row.mime_type || 'application/pdf',
          pdfBuffer: Buffer.from(row.pdf_data),
        };
      }
    } catch (err: any) {
      console.warn('⚠️ [Supabase DB] Error fetching template PDF from Postgres:', err.message);
    }
  }

  // 2. Fallback to local disk file
  try {
    const dir = getLocalPdfDir();
    const filePath = path.join(dir, `${templateId}.pdf`);
    const metaPath = path.join(dir, `${templateId}.json`);
    if (fs.existsSync(filePath)) {
      const pdfBuffer = fs.readFileSync(filePath);
      let fileName = `${templateId}.pdf`;
      let mimeType = 'application/pdf';
      let fileSize = pdfBuffer.length;
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          fileName = meta.fileName || fileName;
          mimeType = meta.mimeType || mimeType;
          fileSize = meta.fileSize || fileSize;
        } catch {}
      }
      return { fileName, fileSize, mimeType, pdfBuffer };
    }
  } catch (err: any) {
    console.warn('⚠️ [Local PDF] Error reading local PDF copy:', err.message);
  }

  return null;
}

export async function deleteTemplatePdf(templateId: string): Promise<boolean> {
  // 1. Delete from PostgreSQL
  if (pgPool) {
    try {
      await executePgQuery('DELETE FROM public.template_pdfs WHERE template_id = $1;', [templateId]);
      console.log(`🗑️ [Supabase DB] Deleted reference PDF for template "${templateId}".`);
    } catch (err: any) {
      console.error(`❌ [Supabase DB] Error deleting template PDF:`, err.message);
    }
  }

  // 2. Delete local disk file
  try {
    const dir = getLocalPdfDir();
    const filePath = path.join(dir, `${templateId}.pdf`);
    const metaPath = path.join(dir, `${templateId}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
  } catch {}

  return true;
}

/**
 * -------------------------------------------------------------
 * Custom Drafts Supabase Operations
 * -------------------------------------------------------------
 */

export async function fetchCustomDraftsFromSupabase(): Promise<DocumentDraft[] | null> {
  if (pgPool) {
    try {
      const res = await executePgQuery(
        'SELECT draft_data FROM public.custom_drafts ORDER BY updated_at DESC;'
      );
      return res.rows.map((row) => row.draft_data as DocumentDraft);
    } catch (err: any) {
      console.warn('⚠️ [Supabase DB] Exception fetching custom_drafts:', err.message);
    }
  }

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('custom_drafts')
        .select('draft_data')
        .order('updated_at', { ascending: false });

      if (!error && data) {
        return data.map((row: any) => (row.draft_data as DocumentDraft) || row);
      }
    } catch (err: any) {
      console.warn('⚠️ [Supabase API] Exception fetching custom_drafts:', err.message);
    }
  }

  return null;
}

export async function saveCustomDraftToSupabase(draft: DocumentDraft): Promise<boolean> {
  const now = new Date().toISOString();
  const createdAt = draft.createdAt || now;

  if (pgPool) {
    try {
      await executePgQuery(
        `INSERT INTO public.custom_drafts (id, name, template_id, draft_data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE 
         SET name = EXCLUDED.name,
             template_id = EXCLUDED.template_id,
             draft_data = EXCLUDED.draft_data,
             updated_at = EXCLUDED.updated_at;`,
        [
          draft.id,
          draft.name || 'Untitled Draft',
          draft.templateId,
          JSON.stringify(draft),
          createdAt,
          now,
        ]
      );
      return true;
    } catch (err: any) {
      console.error('❌ [Supabase DB] Failed to save draft:', err.message);
    }
  }

  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('custom_drafts')
        .upsert(
          {
            id: draft.id,
            name: draft.name,
            template_id: draft.templateId,
            draft_data: draft,
            updated_at: now,
            created_at: createdAt,
          },
          { onConflict: 'id' }
        );
      return !error;
    } catch (err: any) {
      console.error('❌ [Supabase API] Failed to save draft:', err.message);
    }
  }

  return false;
}

export async function deleteCustomDraftFromSupabase(id: string): Promise<boolean> {
  if (pgPool) {
    try {
      await executePgQuery('DELETE FROM public.custom_drafts WHERE id = $1;', [id]);
      return true;
    } catch (err: any) {
      console.error(`❌ [Supabase DB] Failed to delete draft "${id}":`, err.message);
    }
  }

  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('custom_drafts')
        .delete()
        .eq('id', id);
      return !error;
    } catch (err: any) {
      console.error(`❌ [Supabase API] Failed to delete draft "${id}":`, err.message);
    }
  }

  return false;
}
