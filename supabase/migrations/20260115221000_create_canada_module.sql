-- Canada module: strict schema, sources registry, fetch logs, seed stats, and saved searches

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE canada_program_type AS ENUM ('VISITING_RESEARCH', 'INTERNSHIP', 'PHD');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE canada_funding_type AS ENUM ('FUNDED', 'PARTIALLY_FUNDED', 'EXTERNAL_FUNDING_OK', 'SELF_FUNDED_OK', 'UNKNOWN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE canada_tri_state AS ENUM ('YES', 'NO', 'UNKNOWN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE canada_confidence AS ENUM ('HIGH', 'MEDIUM', 'LOW');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE canada_opportunity_status AS ENUM ('ACTIVE', 'EXPIRED', 'BLOCKED', 'NEEDS_REVIEW');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE canada_source_strategy AS ENUM ('GOOGLE_SEED', 'CURATED', 'OPPORTUNISTIC');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE canada_fetch_action AS ENUM ('DISCOVER', 'VERIFY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE canada_fetch_status AS ENUM ('OK', 'NOT_MODIFIED', 'BLOCKED', 'ERROR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE FUNCTION set_updated_at() RETURNS trigger AS $set_updated_at$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $set_updated_at$ LANGUAGE plpgsql;
EXCEPTION
  WHEN duplicate_function THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS canada_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_type canada_program_type NOT NULL,
  strategy canada_source_strategy NOT NULL,
  seed_key text,
  base_url text NOT NULL,
  allow_paths text[] NOT NULL DEFAULT '{}'::text[],
  block_paths text[] NOT NULL DEFAULT '{}'::text[],
  max_depth int NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  respect_robots boolean NOT NULL DEFAULT true,
  max_requests_per_run int NOT NULL DEFAULT 20,
  min_delay_ms int NOT NULL DEFAULT 750,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canada_sources_base_url_nonempty CHECK (length(trim(base_url)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS canada_sources_unique ON canada_sources (program_type, strategy, base_url);
CREATE INDEX IF NOT EXISTS canada_sources_active_idx ON canada_sources (active);

CREATE TRIGGER canada_sources_set_updated_at
BEFORE UPDATE ON canada_sources
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS canada_opportunity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_type canada_program_type NOT NULL,

  country text NOT NULL DEFAULT 'Canada',
  province text,
  city text,

  institution_name text NOT NULL,
  department text,
  lab_group text,

  title_clean text NOT NULL,
  nutshell_15_words text NOT NULL,

  funding_type canada_funding_type NOT NULL DEFAULT 'UNKNOWN',
  funding_confidence canada_confidence NOT NULL DEFAULT 'LOW',
  funding_evidence text,

  international_allowed canada_tri_state NOT NULL DEFAULT 'UNKNOWN',
  eligibility_confidence canada_confidence NOT NULL DEFAULT 'LOW',
  eligibility_notes text,
  eligibility_evidence text,

  start_term text,

  deadline_date date,
  deadline_confidence canada_confidence NOT NULL DEFAULT 'LOW',
  deadline_evidence text,

  application_url text NOT NULL,
  source_url text NOT NULL,
  canonical_url text NOT NULL,

  last_verified_at timestamptz NOT NULL DEFAULT now(),
  freshness_score int NOT NULL DEFAULT 0,

  status canada_opportunity_status NOT NULL DEFAULT 'ACTIVE',
  status_reason text,

  content_hash text NOT NULL,
  page_last_modified timestamptz,
  etag text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT canada_opportunity_country_check CHECK (country = 'Canada'),
  CONSTRAINT canada_opportunity_institution_nonempty CHECK (length(trim(institution_name)) > 0),
  CONSTRAINT canada_opportunity_title_nonempty CHECK (length(trim(title_clean)) > 0),
  CONSTRAINT canada_opportunity_nutshell_nonempty CHECK (length(trim(nutshell_15_words)) > 0),
  CONSTRAINT canada_opportunity_application_url_nonempty CHECK (length(trim(application_url)) > 0),
  CONSTRAINT canada_opportunity_source_url_nonempty CHECK (length(trim(source_url)) > 0),
  CONSTRAINT canada_opportunity_canonical_url_nonempty CHECK (length(trim(canonical_url)) > 0),
  CONSTRAINT canada_opportunity_freshness_score_range CHECK (freshness_score >= 0 AND freshness_score <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS canada_opportunity_unique ON canada_opportunity (program_type, canonical_url);
CREATE INDEX IF NOT EXISTS canada_opportunity_type_deadline_idx ON canada_opportunity (program_type, deadline_date);
CREATE INDEX IF NOT EXISTS canada_opportunity_last_verified_idx ON canada_opportunity (last_verified_at DESC);
CREATE INDEX IF NOT EXISTS canada_opportunity_institution_idx ON canada_opportunity (institution_name);

CREATE TRIGGER canada_opportunity_set_updated_at
BEFORE UPDATE ON canada_opportunity
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS canada_fetch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action canada_fetch_action NOT NULL,
  status canada_fetch_status NOT NULL,
  program_type canada_program_type,

  source_id uuid REFERENCES canada_sources(id) ON DELETE SET NULL,

  canonical_url text,
  fetched_url text NOT NULL,

  fetched_at timestamptz NOT NULL DEFAULT now(),
  http_status int,
  elapsed_ms int,
  response_bytes int,

  etag text,
  page_last_modified timestamptz,
  content_hash text,

  blocked_reason text,
  error_message text,

  CONSTRAINT canada_fetch_logs_fetched_url_nonempty CHECK (length(trim(fetched_url)) > 0)
);

CREATE INDEX IF NOT EXISTS canada_fetch_logs_fetched_at_idx ON canada_fetch_logs (fetched_at DESC);
CREATE INDEX IF NOT EXISTS canada_fetch_logs_source_idx ON canada_fetch_logs (source_id);
CREATE INDEX IF NOT EXISTS canada_fetch_logs_canonical_idx ON canada_fetch_logs (canonical_url);

CREATE TABLE IF NOT EXISTS canada_seed_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_key text NOT NULL,
  program_type canada_program_type NOT NULL,
  strategy canada_source_strategy NOT NULL,

  runs_count int NOT NULL DEFAULT 0,
  urls_found int NOT NULL DEFAULT 0,
  accepted int NOT NULL DEFAULT 0,
  blocked int NOT NULL DEFAULT 0,
  expired int NOT NULL DEFAULT 0,

  last_run_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT canada_seed_stats_seed_key_nonempty CHECK (length(trim(seed_key)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS canada_seed_stats_unique ON canada_seed_stats (seed_key, program_type, strategy);

CREATE TRIGGER canada_seed_stats_set_updated_at
BEFORE UPDATE ON canada_seed_stats
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS canada_saved_search (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  program_types canada_program_type[] NOT NULL DEFAULT '{}'::canada_program_type[],
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  notify_email text,
  notify_webhook_url text,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canada_saved_search_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT canada_saved_search_filters_object CHECK (jsonb_typeof(filters) = 'object')
);

CREATE INDEX IF NOT EXISTS canada_saved_search_user_idx ON canada_saved_search (user_id);
CREATE INDEX IF NOT EXISTS canada_saved_search_enabled_idx ON canada_saved_search (enabled);

CREATE TRIGGER canada_saved_search_set_updated_at
BEFORE UPDATE ON canada_saved_search
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE canada_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE canada_opportunity ENABLE ROW LEVEL SECURITY;
ALTER TABLE canada_fetch_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE canada_seed_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE canada_saved_search ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access: canada_sources"
    ON canada_sources
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access: canada_opportunity"
    ON canada_opportunity
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access: canada_fetch_logs"
    ON canada_fetch_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access: canada_seed_stats"
    ON canada_seed_stats
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users manage own saved searches"
    ON canada_saved_search
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access: canada_saved_search"
    ON canada_saved_search
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
