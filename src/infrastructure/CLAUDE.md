Cross-cutting technical concerns: `analytics/` (Posthog), `cards/` (card data lookup with Aura→Scryfall fallback), `networking/` (Yjs/WebRTC), `persistence/` (localStorage, deck saves).
Features call into these, not the other way around. Some subdirs carry their own CLAUDE.md (e.g. `cards/`) — read those for I/O details.
