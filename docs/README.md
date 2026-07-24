# Aura docs

Project-level documentation. Code-level docs live beside the code they describe
(`CLAUDE.md` files under `src/`, `README.md` inside a module).

## [`deployment/`](./deployment/) — shipping to staging and production

| Doc | What it's for |
| --- | --- |
| [`STAGING.md`](./deployment/STAGING.md) | The `staging` → `master` branch/promotion workflow. Start here. |
| [`DEPLOYMENT_SETUP.md`](./deployment/DEPLOYMENT_SETUP.md) | One-time Cloudflare / GitHub / PostHog wiring. |
| [`DEPLOYMENT_RUNBOOK.md`](./deployment/DEPLOYMENT_RUNBOOK.md) | Day-to-day deploys, health metrics, rollback. |
| [`WORKER_CUTOVER_RUNBOOK.md`](./deployment/WORKER_CUTOVER_RUNBOOK.md) | The Pages → Workers migration and its remaining cleanup. |
| [`SENTRY_CI.md`](./deployment/SENTRY_CI.md) | Sentry auth token availability at build time. |

## [`networking/`](./networking/) — the sync layer

| Doc | What it's for |
| --- | --- |
| [`RELAY_RUNBOOK.md`](./networking/RELAY_RUNBOOK.md) | Operating the y-websocket relay. Ops side of `networking/websocket/README.md`. |
| [`RELAY_HORIZONTAL_SCALING.md`](./networking/RELAY_HORIZONTAL_SCALING.md) | Room affinity and regional routing for a multi-node relay. |
| [`TRANSPORT_UPGRADE.md`](./networking/TRANSPORT_UPGRADE.md) | Designed-but-deferred WebSocket → WebRTC upgrade. |
| [`WEBRTC_SETUP.md`](./networking/WEBRTC_SETUP.md) | Signaling and TURN server setup. |

## [`architecture/`](./architecture/) — contracts and known debt

| Doc | What it's for |
| --- | --- |
| [`responsive.md`](./architecture/responsive.md) | The responsive layout contract every surface follows. Cited from source. |
| [`TECH_DEBT.md`](./architecture/TECH_DEBT.md) | Recorded debt analysis. |

## [`testing/`](./testing/) — test contracts

| Doc | What it's for |
| --- | --- |
| [`e2e.md`](./testing/e2e.md) | Playwright harness-first contract and banned patterns. |

Unit/component conventions live at [`tests/testing-react.md`](../tests/testing-react.md);
PileViewer and dnd-kit mechanics at [`tests/testing.md`](../tests/testing.md).

## [`incidents/`](./incidents/) — postmortems

One file per incident, named `YYYY-MM-DD-slug.md`.
