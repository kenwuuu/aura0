/**
 * Hero — cover section. Cover dot-grid + ambient glow (body), a mono eyebrow,
 * the cover H1, subhead and CTAs on the left; a floating card fan + the live
 * PlayerPanel on the right. Collapses to a single column on small screens.
 */
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from './Button';
import { CardImage } from './CardImage';
import { PlayerPanel } from './PlayerPanel';
import { PLAY_URL } from '../links';
import { getRecentFeaturedCards, type FeaturedCard } from '../featuredCards';

const FAN_SIZE = 3;

export function Hero() {
  const [fan, setFan] = useState<FeaturedCard[]>([]);

  useEffect(() => {
    let active = true;
    getRecentFeaturedCards(FAN_SIZE).then((cards) => {
      if (active) setFan(cards);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section id="top" className="relative overflow-hidden">
      <div className="mb-covergrid" />
      <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pt-24 lg:pb-28">
        {/* Left: copy */}
        <div className="mb-rise">
          <span className="mb-label inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1">
            <span className="mb-pip" />
            No accounts · No downloads
          </span>

          <h1 className="mt-5 font-display text-[clamp(2.75rem,7vw,4.25rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-text">
            Play Magic.
            <br />
            <span className="relative">
              Instantly.
              <span
                className="absolute inset-x-0 -bottom-1 h-px"
                style={{ background: 'linear-gradient(90deg, var(--accent), transparent)' }}
              />
            </span>
          </h1>

          <p className="mt-6 max-w-[46ch] text-[clamp(1rem,2.2vw,1.15rem)] leading-[1.55] text-text-dim">
            Aura is a sleek, peer-to-peer tabletop for Magic: The Gathering. Share
            a link and you're dealing in seconds — no sign-up, no install, no
            server in the middle. Just a fast, clean board that stays out of your
            way.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button href={PLAY_URL} className="!px-6 !py-3 !text-[15px]">
              Start a table <ArrowRight size={16} />
            </Button>
            <Button href="#how" variant="secondary" className="!px-5 !py-3 !text-[15px]">
              How it works
            </Button>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
            {[
              ['0s', 'Setup'],
              ['1', 'Shared link'],
              ['P2P', 'No game server'],
            ].map(([n, label]) => (
              <div key={label} className="flex items-baseline gap-2">
                <span className="mb-mono text-lg font-bold text-text">{n}</span>
                <span className="mb-label">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: floating showcase */}
        <div className="relative mx-auto flex min-h-[380px] w-full max-w-[440px] items-center justify-center">
          {/* Card fan */}
          <div className="mb-float absolute left-0 top-2 flex -rotate-2 gap-3 sm:left-2">
            {fan.map((c, i) => (
              <div
                key={c.imageUrl}
                className="mb-card mb-card--hover h-[168px] w-[120px]"
                style={{ transform: `translateY(${i * 6}px) rotate(${(i - 1) * 4}deg)` }}
              >
                <CardImage imageUrl={c.imageUrl} alt={c.alt} />
              </div>
            ))}
          </div>

          {/* Player panel, foregrounded */}
          <div className="absolute -bottom-2 right-0 sm:right-2">
            <PlayerPanel />
          </div>
        </div>
      </div>
    </section>
  );
}
