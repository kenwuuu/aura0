#!/usr/bin/env bash
# Zero-downtime blue-green deploy for the card-search API.
#
# Run this ON the server, from the service directory, AFTER the new code is in
# place (this repo has no git checkout on the box — code is rsync'd in from a
# `git archive` of staging). It:
#   1. installs deps + rebuilds the index to match the code,
#   2. brings up the IDLE port with the new code,
#   3. smoke-tests it (incl. the CORS check that guards browser card import),
#   4. flips Caddy to it with a graceful reload (no dropped connections),
#   5. drains the previously-live instance.
#
# Requires deploy/mtg-card-search@.service installed as
# /etc/systemd/system/mtg-card-search@.service, and a Caddy site whose /v1/*
# handler reverse-proxies localhost:8000 or localhost:8001.
#
# Rollback is a re-flip: point Caddy back at the previous port (still running the
# old code) and reload — see the failure message printed on smoke-test failure.
set -euo pipefail

SVC_DIR="${SVC_DIR:-/root/aura-api/mtg_card_search}"
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
UNIT="mtg-card-search@"

cd "$SVC_DIR"

echo "== install deps + (re)build index to match code =="
.venv/bin/pip install -q -r requirements.txt
.venv/bin/python3 data_updater.py --build-index

# Which port is Caddy currently serving? Deploy to the other one.
live="$(grep -oE 'localhost:(8000|8001)' "$CADDYFILE" | grep -oE '8000|8001' | head -1)"
[ -n "$live" ] || { echo "ERROR: no localhost:8000/8001 upstream found in $CADDYFILE" >&2; exit 1; }
idle=$([ "$live" = 8000 ] && echo 8001 || echo 8000)
echo "== live=$live  ->  deploying new code to idle=$idle =="

systemctl restart "${UNIT}${idle}"
curl --retry 30 --retry-connrefused --retry-delay 1 -sf "http://localhost:${idle}/v1/health" >/dev/null \
  || { echo "ERROR: idle :${idle} did not come up healthy — aborting, still serving :${live}" >&2; exit 1; }

echo "== smoke-testing idle :${idle} (health, lookups, 404, bulk, CORS) before the flip =="
if ! BASE_URL="http://localhost:${idle}" bash "${SVC_DIR}/scripts/smoke_test.sh"; then
  echo "ERROR: smoke test failed on :${idle} — NOT flipping. Still serving :${live} (old code)." >&2
  systemctl stop "${UNIT}${idle}" || true
  exit 1
fi

echo "== flip Caddy ${live} -> ${idle} (graceful reload, zero dropped connections) =="
cp "$CADDYFILE" "${CADDYFILE}.bak.$(date +%s)"
sed -i "s#localhost:${live}#localhost:${idle}#" "$CADDYFILE"
caddy validate --config "$CADDYFILE" --adapter caddyfile
systemctl reload caddy

echo "== drain old instance :${live} =="
systemctl stop "${UNIT}${live}"

# Keep the boot unit consistent with what Caddy serves: enable the now-live
# instance and disable the drained one. Without this, a reboot would start the
# other port and Caddy would 502 against a dead upstream.
systemctl enable "${UNIT}${idle}" >/dev/null 2>&1 || true
systemctl disable "${UNIT}${live}" >/dev/null 2>&1 || true

echo "== done — serving new code on :${idle}."
echo "   Rollback: sed Caddy back to localhost:${live}, 'systemctl start ${UNIT}${live}', reload caddy."
