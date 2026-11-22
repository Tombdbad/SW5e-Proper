#!/bin/sh
# Runs the play-through on a copy WITHOUT the showcase world (port 5002, the sw5e_test database) for the working tree and, to compare,
# for an older commit: sh deploy/compare-e2e.sh [older-commit]. Logs: ~/e2e-head.log and ~/e2e-base.log. Run it as a user unit
# (systemd-run --user --unit sw5e-compare sh deploy/compare-e2e.sh) so that it survives a dropped session; it takes one to two hours.
set -e
SRC=/home/ubuntu/SW5e-Proper
BASE_COMMIT=${1:-6373324}
PORT=5002
run() { # $1 label, $2 source directory
  DST=/home/ubuntu/sw5e-plain
  rm -rf "$DST.tmp"; mkdir -p "$DST.tmp"
  rsync -a --delete --exclude node_modules --exclude dist --exclude .git --exclude e2e/out "$2/" "$DST.tmp/"
  ln -s "$SRC/node_modules" "$DST.tmp/node_modules"
  rm -rf "$DST"; mv "$DST.tmp" "$DST"
  (cd "$DST" && npm run build >/tmp/sw5e-plain-build.log 2>&1) || { tail -20 /tmp/sw5e-plain-build.log; return 1; }
  systemctl --user stop sw5e-plain 2>/dev/null || true
  systemctl --user reset-failed sw5e-plain 2>/dev/null || true
  systemd-run --user --unit sw5e-plain --working-directory="$DST" \
    sh -c "set -a; . $SRC/.env; set +a; export NODE_ENV=production PORT=$PORT DATABASE_URL=\$(node -e 'const u=new URL(process.env.DATABASE_URL); u.pathname=\"/sw5e_test\"; console.log(u.toString())'); exec /usr/bin/node dist/index.js" >/dev/null
  sleep 5
  (cd "$SRC" && BASE=http://127.0.0.1:$PORT OUT=/home/ubuntu/SW5e-Proper/e2e/out/plain-$1 node e2e/play.mjs >/home/ubuntu/e2e-$1.log 2>&1) || true
  systemctl --user stop sw5e-plain 2>/dev/null || true
}
run head "$SRC"
OLD=/home/ubuntu/sw5e-base-src
rm -rf "$OLD"; mkdir -p "$OLD"
(cd "$SRC" && git archive "$BASE_COMMIT" | tar -x -C "$OLD")
run base "$OLD"
echo "done: head $(grep -c '^PASS' /home/ubuntu/e2e-head.log) pass $(grep -c '^FAIL' /home/ubuntu/e2e-head.log) fail; base $(grep -c '^PASS' /home/ubuntu/e2e-base.log) pass $(grep -c '^FAIL' /home/ubuntu/e2e-base.log) fail" > /home/ubuntu/e2e-compare.txt
