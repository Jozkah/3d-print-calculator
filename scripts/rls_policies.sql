-- =============================================================================
-- Row-Level Security (RLS) policies — authenticated users only
-- =============================================================================
-- The app requires sign-in (Supabase Auth) and every route is guarded by
-- middleware. These policies are the database-side half of that: they enable
-- RLS on every table and grant full access to the `authenticated` role only.
-- The public `anon` role gets NO access — anonymous use of the REST API with
-- the publishable anon key is not supported.
--
-- Model: single-user / small-team. Any signed-in user can read and write all
-- rows (no per-user scoping). Create accounts in the Supabase dashboard under
-- Authentication → Users; there is no public sign-up.
--
-- Run this file once against your database (Supabase SQL editor). It is
-- idempotent. New deployments that use scripts/schema.sql already get the
-- same policies; this file exists for upgrading existing databases.
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'global_settings','printers','filaments','laser_materials',
    'clients','quotes','quote_headers','quote_parts','imported_csv_files'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);

    -- Drop the legacy anon policy if a previous deployment created it.
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_anon_all', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_authenticated_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      t || '_authenticated_all', t
    );
  END LOOP;
END $$;
