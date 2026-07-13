# Heartbeat monitoring

Liveness alerting for the two services on the droplet — the **y-websocket relay** (pm2,
`:47964`) and the **card-search API** (systemd, `:8000`). One systemd timer per service
pings [Healthchecks.io](https://healthchecks.io) every minute, **but only when the
service actually answers**.

## Why this exists

We had **no liveness monitoring at all**. The DigitalOcean alerts on the box are memory
>80% and disk >80% — *resource* alerts. On 2026-07-11 pm2 died and stayed dead after a
reboot (no boot unit), and memory looked **excellent** the entire time, so nothing fired.
The outage was found by a human noticing a red connection dot. The relay is the default
transport, so that was every user.

## Why a heartbeat and not an external prober (UptimeRobot, DO uptime checks, …)

**Because nothing automated can reach the box from outside.** Cloudflare bot-challenges
every non-browser client on `digitalocean-ws-ipv4.aura0.app`. Measured:

| client | result |
|---|---|
| `curl` | 403 `cf-mitigated: challenge` |
| `curl` with a Chrome User-Agent | 403 |
| real HTTP/1.1 WebSocket upgrade | 403 |
| DigitalOcean uptime check | DOWN from every region |
| **headless** Chromium | 403 |
| headed Chromium / real Chrome | **200** |

It is fingerprinting the TLS handshake, not the headers — which is why swapping vendors
does not help, and why a browser-based synthetic (Checkly and friends) does not either.
The origin can't be probed directly around Cloudflare, because Caddy holds a certificate
for exactly one hostname and that hostname is the proxied one.

So we ping **outward** instead. This sidesteps Cloudflare completely, needs no DNS change,
no WAF exception, and no origin exposure.

Do not "improve" this into an external HTTP check. It cannot work.

## How the three failure modes map

The probe is local (`127.0.0.1`), so a green check proves *the service* is alive — not
merely that the box is:

| what breaks | what happens | you find out |
|---|---|---|
| service dead | local probe fails → we ping `/fail` | ~1 min |
| box or network dead | no ping is sent at all → silence trips the grace timer | ~grace period |
| healthy | ping | check stays green |

The middle row is the dead-man's-switch, and it's the one that would have caught
2026-07-11.

## Install

Per service, on the droplet, as root. Idempotent — re-run freely; re-running with a new
ping URL rotates it in place.

```sh
cd <repo>/ops/heartbeat

./install-heartbeat.sh relay    http://127.0.0.1:47964/         https://hc-ping.com/<uuid>
./install-heartbeat.sh card-api http://127.0.0.1:8000/v1/health https://hc-ping.com/<uuid>
```

Use a **separate Healthchecks check per service** — one combined check can only tell you
"something on the box broke", these tell you *which*.

On healthchecks.io set **Period = 1 minute** and **Grace = 5 minutes** to match the timer.

The installer fires one tick immediately and fails loudly if the probe doesn't pass, so a
typo'd URL surfaces then rather than as a phantom 3am outage.

### Surviving reboots and new boxes

`systemctl enable` on the timer *is* the reboot story — there is no hand-run process to
forget, which is precisely the pm2 mistake. The timer waits `OnBootSec=2min` before its
first tick so a reboot doesn't page you for a service that is merely still starting.

For a **new box**, this is one command per service. It can also be driven from cloud-init
at droplet-create time (`doctl compute droplet create --user-data-file …`) so the box
provisions its own monitoring before anyone logs in.

⚠️ The droplet has **no git credentials for `aura0`** (it's private, and `/root/aura` is a
checkout of the older, public `kenwuuu/aura`). So a fresh box can't `git pull` this — copy
the directory across the same way `mtg_card_search` does, by rsync-ing a `git archive`.
That's a pre-existing gap; the heartbeat just inherits it.

## Files

| file | role |
|---|---|
| `aura-heartbeat.sh` | one tick: probe locally, then ping or `/fail`. Installed to `/usr/local/bin`. |
| `aura-heartbeat@.service` | oneshot, `%i` = `relay` \| `card-api`. Reads `/etc/aura/heartbeat-%i.env`. |
| `aura-heartbeat@.timer` | every minute, `WantedBy=timers.target`. |
| `install-heartbeat.sh` | idempotent installer. |

## The ping URL is a secret

`https://hc-ping.com/<uuid>` is a **capability URL**: anyone holding it can forge a
heartbeat and keep the check green straight through a real outage. It is therefore kept
out of git, written to `/etc/aura/heartbeat-<instance>.env` at `0600`, and never logged —
not even on the failure path.

## Verify

```sh
systemctl list-timers 'aura-heartbeat@*'      # next/last run
journalctl -u aura-heartbeat@relay -n 20      # probe results
systemctl list-units --failed                 # a failing probe shows up here too
```

To confirm **alerting actually reaches you**, ping the fail endpoint by hand:

```sh
curl -fsS "https://hc-ping.com/<uuid>/fail"
```

Don't test by stopping pm2. There's no reason to take production down to prove a monitor
works.
