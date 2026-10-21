#!/bin/sh
# Builds the working tree (or the directory given) into ~/sw5e-plain and starts it on 127.0.0.1:5002 WITHOUT the showcase world, on the
# sw5e_test database: a copy for running the play-through (e2e/play.mjs) as it plays on a normal world, and for the user to try changes on
# (it has the test menu: VITE_TEST_MENU). Reached over the tailnet at https://sw5e.tailb1e5d7.ts.net:10000 (tailscale serve --bg --https=10000 http://127.0.0.1:5002).
# Usage: sh deploy/test-plain.sh [dir]
set -e
SRC=/home/ubuntu/SW5e-Proper
FROM=${1:-$SRC}
DST=/home/ubuntu/sw5e-plain
rm -rf "$DST.tmp"; mkdir -p "$DST.tmp"
rsync -a --delete --exclude node_modules --exclude dist --exclude .git --exclude e2e/out "$FROM/" "$DST.tmp/"
ln -s "$SRC/node_modules" "$DST.tmp/node_modules"
rm -rf "$DST"; mv "$DST.tmp" "$DST"
# VITE_TEST_MENU=1 puts the test (god-mode) tab in this build; the build the game is played on (5000) never has it
(cd "$DST" && VITE_TEST_MENU=1 npm run build >/tmp/sw5e-plain-build.log 2>&1) || { tail -20 /tmp/sw5e-plain-build.log; exit 1; }
systemctl --user stop sw5e-plain 2>/dev/null || true
systemctl --user reset-failed sw5e-plain 2>/dev/null || true
systemd-run --user --unit sw5e-plain --working-directory="$DST" \
  sh -c "set -a; . $SRC/.env; set +a; export NODE_ENV=production PORT=5002 DATABASE_URL=\$(node -e 'const u=new URL(process.env.DATABASE_URL); u.pathname=\"/sw5e_test\"; console.log(u.toString())'); exec /usr/bin/node dist/index.js" >/dev/null
sleep 4
curl -s -o /dev/null -w "plain copy on 5002: %{http_code}\n" http://127.0.0.1:5002/
