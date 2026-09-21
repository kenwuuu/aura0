/**
 * Cosmetics settings section — the foil store.
 *
 * A demand test, not a storefront: one style, bought as a Ko-fi shop item,
 * fulfilled by hand. Ko-fi mails us a purchase, we mint a code and mail it back.
 * Nothing is deployed in between — the code validates against itself — but a
 * human still has to read the email and send it, which is why the copy names a
 * 24-hour window. An unexplained wait reads as a broken purchase.
 *
 * There is no account system, so a redeemed code is remembered in this browser
 * only. That is stated plainly rather than papered over.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { FOIL_STYLE_NEBULA, FoilOverlay, useCosmeticsStore } from '@/features/cosmetics';
import { trackFoilCodeRedeemed } from '@/infrastructure/analytics/PosthogFunctions';
import { SettingRow } from '../components/SettingRow';
import { SettingGroup } from '../components/SettingGroup';
import styles from './CosmeticsSection.module.css';

/**
 * The card the store shimmers over.
 *
 * A real printing, not the card back: the back is the one face in the game that
 * never shows a foil in play, so previewing on it sells the effect against the
 * single card it will never appear on. Sol Ring is the pick because almost every
 * player owns one, and its art carries both bright metal and deep shadow — the
 * two halves of what `color-dodge` does differently.
 *
 * Scryfall's CDN, like every other piece of card art in the app. It is
 * decorative, so a blocked or slow image costs the preview and nothing else.
 */
const PREVIEW_CARD_ART =
  'https://cards.scryfall.io/normal/front/4/c/4cbc6901-6a4a-4d0a-83ea-7eefa3b35021.jpg';

/**
 * The Ko-fi listing for this cosmetic — the item itself, not the shop.
 *
 * Kept separate from the palette's general donation link (`KOFI_URL` in
 * command-palette/commands.ts): one is a tip, this is a purchase, and pointing a
 * buyer at the tip jar would take their money without ever producing a code.
 *
 * Deliberately the `/s/` item permalink rather than `ko-fi.com/aura0/shop`. A
 * shop root lists everything and leaves the buyer to find the right thing, which
 * is a step at which people simply leave — and if the shop ever holds a second
 * item, the wrong purchase arrives looking exactly like the right one and gets
 * fulfilled by hand as a foil code.
 */
const KOFI_SHOP_URL = 'https://ko-fi.com/s/d99c7c77dd';

/**
 * The only way redemption can fail. Checking the code locally means there is no
 * unreachable-server case to tell apart from a bad code — which is the one
 * distinction a network check had to work hardest not to blur.
 */
const INVALID_MESSAGE = "That code didn't work. Check it against the email we sent you.";

export function CosmeticsSection() {
  const entitled = useCosmeticsStore((s) => s.entitlements[FOIL_STYLE_NEBULA] === true);
  const redeemCode = useCosmeticsStore((s) => s.redeemCode);

  const [code, setCode] = useState('');
  // `busy` never visibly renders today: the check is local, so it resolves in a
  // microtask. It is kept because `redeemCode` is the swap point for a real
  // backend (see cosmeticsStore.ts) and that swap should not have to come back
  // out here and rebuild this form's state machine.
  const [status, setStatus] = useState<'idle' | 'busy' | 'invalid'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear a stale failure the moment the player starts fixing the code, so the
  // error never outlives the input it was about.
  useEffect(() => setStatus((s) => (s === 'idle' || s === 'busy' ? s : 'idle')), [code]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed === '' || status === 'busy') {
      return;
    }

    setStatus('busy');
    const outcome = await redeemCode(trimmed);
    trackFoilCodeRedeemed(outcome);

    if (outcome === 'success') {
      setCode('');
      setStatus('idle');
      return;
    }
    setStatus(outcome);
    inputRef.current?.select();
  };

  return (
    <div>
      <SettingGroup title="Foil cards">
        <div className={styles.preview}>
          <div className={styles.card}>
            <img src={PREVIEW_CARD_ART} alt="" className={styles.art} />
            <FoilOverlay styleId={FOIL_STYLE_NEBULA} />
          </div>
          <p className={styles.blurb}>
            Cards your deck list marks as foil get a real holographic shimmer —
            on your battlefield, in your hand, and on everyone else&apos;s screen
            too. Pure flair, no gameplay effect.
          </p>
        </div>

        {entitled ? (
          <SettingRow
            label="Unlocked"
            description="Your foil cards shimmer. Saved in this browser — redeem your code again on another device."
          >
            <span className={styles.unlocked} data-testid="foil-unlocked">
              ✓ Active
            </span>
          </SettingRow>
        ) : (
          <>
            <SettingRow
              label="Get foil cards"
              description="$10 on Ko-fi. We send your code by email, usually within 24 hours — it's fulfilled by hand, not instantly."
            >
              <Button
                variant="secondary"
                size="sm"
                data-testid="foil-kofi-link"
                onClick={() => window.open(KOFI_SHOP_URL, '_blank', 'noopener,noreferrer')}
              >
                Open Ko-fi
              </Button>
            </SettingRow>

            <SettingRow
              label="Redeem a code"
              description="Paste the code from your email. It unlocks foil in this browser and applies to cards already in play."
            >
              <form className={styles.form} onSubmit={submit}>
                <Input
                  ref={inputRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="FOIL-XXXXX"
                  aria-label="Foil license code"
                  data-testid="foil-code-input"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  type="submit"
                  size="sm"
                  data-testid="foil-code-submit"
                  disabled={code.trim() === '' || status === 'busy'}
                >
                  {status === 'busy' ? 'Checking…' : 'Redeem'}
                </Button>
              </form>
            </SettingRow>
          </>
        )}

        {status === 'invalid' && (
          <p className={styles.failure} role="alert" data-testid="foil-code-error">
            {INVALID_MESSAGE}
          </p>
        )}
      </SettingGroup>
    </div>
  );
}
