/**
 * Recognizing deck-hosting URLs, and turning them into the API call that yields
 * the list.
 *
 * This module is imported by **both** the browser and the Cloudflare Worker that
 * proxies the fetch, and that is the point: the Worker must never forward a URL
 * the client handed it. It re-parses the user's input here and rebuilds the
 * upstream URL from the extracted id, so the only address the Worker can ever
 * reach is one this file constructed — an allowlist by construction rather than
 * by validation, which is what keeps the proxy from becoming an open relay.
 */

/**
 * A deck-hosting site we know how to import from.
 *
 * EDHREC appears twice because it serves two different things at two different
 * addresses: `edhrec` is somebody's real deck, `edhrec-average` is the average
 * deck EDHREC synthesizes for a commander. They need different requests and
 * different parsing, so they are different sources rather than one with a mode.
 */
export type DeckSource = 'archidekt' | 'tappedout' | 'mtggoldfish' | 'edhrec' | 'edhrec-average';

/** A deck identified on a known host — enough to rebuild the upstream API URL. */
export type DeckUrlRef = {
  source: DeckSource;
  /** The site's own deck identifier, already validated against its id shape. */
  deckId: string;
};

/**
 * How to recognize each site's deck pages.
 *
 * The capture group is the deck's identifier, and the pattern is the *only*
 * thing that decides what characters can end up in it — everything downstream
 * builds URLs from that capture, so a pattern that is too generous here is what
 * would turn the proxy into an open relay. Both are anchored and neither admits
 * a slash or a dot.
 */
const DECK_PATHS: ReadonlyArray<{ source: DeckSource; domain: string; path: RegExp }> = [
  {
    source: 'archidekt',
    domain: 'archidekt.com',
    // `/decks/<id>/<slug>`, where the slug is decoration — the id alone
    // identifies the deck. `/api/decks/<id>/` is accepted too, so a player who
    // pasted the API URL (or one we printed in an error) still works.
    path: /^\/(?:api\/)?decks\/(\d+)\b/,
  },
  {
    source: 'tappedout',
    domain: 'tappedout.net',
    // `/mtg-decks/<slug>/`, where the slug *is* the identifier — unlike
    // Archidekt there is no numeric id behind it.
    path: /^\/mtg-decks\/([a-zA-Z0-9][a-zA-Z0-9_-]*)\/?/,
  },
  {
    source: 'mtggoldfish',
    domain: 'mtggoldfish.com',
    // `/deck/<id>`; `/deck/download/<id>` is the export URL, accepted so a
    // player who pasted that gets the same deck.
    path: /^\/deck\/(?:download\/)?(\d+)\b/,
  },
  {
    source: 'edhrec',
    domain: 'edhrec.com',
    // `/deckpreview/<hash>` — a real deck EDHREC has indexed. The hash is
    // base64url, so it admits `-` and `_` but still no slash or dot.
    path: /^\/deckpreview\/([A-Za-z0-9_-]+)\b/,
  },
  {
    source: 'edhrec-average',
    domain: 'edhrec.com',
    // `/average-decks/<slug>` is the average deck itself; `/commanders/<slug>`
    // is the page players actually browse, and the average deck is the only
    // importable thing on it, so both resolve to the same list.
    path: /^\/(?:average-decks|commanders)\/([a-z0-9-]+)\b/,
  },
];

function hostMatches(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase();
  // Guard the dot so `evilarchidekt.com` cannot pass as a subdomain.
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Parse pasted text as a deck URL. Returns null for anything that isn't one —
 * including ordinary decklist text, which is the common case at every call site,
 * so this must stay cheap and must never throw.
 */
export function parseDeckUrl(raw: string): DeckUrlRef | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || /\s/.test(trimmed)) {
    // A decklist has whitespace on every line; a URL has none. Bailing here
    // keeps a pasted 100-card list from being run through the URL parser.
    return null;
  }

  // Players paste "archidekt.com/decks/123" as often as the full URL.
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  for (const { source, domain, path } of DECK_PATHS) {
    if (!hostMatches(url.hostname, domain)) {
      continue;
    }
    // Keep going rather than returning on the first host match: one site can
    // have several kinds of deck page, and only one of its patterns will fit.
    const match = path.exec(url.pathname);
    if (match) {
      return { source, deckId: match[1] };
    }
  }

  return null;
}

/**
 * The upstream URL for a deck reference.
 *
 * Built only from `source` and a `deckId` that `parseDeckUrl` already matched
 * against that site's id pattern, so no caller-controlled string reaches the
 * request.
 */
export function upstreamApiUrl(ref: DeckUrlRef): string {
  switch (ref.source) {
    case 'archidekt':
      // The `/small/` variant omits the card list entirely — it is deck metadata
      // only — so the full document is the only option here.
      return `https://archidekt.com/api/decks/${ref.deckId}/`;
    case 'tappedout':
      // TappedOut will hand back the decklist as plain text, which is already
      // the format Aura parses — no JSON document to pick apart.
      return `https://tappedout.net/mtg-decks/${ref.deckId}/?fmt=txt`;
    case 'mtggoldfish':
      // The download endpoint returns text/plain plus the deck's name in a
      // Content-Disposition filename. The deck *page* is ~75KB of HTML.
      return `https://www.mtggoldfish.com/deck/download/${ref.deckId}`;
    case 'edhrec':
      // There is no JSON endpoint for a deck preview — the page carries its own
      // data inline instead. A lighter `_next/data` route exists but is keyed to
      // a build id that changes on every EDHREC deploy, so it would break
      // silently; the page itself is the stable address.
      return `https://edhrec.com/deckpreview/${ref.deckId}`;
    case 'edhrec-average':
      return `https://json.edhrec.com/pages/average-decks/${ref.deckId}.json`;
  }
}

/** Human-facing site name, for error messages and progress copy. */
export function sourceLabel(source: DeckSource): string {
  switch (source) {
    case 'archidekt':
      return 'Archidekt';
    case 'tappedout':
      return 'TappedOut';
    case 'mtggoldfish':
      return 'MTGGoldfish';
    case 'edhrec':
    case 'edhrec-average':
      return 'EDHREC';
  }
}
