/**
 * FeatureGrid — the value props. Hairline tiles that light up on hover (glow, not
 * shadow). Responsive: 1 col → 2 → 3.
 */
import { Zap, KeyRound, Gauge, Layers, Sparkles, Hand } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SectionHeading } from './Section';

type Feature = { icon: LucideIcon; title: string; body: string };

const FEATURES: Feature[] = [
  {
    icon: Zap,
    title: 'Instant tables',
    body: 'Share one link and you’re playing. Peer-to-peer over WebRTC — the board syncs directly between players with no game server in the middle.',
  },
  {
    icon: KeyRound,
    title: 'No accounts, ever',
    body: 'Nothing to sign up for, nothing to install. Open the page, import a deck, send the link. First-time to first-draw in seconds.',
  },
  {
    icon: Gauge,
    title: 'HUD-fast interface',
    body: 'Thin lines, tabular data, purple energy. The chrome stays quiet at rest and lights up only when it matters, so the card art performs.',
  },
  {
    icon: Layers,
    title: 'Bring any deck',
    body: 'Paste a decklist and go. Cards resolve through the Aura library with a Scryfall fallback, so obscure printings still show up.',
  },
  {
    icon: Sparkles,
    title: 'Motion, done right',
    body: 'Calm at rest, dramatic on events. Casts, kills and wins earn cinematic moments; everything routine stays crisp and out of the way.',
  },
  {
    icon: Hand,
    title: 'Play your way',
    body: 'A free-form tabletop, not a rules engine. Move, tap, counter and improvise exactly like you would in paper — you call the game.',
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:py-28">
      <SectionHeading
        eyebrow="Why Aura"
        title="Everything you need to play. Nothing you don’t."
        lede="Built to disappear. The fastest path from “want to play” to “my turn” that a browser can offer."
      />

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="mb-feature group p-6">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-mb border border-line-2 bg-bg-2 text-[var(--accent)] transition-all group-hover:shadow-[0_0_14px_var(--glow)]"
            >
              <Icon size={18} />
            </div>
            <h3 className="mt-4 font-display text-[1.15rem] font-medium tracking-[-0.02em] text-text">
              {title}
            </h3>
            <p className="mt-2 text-[0.95rem] leading-[1.5] text-text-dim">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
