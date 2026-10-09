-- A strategy version cannot be published until a person has signed off its specification card and
-- recorded where its independently computed golden tests live (CLAUDE.md). One attestation per version.
CREATE TABLE IF NOT EXISTS strategy_version_attestations (
  strategy_version_id uuid PRIMARY KEY REFERENCES strategy_versions(id) ON DELETE CASCADE,
  spec_card text NOT NULL CHECK (spec_card ~ '^docs/strategy-specs/[a-z0-9-]+\.md$'),
  golden_tests text NOT NULL CHECK (length(golden_tests) BETWEEN 3 AND 300),
  notes text NOT NULL DEFAULT '',
  attested_by uuid NOT NULL REFERENCES users(id),
  attested_at timestamptz NOT NULL DEFAULT now()
);
