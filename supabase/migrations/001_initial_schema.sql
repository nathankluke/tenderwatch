-- TenderWatch SaaS – Initial Schema
-- Run this in Supabase SQL Editor (supabase.com → your project → SQL Editor)

-- ─── PROFILES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                text NOT NULL,
  description         text,
  daily_email_enabled boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own profiles" ON profiles
  FOR ALL USING (auth.uid() = user_id);

-- ─── KEYWORDS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS keywords (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword     text NOT NULL,
  category    text NOT NULL DEFAULT 'leistung',  -- 'leistung'|'allgemein'|'firma'
  source      text NOT NULL DEFAULT 'manual',    -- 'manual'|'pdf_extracted'|'tender_extracted'
  approved    boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(profile_id, keyword)
);

ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own keywords" ON keywords
  FOR ALL USING (auth.uid() = user_id);

-- ─── TENDERS (shared, no RLS) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id      text NOT NULL,
  platform         text NOT NULL,
  title            text NOT NULL,
  client           text,
  deadline         date,
  publication_date date,
  description      text,
  summary          text,
  url              text,
  pdf_url          text,
  raw_data         jsonb,
  created_at       timestamptz DEFAULT now(),
  UNIQUE(external_id, platform)
);

-- Tenders are readable by all authenticated users
ALTER TABLE tenders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read tenders" ON tenders
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Service role can write tenders" ON tenders
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_tenders_platform ON tenders(platform);
CREATE INDEX IF NOT EXISTS idx_tenders_created  ON tenders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenders_deadline ON tenders(deadline);

-- ─── TENDER SCORES (per tender per profile) ───────────────────────────────
CREATE TABLE IF NOT EXISTS tender_scores (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id        uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  profile_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score            integer NOT NULL DEFAULT 0,
  matched_keywords text[] DEFAULT '{}',
  scored_at        timestamptz DEFAULT now(),
  UNIQUE(tender_id, profile_id)
);

ALTER TABLE tender_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own scores" ON tender_scores
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_scores_profile ON tender_scores(profile_id, score DESC);

-- ─── TENDER STATUS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tender_status (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id  uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status     text NOT NULL CHECK (status IN ('interested','working_on','dismissed')),
  notes      text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tender_id, user_id)
);

ALTER TABLE tender_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own status" ON tender_status
  FOR ALL USING (auth.uid() = user_id);

-- ─── PDF UPLOADS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pdf_uploads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path        text NOT NULL,
  filename            text NOT NULL,
  extracted_keywords  jsonb DEFAULT '[]',  -- [{keyword, category, approved}]
  status              text DEFAULT 'processing' CHECK (status IN ('processing','pending_approval','approved','error')),
  error_message       text,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE pdf_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own uploads" ON pdf_uploads
  FOR ALL USING (auth.uid() = user_id);

-- ─── SCRAPE RUNS (log) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scrape_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at     timestamptz DEFAULT now(),
  finished_at    timestamptz,
  platform       text,
  tenders_found  integer DEFAULT 0,
  tenders_new    integer DEFAULT 0,
  status         text DEFAULT 'running' CHECK (status IN ('running','success','error')),
  error_message  text
);

-- Readable by authenticated users (so the frontend can show last scan time)
ALTER TABLE scrape_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read scrape runs" ON scrape_runs
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Service role can write scrape runs" ON scrape_runs
  FOR ALL USING (auth.role() = 'service_role');

-- ─── STORAGE BUCKET for PDFs ──────────────────────────────────────────────
-- Run this separately in the Supabase Dashboard → Storage → New bucket
-- Or uncomment if using supabase CLI:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('pdf-uploads', 'pdf-uploads', false);
