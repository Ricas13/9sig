-- Devices (browser + operating system) an account has signed in from, so a sign-in from somewhere
-- new can be reported to the owner. No IP addresses or full user agents are stored.
CREATE TABLE IF NOT EXISTS sign_in_devices (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_key text NOT NULL,
  label text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_key)
);
