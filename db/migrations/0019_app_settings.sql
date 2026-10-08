-- Operator settings managed from the admin screen. Every value is encrypted with the application
-- encryption key (which stays an environment variable, as it cannot be stored beside what it
-- protects). A row overrides the environment variable of the same name; deleting the row falls back.
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value_encrypted text NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- First-run setup: a one-time code (stored as a hash) lets whoever can read the server log create
-- the first administrator from the browser. Unused once any administrator exists.
CREATE TABLE IF NOT EXISTS setup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);
