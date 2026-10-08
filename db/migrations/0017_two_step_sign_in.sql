-- Optional two-step sign-in (authenticator app). A secret is stored encrypted as soon as setup
-- starts but only counts once mfa_enabled_at is set by a confirmed code, so a half-finished setup
-- can never lock anyone out. mfa_last_step blocks replay of an accepted code; recovery codes are
-- stored as SHA-256 hashes and removed when used.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret_encrypted text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_last_step bigint NOT NULL DEFAULT -1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_recovery_hashes text[] NOT NULL DEFAULT '{}';
