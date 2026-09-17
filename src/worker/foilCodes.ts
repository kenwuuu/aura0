/**
 * `/api/foil-codes/redeem` — check a cosmetic license code.
 *
 * Fulfillment for the foil cosmetic is manual by design: Ko-fi mails us a
 * purchase, we mail back a code, the code goes in {@link FOIL_CODES} and the
 * Worker redeploys. There is no account system, no database and no webhook, and
 * this endpoint is deliberately the whole server side of it.
 *
 * ── Why this is a Worker route and not an array in the bundle ───────────────
 * Not to authenticate anybody — there is nobody to authenticate. It is that a
 * client-side list ships *every code ever issued, forever*, to anyone who opens
 * devtools. A buyer passing their own code to a friend is a leak we accepted;
 * handing out all of them is not the same bargain.
 *
 * What this does NOT defend against, stated plainly so nobody assumes otherwise:
 * a redeemed code is remembered in the player's own localStorage, so anyone
 * willing to edit it can grant themselves the cosmetic without ever calling this
 * endpoint. That is fine at this scale. Guessing a code over the network is also
 * unthrottled here; at five characters of base32 that is slow enough to ignore
 * while the code list is small, and is the first thing to revisit if it is not.
 *
 * The response is deliberately only `{ valid }` — never the list, never a count,
 * never which code matched.
 */
import { errorResponse } from './deckImport';

/**
 * Normalize before comparing, because the code arrives by email and is retyped
 * by hand: case varies, and a copy-paste routinely brings whitespace with it.
 *
 * Applied to the stored list as well as to the incoming code — see
 * {@link ISSUED_CODES}.
 */
function normalize(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Codes we have issued. **Add one line here per purchase, then redeploy** —
 * that is the whole fulfillment mechanism (see `docs/deployment/FOIL_CODES.md`).
 *
 * Written exactly as mailed to the buyer, in whatever case: the list is
 * normalized on the way in, so a lowercase entry still matches. That is not a
 * nicety — comparing a normalized input against a raw list would mean a code
 * pasted in the wrong case silently never worked, and the buyer would be told
 * their real code was invalid.
 *
 * Codes are single-style for now. If a second cosmetic ever ships, this becomes
 * a map from code to style id rather than growing a parallel array.
 */
const ISSUED_CODES: readonly string[] = [
  // 'FOIL-7X2QF',   // 2026-09-17 ko-fi #1234
];

/** Exported so the normalization of the stored list is covered, not assumed. */
export function buildCodeSet(codes: readonly string[]): ReadonlySet<string> {
  return new Set(codes.map(normalize));
}

const FOIL_CODES: ReadonlySet<string> = buildCodeSet(ISSUED_CODES);

/** The one style this endpoint can grant. See the note on {@link ISSUED_CODES}. */
const FOIL_STYLE = 'nebula';

const JSON_HEADERS = { 'content-type': 'application/json' };

/**
 * `codes` is a seam for tests, which need a populated list to exercise the
 * happy path at all — the real one starts empty and only fills as purchases
 * come in. Production calls this with one argument.
 */
export async function handleFoilRedeem(
  request: Request,
  codes: ReadonlySet<string> = FOIL_CODES,
): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  let code: unknown;
  try {
    ({ code } = (await request.json()) as { code?: unknown });
  } catch {
    return errorResponse('Expected a JSON body', 400);
  }

  if (typeof code !== 'string' || code.trim() === '') {
    return errorResponse('Expected a code', 400);
  }

  // An unknown code is a 200 with `valid: false`, not an error status: it is a
  // normal answer to a normal question, and the caller renders it as "that code
  // didn't work" rather than as the network having failed. Those two cases lead
  // the player somewhere different, so they must not arrive looking alike.
  const valid = codes.has(normalize(code));

  return new Response(JSON.stringify(valid ? { valid, style: FOIL_STYLE } : { valid }), {
    status: 200,
    headers: JSON_HEADERS,
  });
}
