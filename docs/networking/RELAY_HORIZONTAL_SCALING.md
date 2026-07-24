# Horizontally Scaling the Yjs WebSocket Relay — Room-Affinity Routing

How to run the self-hosted `y-websocket` relay
(`networking/websocket/server.js`) as a fleet of N servers instead of one box,
without a shared backplane.

Chosen over Cloudflare Durable Objects because DO duration billing accrues while
WebSockets are active, and Aura's rooms stream cursor/awareness traffic
continuously — a fixed-price VM absorbs hundreds of active rooms flat, where DOs
would bill per active room. The one thing DOs gave us for free, `getByName(room)`
routing, we reproduce here.

## The one constraint: room affinity

A `y-websocket` process holds a room's `Y.Doc` in memory and only broadcasts to
sockets connected to **that** process. So every client of a given room must land
on the same server; miss it and two players in the "same" room silently never
see each other. That is the entire problem — satisfy it and no cross-server
coordination is needed.

We satisfy it by **sharding on the room**: each room lives entirely on one
server. No Redis/NATS backplane, because a room never spans servers. (The
backplane alternative — interchangeable servers rebroadcasting to each other —
has no maintained y-websocket adapter, costs more memory and fan-out, and is the
wrong fit. Not pursued.)

The room name is already in the connection URL: `y-websocket` connects to
`serverUrl/<room>`. That makes routing a hash on the URL path, which we can do at
the load balancer (Approach A) or in the client (Approach B).

## Two approaches at a glance

| | Approach A — Nginx consistent hash | Approach B — client-side owner selection |
|---|---|---|
| Routing decision | Load balancer, on the room path | Client, before it opens the socket |
| Client-facing endpoint | One hostname (`ws.aura0.app`) | Per-relay hostnames |
| Source of truth for the ring | Single (the LB) — clients always agree | Distributed — every client must share the same fleet list |
| WS data path | Through the LB (proxies every frame) | Direct to the owning relay (no proxy) |
| TLS | One cert at the LB | One cert per relay |
| Client code | None | ~30 lines (hash + wiring) |
| **Use when** | **Default** — robust, config-only | Only if the LB's data-path cost/latency ever bites |

**Recommendation: start with Approach A.** At ≤6 users/room the LB is nowhere
near a bottleneck, and a single server-side ring means all clients agree with no
coordinated config to keep in sync. Keep Approach B documented as the escape
hatch, not the starting point.

## Approach A — Nginx consistent-hash (recommended)

Config-only. `hash $uri consistent` hashes on the room path (`$uri` is the
normalized path *without* query string, so per-client query params don't affect
the routing), and `consistent` means adding or removing a server remaps only
~1/N of rooms rather than all of them.

```nginx
# --- http {} block ---

# Standard WebSocket upgrade mapping.
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

upstream yjs_relay {
    # Route by room path, so all clients of a room share one backend.
    # `consistent` keeps remapping to ~1/N of rooms when the fleet changes.
    hash $uri consistent;

    # Passive health: after 3 failures in 30s, nginx takes a backend out and
    # its rooms remap to the next node on the ring automatically.
    server 10.0.0.11:47965 max_fails=3 fail_timeout=30s;  # relay-1
    server 10.0.0.12:47965 max_fails=3 fail_timeout=30s;  # relay-2
    server 10.0.0.13:47965 max_fails=3 fail_timeout=30s;  # relay-3
}

# --- server {} block ---
server {
    listen 443 ssl;
    server_name ws.aura0.app;
    # ssl_certificate / ssl_certificate_key ...

    location / {
        proxy_pass         http://yjs_relay;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection $connection_upgrade;
        proxy_set_header   Host       $host;
        proxy_set_header   X-Real-IP  $remote_addr;

        # WebSockets are long-lived — don't apply the default 60s idle timeout.
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }
}
```

Notes:

- **Hash on the room, never the client IP.** A room's 6 players have different
  IPs, so IP-hash would scatter them across servers — the exact failure we're
  avoiding. The room path is the correct key.
- **Client change: none.** Point `VITE_WS_SERVER_URL` at `wss://ws.aura0.app`.
  Routing is invisible to the app.
- **Per-server health/monitoring** should scrape each relay's `/health`
  **directly by IP**, not through the LB — a hashed `/health` request only ever
  hits one backend.
- **The LB is a single ingress.** For real HA, run two LB nodes (DNS round-robin
  or a floating IP); they share no state because the hash is deterministic from
  the same `server` list.

