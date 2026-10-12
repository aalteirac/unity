-- Dummy Unity Analytics app. Contains no provider data; the Unity dataset
-- is delivered separately through its own private data listing.
CREATE APPLICATION ROLE IF NOT EXISTS app_user;

CREATE OR ALTER VERSIONED SCHEMA core;
GRANT USAGE ON SCHEMA core TO APPLICATION ROLE app_user;

CREATE OR REPLACE PROCEDURE core.hello()
  RETURNS STRING
  LANGUAGE SQL
  AS $$ BEGIN RETURN 'Unity Analytics dummy app is installed.'; END; $$;
GRANT USAGE ON PROCEDURE core.hello() TO APPLICATION ROLE app_user;

CREATE OR REPLACE VIEW core.sample_metrics AS
  SELECT * FROM VALUES
    ('Daily active players', 12840),
    ('Sessions per player', 3),
    ('Crash-free sessions %', 99)
  AS t(metric, value);
GRANT SELECT ON VIEW core.sample_metrics TO APPLICATION ROLE app_user;

CREATE OR ALTER VERSIONED SCHEMA ui;
GRANT USAGE ON SCHEMA ui TO APPLICATION ROLE app_user;
CREATE OR REPLACE STREAMLIT ui.home
  FROM '/streamlit'
  MAIN_FILE = '/home.py';
GRANT USAGE ON STREAMLIT ui.home TO APPLICATION ROLE app_user;
