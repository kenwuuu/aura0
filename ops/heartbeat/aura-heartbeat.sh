#!/bin/sh
#
# One heartbeat tick for a single Aura service.
#
# Pings Healthchecks.io ONLY when the service actually answers, so a green check
# proves the service is alive — not merely that the box is. The three failure modes
# map cleanly onto the dead-man's-switch:
#
#   service dead   -> local probe fails -> we ping /fail  -> alert within ~1 min
#   box/net dead   -> no ping is sent   -> silence trips the grace timer
#   healthy        -> ping              -> check stays green
#
# That middle case is the whole reason this is a push (heartbeat) monitor rather than
# an external prober: Cloudflare bot-challenges every automated client on our hostname
# (curl, DigitalOcean's checker, and headless browsers all get 403), so nothing can
# reach the relay from outside. Pinging outward sidesteps that entirely.
#
# Config is injected by the unit via EnvironmentFile=/etc/aura/heartbeat-<instance>.env.
set -u

: "${HEALTH_URL:?HEALTH_URL not set (see /etc/aura/heartbeat-<instance>.env)}"
: "${HC_PING_URL:?HC_PING_URL not set (see /etc/aura/heartbeat-<instance>.env)}"

HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-5}"
PING_TIMEOUT="${PING_TIMEOUT:-10}"

# HC_PING_URL is a capability URL — anyone holding it can forge a heartbeat and mask a
# real outage. Never echo it, not even on failure.
if curl -fsS -m "$HEALTH_TIMEOUT" "$HEALTH_URL" >/dev/null 2>&1; then
  curl -fsS -m "$PING_TIMEOUT" --retry 3 "$HC_PING_URL" >/dev/null 2>&1
  exit 0
fi

echo "health probe FAILED: $HEALTH_URL" >&2
curl -fsS -m "$PING_TIMEOUT" --retry 3 "${HC_PING_URL%/}/fail" >/dev/null 2>&1

# Exit non-zero so the failure is visible locally too — `systemctl list-units --failed`
# and journalctl — and not only in Healthchecks.
exit 1
