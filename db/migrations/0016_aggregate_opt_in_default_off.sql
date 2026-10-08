-- Contributing to community statistics is opt-in for new accounts. Existing accounts keep the
-- choice they already have; only the default for rows created from now on changes.
ALTER TABLE users ALTER COLUMN anonymous_aggregate_opt_in SET DEFAULT false;
