#!/usr/bin/env bash
# Blue-green deploy for the Yjs WebSocket relay. Run this ON the droplet, from
# networking/websocket, after the new code is in place (there is no usable git checkout
# on the box — code is shipped in from a local `git archive`; see README.md).
#
# The relay runs on one of two ports, 47964 and 47965. Caddy reverse-proxies exactly one
# of them; the other is idle. A deploy brings the new code up on the idle port, proves it
# there, and only then moves Caddy.
#
#   ./scripts/deploy.sh stage     # bring new code up on the idle port + smoke-test it.
#                                 # Touches nothing that serves users. Safe any time.
#   ./scripts/deploy.sh flip      # point Caddy at the staged port. Leaves the old one
#                                 # RUNNING, so rollback is instant.
#   ./scripts/deploy.sh rollback  # point Caddy back. Only works before `drain`.
#   ./scripts/deploy.sh drain     # stop the old instance. Do this once you're happy.
#   ./scripts/deploy.sh status    # what's live, what's idle, health of both.
#
# WHY FLIP AND DRAIN ARE SEPARATE — the rollback window is the whole point.
#
# A Caddy graceful reload does not migrate established connections: after `flip`, players
# already connected stay pinned to the OLD instance while new connections land on the new
# one. Relay instances share no state (`docs` is per-process), so for that window two
# players in one room can be on different instances and not see each other. Yjs is a CRDT,
# so this converges the moment they land on the same instance again — it is a transient
# split, not corruption, and it is the same divergence the app already absorbs when a
# player's wifi drops. `drain` ends it by kicking the old instance's clients onto the new
# one. So: flip, verify, drain promptly. Don't leave it flipped-but-not-drained for long.
set -euo pipefail

SVC_DIR="${SVC_DIR:-/root/aura/networking/websocket}"
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
PM2="${PM2:-/root/aura/node_modules/pm2/bin/pm2}"
BLUE=47964
GREEN=47965
# pm2's own interpreter is nvm's node; keep npm/node consistent with it.
if [ -d /root/.nvm/versions/node ]; then
  PATH="$(printf '%s' /root/.nvm/versions/node/*/bin | tr ' ' ':'):$PATH"
  export PATH
fi

cd "$SVC_DIR"

app_for()      { echo "y-websocket-$1"; }
app_exists()   { "$PM2" describe "$1" >/dev/null 2>&1; }
# The port Caddy currently proxies. Scoped to the relay ports so it can't match the
# card-search API's own `localhost:8000` upstream in the same site block.
live_port()    { grep -oE "reverse_proxy localhost:($BLUE|$GREEN)" "$CADDYFILE" | grep -oE "$BLUE|$GREEN" | head -1; }
other_port()   { [ "$1" = "$BLUE" ] && echo "$GREEN" || echo "$BLUE"; }
# Plain-text `okay` is the stock binary; JSON is ours. This is the only way to tell them apart.
health_of()    { curl -s --max-time 5 "http://127.0.0.1:$1/health" 2>/dev/null || echo "(unreachable)"; }

require_live() {
  local live; live="$(live_port)"
  [ -n "$live" ] || { echo "ERROR: no relay upstream ($BLUE|$GREEN) found in $CADDYFILE" >&2; exit 1; }
  echo "$live"
}

cmd_stage() {
  local live idle app
  live="$(require_live)"; idle="$(other_port "$live")"; app="$(app_for "$idle")"
  echo "== live=$live (untouched) -> staging new code on idle=$idle =="

  echo "== install deps (this directory has its own node_modules) =="
  npm ci --omit=dev

  # Start from a clean slate: a leftover idle app from a previous aborted deploy would
  # otherwise keep serving old code and pass every check below.
  if app_exists "$app"; then
    echo "== removing leftover $app from a previous deploy =="
    "$PM2" delete "$app" >/dev/null
  fi

  echo "== starting $app =="
  RELAY_PORT="$idle" "$PM2" start ./ecosystem.config.cjs

  echo "== waiting for :$idle to answer =="
  curl --retry 30 --retry-connrefused --retry-delay 1 -sf "http://127.0.0.1:$idle/health" >/dev/null \
    || { echo "ERROR: :$idle never came up. Still serving :$live." >&2; "$PM2" logs "$app" --lines 20 --nostream; "$PM2" delete "$app" >/dev/null; exit 1; }

  # The crash-loop signature from the last two failed deploys: pm2 restarting a process
  # that boots, binds nothing, and exits silently. A healthy relay restarts zero times.
  sleep 3
  local restarts
  restarts="$("$PM2" jlist | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const a=JSON.parse(d).find(x=>x.name===process.argv[1]);console.log(a?a.pm2_env.restart_time:"?")})' "$app")"
  if [ "$restarts" != "0" ]; then
    echo "ERROR: $app has restarted $restarts times — that's the never-listened crash-loop. Aborting; still serving :$live." >&2
    "$PM2" logs "$app" --lines 20 --nostream
    "$PM2" delete "$app" >/dev/null
    exit 1
  fi
  echo "== $app is up with 0 restarts =="

  if ! node scripts/smoke_test.mjs "$idle"; then
    echo "ERROR: smoke test failed on :$idle — NOT flipping. Still serving :$live (old code)." >&2
    "$PM2" delete "$app" >/dev/null
    exit 1
  fi

  echo
  echo "== staged. :$idle is healthy and evicting rooms; Caddy still points at :$live. =="
  echo "   Next:  ./scripts/deploy.sh flip"
}

