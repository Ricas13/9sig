-- Marks a notification once its channel deliveries have been created (possibly none, for in-app-only
-- plans). The worker used to find work with "no delivery rows yet", which never became false for
-- in-app-only users, so their notifications filled the worker's fixed-size window forever and newer
-- notifications for paid users were never picked up.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS deliveries_created_at timestamptz;

-- Anything that already has deliveries, or is old enough to have been through the worker, is done.
-- Recent notifications with nothing yet stay NULL so they are processed on the next run.
UPDATE notifications n
SET deliveries_created_at = now()
WHERE deliveries_created_at IS NULL
  AND (EXISTS (SELECT 1 FROM notification_deliveries d WHERE d.notification_id = n.id)
       OR n.created_at < now() - interval '3 days');

CREATE INDEX IF NOT EXISTS notifications_pending_deliveries_idx
  ON notifications (created_at)
  WHERE deliveries_created_at IS NULL;
