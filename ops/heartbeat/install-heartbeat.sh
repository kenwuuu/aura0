#!/usr/bin/env bash
#
# Idempotent installer for one Aura heartbeat instance. Re-running is safe and is the
# point: provisioning a new box, or rotating a ping URL, is one command per service.
#
#   ./install-heartbeat.sh relay    http://127.0.0.1:47964/         https://hc-ping.com/<uuid>
#   ./install-heartbeat.sh card-api http://127.0.0.1:8000/v1/health https://hc-ping.com/<uuid>
#
# See README.md for why this is a push heartbeat and not an external prober.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage: install-heartbeat.sh <instance> <health-url> <hc-ping-url>

  instance      short name for the watched service: relay | card-api
  health-url    LOCAL health endpoint to probe (must be 127.0.0.1 — see README)
  hc-ping-url   Healthchecks.io ping URL, https://hc-ping.com/<uuid>

Re-run with a new ping URL to rotate it in place.
EOF
  exit 64
}

[ $# -eq 3 ] || usage
INSTANCE=$1
HEALTH_URL=$2
HC_PING_URL=$3

[[ $INSTANCE =~ ^[a-z0-9-]+$ ]] || { echo "instance must match [a-z0-9-]+" >&2; exit 64; }
[[ $HC_PING_URL =~ ^https://  ]] || { echo "hc-ping-url must be https://" >&2; exit 64; }

# The probe must be local. Probing the public hostname would test Cloudflare and Caddy,
# not the service — and would fail anyway, since Cloudflare 403s every automated client.
[[ $HEALTH_URL =~ ^http://(127\.0\.0\.1|localhost)[:/] ]] || {
  echo "health-url must point at 127.0.0.1/localhost, got: $HEALTH_URL" >&2
  exit 64
}

[ "$(id -u)" -eq 0 ] || { echo "must run as root" >&2; exit 1; }

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install -m 0755 "$SRC/aura-heartbeat.sh"       /usr/local/bin/aura-heartbeat.sh
install -m 0644 "$SRC/aura-heartbeat@.service" /etc/systemd/system/aura-heartbeat@.service
install -m 0644 "$SRC/aura-heartbeat@.timer"   /etc/systemd/system/aura-heartbeat@.timer

# 0600: the ping URL is a capability URL. Anyone who reads it can forge a heartbeat and
# keep the check green through a real outage.
install -d -m 0755 /etc/aura
ENV_FILE="/etc/aura/heartbeat-${INSTANCE}.env"
(
  umask 077
  cat > "$ENV_FILE" <<EOF
# Managed by ops/heartbeat/install-heartbeat.sh — re-run it rather than editing by hand.
HEALTH_URL=${HEALTH_URL}
HC_PING_URL=${HC_PING_URL}
EOF
)
chmod 0600 "$ENV_FILE"

systemctl daemon-reload
systemctl enable --now "aura-heartbeat@${INSTANCE}.timer"

# Fire one tick now. A typo'd URL should surface here, not at 3am as a phantom outage.
echo "→ running one heartbeat for '${INSTANCE}'…"
if systemctl start "aura-heartbeat@${INSTANCE}.service"; then
  echo "✅ ${INSTANCE}: probe passed, heartbeat sent — the check should be green now."
else
  echo "❌ ${INSTANCE}: probe FAILED against ${HEALTH_URL} (Healthchecks was told via /fail)." >&2
  echo "   Is the service actually up?  journalctl -u aura-heartbeat@${INSTANCE} -n 20" >&2
  exit 1
fi

systemctl list-timers "aura-heartbeat@${INSTANCE}.timer" --no-pager || true