cmd_flip() {
  local live idle
  live="$(require_live)"; idle="$(other_port "$live")"

  case "$(health_of "$idle")" in
    *'"status":"ok"'*) ;;
    *) echo "ERROR: :$idle is not healthy — run 'stage' first. Refusing to flip." >&2; exit 1 ;;
  esac

  echo "== flipping Caddy $live -> $idle =="
  cp "$CADDYFILE" "$CADDYFILE.bak.$(date +%s)"
  sed -i "s#reverse_proxy localhost:$live#reverse_proxy localhost:$idle#" "$CADDYFILE"
  caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null
  systemctl reload caddy

  echo "== now serving :$idle. :$live is STILL RUNNING and warm. =="
  echo "   Rollback (instant, only until you drain):  ./scripts/deploy.sh rollback"
  echo "   Once happy — do this promptly, it ends the split window:"
  echo "                                              ./scripts/deploy.sh drain"
}

cmd_rollback() {
  local live idle
  live="$(require_live)"; idle="$(other_port "$live")"
  if ! app_exists "$(app_for "$idle")" && ! app_exists y-websocket; then
    echo "ERROR: nothing is running on :$idle — it was already drained. This is not a re-flip anymore;" >&2
    echo "       bring an instance up on :$idle first (./scripts/deploy.sh stage)." >&2
    exit 1
  fi
  echo "== rolling Caddy back $live -> $idle =="
  cp "$CADDYFILE" "$CADDYFILE.bak.$(date +%s)"
  sed -i "s#reverse_proxy localhost:$live#reverse_proxy localhost:$idle#" "$CADDYFILE"
  caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null
  systemctl reload caddy
  echo "== rolled back to :$idle. The bad instance on :$live is still running — inspect it, then:"
  echo "     $PM2 logs $(app_for "$live")"
  echo "     $PM2 delete $(app_for "$live")"
}

cmd_drain() {
  local live idle
  live="$(require_live)"; idle="$(other_port "$live")"
  echo "== draining the instance on :$idle (Caddy serves :$live) =="
  # On the first blue-green deploy the old instance is the legacy pm2 app `y-websocket`,
  # running the stock binary from the repo root. After that it's always y-websocket-<port>.
  for app in "$(app_for "$idle")" y-websocket; do
    if app_exists "$app"; then
      echo "   stopping $app"
      "$PM2" delete "$app" >/dev/null
    fi
  done
  "$PM2" save
  echo "== drained. Only :$live is running, and pm2 will bring it back on reboot. =="
  "$PM2" list
}

cmd_status() {
  local live idle
  live="$(require_live)"; idle="$(other_port "$live")"
  echo "Caddy serves : $live"
  echo "idle port    : $idle"
  echo
  echo ":$live  (live) -> $(health_of "$live")"
  echo ":$idle  (idle) -> $(health_of "$idle")"
  echo
  echo "  JSON = our code (room eviction on). Plain 'okay' = the STOCK binary; the leak is live."
  echo
  "$PM2" list
}

case "${1:-}" in
  stage)    cmd_stage ;;
  flip)     cmd_flip ;;
  rollback) cmd_rollback ;;
  drain)    cmd_drain ;;
  status)   cmd_status ;;
  *) sed -n '2,30p' "$0"; exit 2 ;;
esac
