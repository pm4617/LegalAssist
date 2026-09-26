import pg from 'pg';
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
    if (databaseUrl) {
      pgPool = new Pool({
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    } else {
      pgPool = new Pool({
        host: pgHost,
        port: parseInt(process.env.PGPORT || '6543', 10),
        user: process.env.PGUSER || 'postgres',
        password: pgPassword,
        database: process.env.PGDATABASE || 'postgres',
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    }

    pgPool.on('error', (err) => {
      console.warn('⚠️ [Supabase DB Pool] Unexpected error on idle client:', err.message);
    });

    console.log('⚡ [Supabase DB] Connected to Supabase PostgreSQL cloud database!');
  } catch (err: any) {
    console.error('❌ [Supabase DB] Failed to initialize PostgreSQL pool:', err.message);
  }
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

/**
 * Ensures table existence on boot if connected via PostgreSQL
 */
export async function ensureSupabaseTables(): Promise<void> {
  if (!pgPool) return;
  try {
    await pgPool.query(`
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
    `);
  } catch (err: any) {
    console.warn('⚠️ [Supabase DB] Table verification check:', err.message);
  }
}

// Run schema verification in background
ensureSupabaseTables().catch(() => {});

/**
 * -------------------------------------------------------------
 * Custom Templates Supabase Operations
 * -------------------------------------------------------------
 */

export async function fetchCustomTemplatesFromSupabase(): Promise<LegalTemplate[] | null> {
  // 1. Try PostgreSQL Pool
  if (pgPool) {
    try {
      const res = await pgPool.query(
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
      await pgPool.query(
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
  if (pgPool) {
    try {
      await pgPool.query('DELETE FROM public.custom_templates WHERE id = $1;', [id]);
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
 * Custom Drafts Supabase Operations
 * -------------------------------------------------------------
 */

export async function fetchCustomDraftsFromSupabase(): Promise<DocumentDraft[] | null> {
  if (pgPool) {
    try {
      const res = await pgPool.query(
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
      await pgPool.query(
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
      await pgPool.query('DELETE FROM public.custom_drafts WHERE id = $1;', [id]);
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