## Approach B — client-side owner selection (the escape hatch)

Keeps the LB out of the WebSocket data path: the client computes the owning
relay and connects to it directly. Uses **rendezvous (highest-random-weight)
hashing** — no ring state, and removing a relay only remaps the rooms that relay
owned.

```ts
// src/infrastructure/networking/relayRouting.ts

/**
 * Compact, dependency-free 53-bit string hash (cyrb53). Good avalanche —
 * enough for rendezvous hashing, not for anything cryptographic.
 */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * The relay fleet. Every client MUST share this list in identical form for
 * routing to agree — serve it from config/env if it changes without a redeploy.
 */
const RELAY_FLEET = [
  'wss://relay-1.aura0.app',
  'wss://relay-2.aura0.app',
  'wss://relay-3.aura0.app',
];

/**
 * Rendezvous hashing: pick the relay whose hash(room + relay) is largest.
 * Deterministic across clients given the same fleet, and dropping a relay only
 * remaps the rooms it owned — every other room keeps its server.
 */
export function relayForRoom(room: string, fleet = RELAY_FLEET): string {
  let best = fleet[0];
  let bestScore = -1;
  for (const relay of fleet) {
    const score = cyrb53(`${room}@${relay}`);
    if (score > bestScore) {
      bestScore = score;
      best = relay;
    }
  }
  return best;
}
```

Wiring into `WebsocketProvider.ts` (replaces the constant at ~line 66 and the
provider construction at ~line 137). The `VITE_WS_SERVER_URL` override stays as
the escape hatch — pin to a single relay for e2e/staging:

```ts
import { relayForRoom } from './relayRouting';

// ...in the constructor, instead of the fixed WS_SERVER_URL:
const serverUrl =
  (import.meta.env.VITE_WS_SERVER_URL as string | undefined)
  ?? relayForRoom(config.roomName);

this.provider = new WsProvider(serverUrl, config.roomName, yDoc);
```

**The gotcha that makes this the fallback, not the default:** routing is only
correct while every client shares the *exact same* fleet list. If the fleet
changes and two players in a room pick up the new list at different times, they
can briefly compute different owners → a split room until they converge. The
Nginx ring has one server-side source of truth and never has this problem.
Mitigations if you do go this way: change the fleet only on deploy boundaries,
and lean on the re-seed behavior below — a converging client just re-seeds the
new owner. Minor upside: `ConnectionMonitor`'s Sentry context logs the *actual*
relay hostname here, where Approach A always logs `ws.aura0.app`.

## Failure & rebalancing semantics — cheap for us specifically

The scary part of self-managed sharding is normally "what happens when a server
dies or the fleet resizes and rooms remap?" For Aura it's nearly free, because
of the existing model: **the relay keeps no durable copy — each client's
IndexedDB is the game and re-seeds the relay on rejoin**
(`roomDocStorage.ts`). So when a room remaps to a new server (node death, or a
deliberate resize), its clients reconnect to the new owner and re-seed it. No
state migration, no backplane, no data loss — it is the same code path as a
client reconnecting to a restarted relay today.

## Regional routing (multiple continents)

### The tension: a room can only live in one region

Room affinity says every client of a room hits the same server; proximity says
each client hits its nearest region. These conflict for a cross-continent pod —
if each player connects to their own nearest region they land on different
servers and never see each other. So regional routing decides **which region
owns the room**, not where each player connects. Everyone in the room connects
to the owning region, and the intra-region consistent-hash (Approach A) runs
within that region's fleet. A single-authority room can only live in one place
(true of Durable Objects too).

**Trap:** plain GeoDNS/anycast on the relay hostname routes each client to its
nearest region and silently breaks affinity across continents. GeoDNS is correct
for *stateless* services (the card API — send everyone to their nearest copy),
wrong for *stateful* room ownership.

### Design: region in the room ID + per-region replicas

1. Mint room IDs region-prefixed (`eu-abc123`). Routing stays stateless — the
   region is visible in the name, no global directory to keep consistent.
2. Each region is an independent copy of Approach A: its own LB + fleet
   (`us.ws.aura0.app`, `eu.ws.aura0.app`, `ap.ws.aura0.app`). They never talk;
   a room lives entirely in one region's fleet.
3. The client reads the prefix → picks the regional LB → that LB does the
   intra-region consistent-hash.

