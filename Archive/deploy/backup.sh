#!/usr/bin/env bash
# Dumps the database to ~/sw5e-backups and keeps the newest 14 dumps. Run nightly by sw5e-backup.timer.
set -euo pipefail
umask 077
cd /home/ubuntu/SW5e-Proper
set -a; . ./.env; set +a
out=/home/ubuntu/sw5e-backups/sw5e-$(date +%Y%m%d-%H%M%S).sql.gz
pg_dump "$DATABASE_URL" | gzip > "$out"
ls -1t /home/ubuntu/sw5e-backups/sw5e-*.sql.gz | tail -n +15 | xargs -r rm --
echo "backup written: $out ($(du -h "$out" | cut -f1))"
