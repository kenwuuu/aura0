/**
 * Cosmetics — subscriber teaser. A live foil/holo card the visitor can toggle,
 * plus a note that these are feature-flagged premium cosmetics. Sells "sleek"
 * with the actual holographic treatment (color-dodge + sheen + rainbow edge).
 */
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { SectionHeading } from './Section';
import { CardImage } from './CardImage';
import { getFeaturedFoilCard, type FeaturedCard } from '../featuredCards';

export function Cosmetics() {
  const [foil, setFoil] = useState(true);
  const [foilCard, setFoilCard] = useState<FeaturedCard | null>(null);

  useEffect(() => {
    let active = true;
    getFeaturedFoilCard().then((card) => {
      if (active) setFoilCard(card);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section
      id="cosmetics"
      className="relative overflow-hidden border-y border-line bg-bg-2"
    >
      <div className="mb-covergrid" />
      <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
        <div>
          <SectionHeading
            eyebrow="Subscriber cosmetics"
            title="Make it yours. Make it shine."
            lede="Support the project and unlock a pluggable layer of cosmetics — starting with luminance-aware foils and spellcast ripples. Pure flourish, zero pay-to-win."
          />
          <ul className="mt-6 space-y-3">
            {[
              ['Holographic foils', 'Real color-dodge holo that brightens the light in any art — no per-card masking.'],
              ['Spellcast ripples', 'Cards splash onto the board with rings that scale to mana cost and glow in the card’s color.'],
              ['More on the way', 'Playmats, sleeves, tap styles, victory screens — dropped in without touching core play.'],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <Sparkles size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                <span className="text-[0.98rem] leading-[1.5] text-text-dim">
                  <span className="font-medium text-text">{t}.</span> {d}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Live foil card */}
        <div className="flex flex-col items-center gap-5">
          <div className="relative" style={{ width: 208 }}>
            {/* Rainbow edge trace (behind) */}
            <div className="absolute inset-0 overflow-hidden rounded-[9px]">
              <div className="mb-foil-edge" style={{ opacity: foil ? 1 : 0 }} />
            </div>
            {/* Card */}
            <div
              className="relative overflow-hidden rounded-[9px] p-0.5"
              style={{
                boxShadow: foil
                  ? '0 0 26px rgba(255,60,200,.28), 0 0 44px rgba(60,180,255,.2)'
                  : '0 8px 24px rgba(0,0,0,.5)',
                transition: 'box-shadow .45s ease',
              }}
            >
              <div className="relative h-[280px] w-[200px] overflow-hidden rounded-[7px] bg-[#0a0a0f]">
                {foilCard && <CardImage imageUrl={foilCard.imageUrl} alt={foilCard.alt} />}
                <div className="mb-foil-layer mb-foil-holo" style={{ opacity: foil ? 0.62 : 0 }} />
                <div className="mb-foil-layer mb-foil-sheen" style={{ opacity: foil ? 1 : 0 }} />
              </div>
            </div>
          </div>

          <button onClick={() => setFoil((v) => !v)} className="mb-btn mb-btn--secondary !text-[13px]">
            <Sparkles size={15} />
            Foil {foil ? 'on' : 'off'}
          </button>
        </div>
      </div>
    </section>
  );
}
