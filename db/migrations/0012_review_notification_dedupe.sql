-- A reminder is a review-cycle invitation, not a stale execution instruction.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS review_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notification_review_key_unique
ON notifications(review_key) WHERE review_key IS NOT NULL;
