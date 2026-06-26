delete this after fixing the disappearing hand bug

What's now logging

┌─────────────────────────────┬───────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────┐
│          Location           │                  Log                  │                                         Tells you                                          │
├─────────────────────────────┼───────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ Player.ts constructor       │ HAND changed {newLen, local, origin}  │ The key one — local:true newLen:0 = the refreshing client wiped its own hand; local:false  │
│                             │                                       │ = a peer write did it                                                                      │
├─────────────────────────────┼───────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ Player.ts initializeState   │ initializeState {hadHealth,           │ hadHealth:false = took the fresh-init branch because sync hadn't arrived yet               │
│                             │ existingHandLen}                      │                                                                                            │
├─────────────────────────────┼───────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ bootstrap.ts                │ yDoc update {bytes, origin}           │ origin: WebrtcConn / IndexeddbPersistence / undefined(local) — orders remote sync vs local │
│ yDoc.on('update')           │                                       │  writes                                                                                    │
├─────────────────────────────┼───────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────┤
│ WebRTCProvider.ts           │ provider synced / peers / indexeddb   │ Timestamps for when sync milestones actually land                                          │
│                             │ synced                                │                                                                                            │
└─────────────────────────────┴───────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────┘

All carry a t: (ms since page load) so you can sort them into one timeline.

How to reproduce and what to look for

1. Open two tabs/clients, join the same room, let player 1 draw a hand.
2. Refresh player 1's tab. Filter console to [hand-debug].

Hypothesis confirmed if the order is:
initializeState  hadHealth:false  existingHandLen:0
HAND changed     local:true  newLen:0        ← we emptied our own hand
... (autoload draws, or stays 0) ...
provider synced / yDoc update origin:WebrtcConn   ← remote data arrives AFTER

That local empty-write landing before the remote sync is the proof. If instead you see HAND changed local:false newLen:0 arriving from a peer, then your original
framing (player 2 clobbers player 1) is the real path — either way the logs will tell you definitively.

Want me to grab the console myself by driving two browser sessions with Playwright, or will you reproduce it manually?