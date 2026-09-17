/**
 * Cosmetic entitlements — what this player has unlocked.
 *
 * Kept in its own localStorage key rather than folded into `aura:settings`, for
 * a concrete reason: a blind `setItem` on a shared settings key wipes the
 * sibling fields, which is what made `seedSetting` in the e2e harness merge
 * rather than replace. Piling cosmetics into that blob would make every future
 * settings-seeding helper responsible for knowing cosmetics exist.
 *
 * ── The swap point ─────────────────────────────────────────────────────────
 * There is no account system. Entitlement is a manually-fulfilled license code
 * (Ko-fi mails us a purchase → we mail a code → the code goes in the Worker's
 * list). When real accounts and payments arrive, `redeemCode` is the only thing
 * that changes: it stops asking the Worker about a typed code and starts reading
 * the authenticated session, probably on boot rather than on submit. Every
 * consumer reads `isEntitled(styleId)` and keeps working untouched.
 *
 * This store answers "what may this player apply"; it does not decide what any
 * given card looks like. That is stamped onto the card itself, because peers
 * cannot see this store — see `Card.foil`.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** The only cosmetic style that exists today. */
export const FOIL_STYLE_NEBULA = 'nebula';

export type RedeemOutcome = 'success' | 'invalid' | 'error';

interface CosmeticsStore {
  /** Style id → unlocked. Absent means locked. */
  entitlements: Record<string, boolean>;
  isEntitled: (styleId: string) => boolean;
  /**
   * Check a license code and, if it is good, unlock the style it grants.
   *
   * Returns `invalid` when the server said no, and `error` when we could not ask
   * — the player has to be told these apart, since one means "check the code"
   * and the other means "try again in a minute".
   */
  redeemCode: (code: string) => Promise<RedeemOutcome>;
}

/**
 * Pull the entitlement map out of whatever was in storage, keeping only
 * `styleId: true` pairs. Anything else in the blob — a stray key, a nested
 * object, a serialized function — is dropped rather than merged into the store.
 */
function readEntitlements(persisted: unknown): Record<string, boolean> {
  const raw = (persisted as { entitlements?: unknown } | undefined)?.entitlements;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(([, value]) => value === true),
  ) as Record<string, boolean>;
}

export const useCosmeticsStore = create<CosmeticsStore>()(
  persist(
    (set, get) => ({
      entitlements: {},

      isEntitled: (styleId) => get().entitlements[styleId] === true,

      redeemCode: async (code) => {
        let payload: { valid?: unknown; style?: unknown };
        try {
          const response = await fetch('/api/foil-codes/redeem', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code }),
          });
          // A 4xx from a malformed request is still a definite "no" about this
          // code, but anything else (5xx, an HTML error page) means we never got
          // an answer and must not be reported as a bad code.
          if (response.status >= 500) {
            return 'error';
          }
          payload = (await response.json()) as { valid?: unknown; style?: unknown };
        } catch {
          return 'error';
        }

        if (payload.valid !== true || typeof payload.style !== 'string') {
          return 'invalid';
        }

        set((state) => ({
          entitlements: { ...state.entitlements, [payload.style as string]: true },
        }));
        return 'success';
      },
    }),
    {
      name: 'aura:cosmetics',
      version: 1,
      // Only the unlocks are durable; the rest of this store is behavior.
      partialize: (state) => ({ entitlements: state.entitlements }) as never,
      // `partialize` governs what gets written, not what gets read back, and
      // zustand merges a saved blob *over* the defaults. So a blob carrying a
      // `redeemCode` key would replace the function with whatever was
      // serialized. That is not hypothetical here: this is the entitlement key,
      // the one a curious player is most likely to hand-edit. Editing it should
      // at worst grant a cosmetic — never break the app — so rehydration reads
      // exactly one field and ignores everything else in the blob.
      merge: (persisted, current) => ({
        ...current,
        entitlements: readEntitlements(persisted),
      }),
    },
  ),
);

/** Imperative read for non-React callers (actions, importers). */
export const getIsEntitled = (styleId: string): boolean =>
  useCosmeticsStore.getState().isEntitled(styleId);
