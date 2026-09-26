-- ==============================================================================
-- Supabase Schema for LegalAssist Cloud Storage
-- Run this script in your Supabase Project Dashboard -> SQL Editor -> Run
-- ==============================================================================

-- 1. Table: custom_templates
CREATE TABLE IF NOT EXISTS public.custom_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  template_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for speedy queries
CREATE INDEX IF NOT EXISTS idx_custom_templates_updated_at ON public.custom_templates(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_templates_category ON public.custom_templates(category);

-- Enable Row Level Security (RLS)
ALTER TABLE public.custom_templates ENABLE ROW LEVEL SECURITY;

-- Allow public read/write access (or customize with your own user authentication rules)
DROP POLICY IF EXISTS "Public access to custom_templates" ON public.custom_templates;
CREATE POLICY "Public access to custom_templates"
  ON public.custom_templates
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- 2. Table: custom_drafts
CREATE TABLE IF NOT EXISTS public.custom_drafts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_id TEXT,
  draft_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for speedy queries
CREATE INDEX IF NOT EXISTS idx_custom_drafts_updated_at ON public.custom_drafts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_drafts_template_id ON public.custom_drafts(template_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.custom_drafts ENABLE ROW LEVEL SECURITY;

-- Allow public read/write access
DROP POLICY IF EXISTS "Public access to custom_drafts" ON public.custom_drafts;
CREATE POLICY "Public access to custom_drafts"
  ON public.custom_drafts
  FOR ALL
  USING (true)
  WITH CHECK (true);
