#!/bin/sh
set -eu
set -o pipefail
: "${RESTIC_REPOSITORY:?Off-site restic repository required}"
: "${RESTIC_PASSWORD:?Restic encryption password required}"
: "${PGHOST:?PostgreSQL host required}"
: "${PGPASSWORD:?PostgreSQL password required}"
: "${PGUSER:?PostgreSQL user required}"
: "${PGDATABASE:?PostgreSQL database required}"
# Repository must be pre-initialised by an operator; fail closed instead of
# silently creating a second repository after connectivity/credential failures.
restic snapshots --json >/dev/null
while :; do
  echo "Starting encrypted off-site PostgreSQL snapshot."
  # pg_dump errors must fail the full pipeline: do not upload an empty or partial dump.
  pg_dump --format=custom --no-owner --no-acl |
    restic backup --stdin --stdin-filename strategyos.pgcustom --tag 9sig-production --host 9sig-oracle
  # Never delete snapshots outside our application tag.
  restic forget --tag 9sig-production --host 9sig-oracle --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
  date +%s > /backup-status/last-success
  echo "Encrypted snapshot and retention succeeded."
  sleep 86400
done
