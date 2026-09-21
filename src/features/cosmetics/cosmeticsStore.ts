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
 * There is no account system. Entitlement is a license code that validates
 * against itself (see `foilCode.ts`) — Ko-fi mails us a purchase, we mail back
 * a freshly minted code, and nothing is deployed in between. When real accounts
 * and payments arrive, `redeemCode` is the only thing that changes: it stops
 * checking a typed code and starts reading the authenticated session, probably
 * on boot rather than on submit. Every consumer reads `isEntitled(styleId)` and
 * keeps working untouched.
 *
 * It stays `async` for that reason even though the check is now local. A real
 * backend will need to await something, and a synchronous signature here would
 * make the swap reach back out into the form's state machine instead of staying
 * inside this function.
 *
 * This store answers "what may this player apply"; it does not decide what any
 * given card looks like. That is stamped onto the card itself, because peers
 * cannot see this store — see `Card.foil`.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { DeckPersistenceService } from '@/infrastructure/persistence';
import { isValidFoilCode } from './foilCode';

/** The only cosmetic style that exists today. */
export const FOIL_STYLE_NEBULA = 'nebula';

export type RedeemOutcome = 'success' | 'invalid';

interface CosmeticsStore {
  /** Style id → unlocked. Absent means locked. */
  entitlements: Record<string, boolean>;
  isEntitled: (styleId: string) => boolean;
  /**
   * Check a license code and, if it is good, unlock the style it grants.
   *
   * There are only two outcomes because the check is local: a code is ours or
   * it is not. Nothing can be unreachable, so nothing has to tell a player to
   * try again in a minute — which is the failure mode a network check spent a
   * Worker route, a dev-server shim and a deploy-per-sale to introduce.
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
        if (!isValidFoilCode(code)) {
          return 'invalid';
        }

        // Every code grants the same thing today. When a second cosmetic ships,
        // the style comes out of the code rather than out of this constant —
        // which is what the body characters are there to carry.
        const style = FOIL_STYLE_NEBULA;
        set((state) => ({ entitlements: { ...state.entitlements, [style]: true } }));

        // Applying to cards already in play belongs here, not at the call site.
        // Fulfillment is manual, so a code always arrives long after the deck
        // was imported — a redemption that only affected future imports would
        // leave a buyer staring at a board that looks exactly as it did before
        // they paid. Any future surface that redeems a code gets this for free.
        const { player, roomManager } = useGameInstance.getState();
        player?.applyFoilEntitlement(style);

        // The per-room deck snapshot is a second, independent copy of the deck
        // pile in localStorage, and it is only ever rewritten on deck load. The
        // sweep above would otherwise leave it holding the pre-purchase deck for
        // up to its 12-hour lifetime, ready to restore unfoiled cards on the
        // next boot that falls back to it.
        if (player && roomManager) {
          DeckPersistenceService.saveDeckForRoom(roomManager.getRoomName(), player.getDeck());
        }

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
