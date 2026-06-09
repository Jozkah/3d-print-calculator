-- =============================================================================
-- Row-Level Security (RLS) policies
-- =============================================================================
-- IMPORTANT context:
--   This app talks to Supabase with the PUBLIC anon key and ships with NO login
--   screen. The anon key is embedded in the browser bundle, so without RLS
--   ANYONE who opens the site can read and write every table.
--
--   RLS is the only thing that protects your data. The policies below grant
--   access to LOGGED-IN users only (the `authenticated` role) and deny `anon`.
--   That means you must add Supabase Auth (e.g. email magic-link) to your
--   deployment, otherwise the app's queries will be denied once RLS is on.
--
-- Choose one of the two models below, then run this file.
-- =============================================================================

-- ---- MODEL A (recommended): authenticated users only ------------------------
-- Anyone you let sign in gets full access; the public/anon role is locked out.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'global_settings','printers','filaments','laser_materials',
    'clients','quotes','quote_headers','quote_parts','imported_csv_files'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_authenticated_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      t || '_authenticated_all', t
    );
  END LOOP;
END $$;

-- ---- MODEL B (DANGER): public anon access -----------------------------------
-- Only use this if the deployment is on a trusted/private network and you
-- understand that the anon key grants full read/write to anyone who has it.
-- Uncomment to allow the app to work WITHOUT adding authentication:
--
-- DO $$
-- DECLARE t text;
-- BEGIN
--   FOREACH t IN ARRAY ARRAY[
--     'global_settings','printers','filaments','laser_materials',
--     'clients','quotes','quote_headers','quote_parts','imported_csv_files'
--   ]
--   LOOP
--     EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
--     EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_anon_all', t);
--     EXECUTE format(
--       'CREATE POLICY %I ON %I FOR ALL TO anon USING (true) WITH CHECK (true);',
--       t || '_anon_all', t
--     );
--   END LOOP;
-- END $$;
