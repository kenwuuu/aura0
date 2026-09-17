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
 * Valid license codes, uppercase.
 *
 * Add a code here when Ko-fi reports a purchase, then redeploy. Codes are
 * single-style for now; if a second cosmetic ever ships, this becomes a map from
 * code to style id rather than growing a parallel array.
 */
const FOIL_CODES: ReadonlySet<string> = new Set<string>([
  // e.g. 'FOIL-7X2QF'
]);

/** The one style this endpoint can grant. See the note on {@link FOIL_CODES}. */
const FOIL_STYLE = 'nebula';

const JSON_HEADERS = { 'content-type': 'application/json' };

/**
 * Normalize before comparing, because the code arrives by email and is retyped
 * by hand: case varies, and a copy-paste routinely brings whitespace with it.
 */
function normalize(code: string): string {
  return code.trim().toUpperCase();
}

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
