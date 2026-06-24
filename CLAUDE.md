# CLAUDE.md

This codebase (Aura) is a **peer-to-peer app for playing Magic: The Gathering on a collaborative whiteboard** using 
WebRTC (via Yjs and y-webrtc) for real-time state synchronization. The app has no backend server for game state - all 
synchronization happens peer-to-peer through CRDTs. The only backend that exists is an API for importing cards.

**Key Technologies:**
- **Vite**
- **TypeScript**
- **Yjs** - CRDT-based state synchronization library
- **y-webrtc** - WebRTC provider for Yjs (peer-to-peer networking)
- **React**
- **Tailwind**
- **Sentry**
- **Posthog**
- **shadcn**

Use React with Yjs via `y-react` bindings

# Testing
Writing tests, see @tests/testing.md

# Code Architecture
Screaming (feature-based) architecture: `src/features/` (one dir per game domain), `src/infrastructure/` (networking, cards API, persistence, analytics), `src/shared/` (shadcn UI, utils). See @claude_plans/react_refactor_screaming_architecture.md for the full plan and current progress.

# Card data lookup
Architecture for fetching Scryfall-shaped card data (Aura backend → Scryfall fallback), see @src/infrastructure/cards/CLAUDE.md