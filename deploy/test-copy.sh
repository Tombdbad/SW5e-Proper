#!/bin/sh
# Builds the working tree into ~/sw5e-test and (re)starts it on 127.0.0.1:5001 as the user unit
# sw5e-test, so that changes can be tried and the play-through run (BASE=http://127.0.0.1:5001)
# without rebuilding or restarting the service the user plays on. Same database.
set -e
SRC=/home/ubuntu/SW5e-Proper
DST=/home/ubuntu/sw5e-test
mkdir -p "$DST"
rsync -a --delete --exclude node_modules --exclude dist --exclude .git --exclude e2e/out "$SRC/" "$DST/"
[ -e "$DST/node_modules" ] || ln -s "$SRC/node_modules" "$DST/node_modules"
cd "$DST" && npm run build >/tmp/sw5e-test-build.log 2>&1 || { tail -20 /tmp/sw5e-test-build.log; exit 1; }
systemctl --user stop sw5e-test 2>/dev/null || true
systemctl --user reset-failed sw5e-test 2>/dev/null || true
systemd-run --user --unit sw5e-test --working-directory="$DST" --setenv=NODE_ENV=production --setenv=PORT=5001 \
  sh -c "set -a; . $SRC/.env; set +a; export NODE_ENV=production PORT=5001; exec /usr/bin/node dist/index.js"
sleep 3
curl -s -o /dev/null -w "test copy on 5001: %{http_code}\n" http://127.0.0.1:5001/