```ts
// Room IDs are minted region-prefixed ("eu-abc123"). The prefix selects the
// regional LB; that region's Nginx does the consistent-hash across its own fleet
// (Approach A, replicated per region).
const REGION_LB: Record<string, string> = {
  us: 'wss://us.ws.aura0.app',
  eu: 'wss://eu.ws.aura0.app',
  ap: 'wss://ap.ws.aura0.app',
};

export function relayForRoom(room: string): string {
  const region = room.split('-', 1)[0];
  return REGION_LB[region] ?? REGION_LB.us; // default/fallback region
}
```

### Assigning the region at creation

Use the Cloudflare edge already in front of the app — Workers get
`request.cf.continent` on every request. A tiny room-creation Worker (same
pattern as the existing TURN-config Worker) stamps the creator's nearest region;
optionally expose a manual "host region" override in the UI.

```ts
export default {
  async fetch(req: Request): Promise<Response> {
    const continent = (req as any).cf?.continent ?? 'NA'; // NA, EU, AS, OC, SA, AF
    const region = ({ NA: 'us', SA: 'us', EU: 'eu', AF: 'eu',
                      AS: 'ap', OC: 'ap' } as Record<string, string>)[continent] ?? 'us';
    return Response.json({ room: `${region}-${crypto.randomUUID().slice(0, 8)}` });
  },
};
```

Assign by the **creator's** location — a friend group settles on a home region
naturally.

### Tradeoffs and levers

- **Cross-continent pods eat latency to the owning region** (~80–150ms RTT).
  Fine for a turn-based-ish card game; cursors are the only latency-sensitive
  stream and `peerMotion` already smooths them.
- **Region migration is cheap** thanks to the re-seed model — hand out a new
  region prefix and clients re-seed the new fleet, same remap path as everything
  else. A future lever, not needed day one.
- **Active-active geo-replication is a research project** — replicating each room
  across regions has no out-of-the-box Yjs support; you'd build a geo-replicated
  CRDT sync layer. Don't, unless latency becomes a real product problem.
- **WebRTC is unaffected** — P2P via signaling + TURN, no region concept. This
  is a WS-transport concern only.
- **Check PostHog for player geography before standing up a region** — each empty
  region is a fleet + LB you pay for. Likely start `us` + `eu`, add `ap` on
  demand.

### What belongs in the room ID — region yes, transport no

Region is a **free** choice: any region can host any room, so you pin one in the
ID and the only cost is latency — no user is excluded. **Transport (WS vs
WebRTC) is not a free choice.** WebRTC exists precisely because some clients
can't use WebSocket (ad-blockers/firewalls block the relay), so pinning a room
to `ws` in its ID would lock those users out with no recourse, and pinning to
`rtc` forces everyone onto the flakier path.

And WS and WebRTC are **non-bridging topologies**: a WS client syncs through the
relay, a WebRTC client syncs peer-to-peer, and the two never see each other. A
room with mixed transports silently splits — this is the ad-blocked-user-alone
bug. So transport can't be a per-client free-for-all *or* a room-level pin.

The fix is to make the transports **bridge**, not to encode transport in the ID:
run both providers on the same `Y.Doc` so any dual-connected client relays
updates between the relay and the mesh — CRDT merges make this safe with no
elected bridge (the deferred WS↔WebRTC upgrade design (see
[`TRANSPORT_UPGRADE.md`](./TRANSPORT_UPGRADE.md)); blocked on the
`WebsocketProvider.destroy()` bug and the shared-Awareness hoist). Then transport
stays a per-client capability and the room still unifies. The one legitimate
reason to encode transport would be an explicit **P2P-only privacy room** (state
never touches a relay) — a product mode, not a fallback mechanism.

## Out of scope / next steps

- Terraform/provisioning for the fleet and LB.
- Autoscaling policy (when to add/remove a relay) — likely manual at first;
  consistent/rendezvous hashing makes a resize a ~1/N reshuffle either way.
- Fleet-list distribution for Approach B (config endpoint vs baked-in).
- Monitoring: per-backend `/health` scrape wiring; deciding whether to keep the
  `docs.size` room-count signal per-relay or aggregate it.

Recommended first move: stand up two relays behind the Nginx config above,
point `VITE_WS_SERVER_URL` at the LB hostname, and verify two browser contexts
in the same room land on the same backend (check each relay's `/health` room
count) and sync — then kill one backend and confirm the room re-forms on the
survivor.