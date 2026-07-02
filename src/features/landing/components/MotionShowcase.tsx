/**
 * MotionShowcase — "calm at rest, dramatic on events" made tangible.
 *
 * A live dot-grid board: click (or use the cast buttons) to drop a card with
 * expanding ripple rings — ripple size ∝ mana cost, hue ∝ color — and float
 * combat text. The spawnAt / spawnCombat timings are ported verbatim from the
 * prototype so the landing motion is the real product motion. Below it, the four
 * card states (rest / hover / tapped / targeted) sit side by side.
 */
import { useRef } from 'react';
import { SectionHeading } from './Section';
import { CardArt } from './CardArt';

type Cast = { label: string; cost: number; color: string };
const CASTS: Cast[] = [
  { label: 'Bolt · 1', cost: 1, color: '#4A90E2' },
  { label: 'Wrath · 3', cost: 3, color: '#E5484D' },
  { label: 'Bomb · 6', cost: 6, color: '#9B5CFF' },
  { label: 'Eldrazi · 9', cost: 9, color: '#E9C46A' },
];

export function MotionShowcase() {
  const boardRef = useRef<HTMLDivElement>(null);

  /** Verbatim port of the prototype's spawnAt(x, y, cost, color). */
  function spawnAt(x: number, y: number, cost: number, color: string) {
    const b = boardRef.current;
    if (!b) return;
    const size = 60 + cost * 34;

    const card = document.createElement('div');
    Object.assign(card.style, {
      position: 'absolute',
      left: x - 20 + 'px',
      top: y - 28 + 'px',
      width: '40px',
      height: '56px',
      borderRadius: '4px',
      background: color,
      boxShadow: '0 6px 18px rgba(0,0,0,.5), 0 0 18px ' + color,
      opacity: '0',
      pointerEvents: 'none',
      zIndex: '3',
    });
    b.appendChild(card);
    card.animate(
      [
        { opacity: 0, transform: 'translateY(-64px) scale(1.5) rotate(-7deg)' },
        { opacity: 1, transform: 'translateY(0) scale(1) rotate(0)', offset: 0.5 },
        { opacity: 1, transform: 'translateY(0) scale(.98)', offset: 0.72 },
        { opacity: 0, transform: 'translateY(0) scale(.9)' },
      ],
      { duration: 950, easing: 'cubic-bezier(.3,.85,.3,1)' },
    ).onfinish = () => card.remove();

    for (let i = 0; i < 2; i++) {
      const r = document.createElement('div');
      Object.assign(r.style, {
        position: 'absolute',
        left: x + 'px',
        top: y + 'px',
        width: '10px',
        height: '10px',
        marginLeft: '-5px',
        marginTop: '-5px',
        borderRadius: '50%',
        border: '2px solid ' + color,
        boxShadow: '0 0 14px ' + color,
        pointerEvents: 'none',
        zIndex: '2',
      });
      b.appendChild(r);
      r.animate(
        [
          { transform: 'scale(1)', opacity: 0.85 },
          { transform: `scale(${size / 10})`, opacity: 0 },
        ],
        {
          duration: 1050 + i * 260,
          delay: 260 + i * 150,
          easing: 'cubic-bezier(.1,.6,.2,1)',
        },
      ).onfinish = () => r.remove();
    }
  }

  /** Verbatim port of spawnCombat(text, color). */
  function spawnCombat(text: string, color: string) {
    const b = boardRef.current;
    if (!b) return;
    const s = document.createElement('div');
    Object.assign(s.style, {
      position: 'absolute',
      left: 32 + Math.random() * 46 + '%',
      top: '52%',
      transform: 'translateX(-50%)',
      fontFamily: "'Space Mono',monospace",
      fontSize: '32px',
      fontWeight: '700',
      color,
      textShadow: '0 0 16px ' + color,
      pointerEvents: 'none',
      zIndex: '4',
    });
    s.textContent = text;
    b.appendChild(s);
    s.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 12px) scale(.6)' },
        { opacity: 1, transform: 'translate(-50%,-12px) scale(1.15)', offset: 0.3 },
        { opacity: 0, transform: 'translate(-50%,-58px) scale(1)' },
      ],
      { duration: 1100, easing: 'cubic-bezier(.2,.7,.2,1)' },
    ).onfinish = () => s.remove();
  }

  function onBoardClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = boardRef.current!.getBoundingClientRect();
    spawnAt(e.clientX - rect.left, e.clientY - rect.top, 3, '#9B5CFF');
  }

  function cast(c: Cast) {
    const b = boardRef.current;
    if (!b) return;
    const w = b.clientWidth;
    const h = b.clientHeight;
    spawnAt(80 + Math.random() * (w - 160), 60 + Math.random() * (h - 140), c.cost, c.color);
  }

  return (
    <section id="motion" className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:py-28">
      <SectionHeading
        eyebrow="Motion is first-class"
        title="Calm at rest. Dramatic on events."
        lede="Cast a spell — the board answers. Ripple size scales with mana cost, its hue with the card’s color. This is the real product motion, not a mockup."
      />

      {/* Live board */}
      <div
        ref={boardRef}
        onClick={onBoardClick}
        className="mb-dotgrid mt-10 h-[320px] w-full cursor-crosshair overflow-hidden rounded-mb-lg border border-line sm:h-[380px]"
      >
        <span className="mb-label pointer-events-none absolute left-4 top-4 z-[5]">
          Click anywhere to cast
        </span>
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {CASTS.map((c) => (
          <button key={c.label} onClick={() => cast(c)} className="mb-btn mb-btn--secondary !text-[13px]">
            <span
              className="mr-1 inline-block h-2 w-2 rounded-full"
              style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }}
            />
            {c.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-line-2" />
        <button
          onClick={() => spawnCombat('−3', '#FF5C7A')}
          className="mb-btn mb-btn--ghost !text-[13px]"
          style={{ color: 'var(--danger)' }}
        >
          Deal 3
        </button>
        <button
          onClick={() => spawnCombat('+2', '#39D98A')}
          className="mb-btn mb-btn--ghost !text-[13px]"
          style={{ color: 'var(--good)' }}
        >
          Gain 2
        </button>
      </div>

      {/* Card states */}
      <div className="mt-16">
        <span className="mb-label !text-[var(--accent)]">Card states</span>
        <div className="mt-5 flex flex-wrap items-end gap-6 sm:gap-10">
          {[
            { label: 'Rest', cls: '' },
            { label: 'Hover me', cls: 'mb-card--hover' },
            { label: 'Tapped', cls: 'mb-card--tapped' },
            { label: 'Targeted', cls: 'mb-card--targeted' },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-3">
              <div className={`mb-card ${s.cls} h-[218px] w-[156px]`}>
                <CardArt name="Nissa" type="Legendary Planeswalker" pip="var(--mana-g)" cost="4" />
              </div>
              <span className="mb-label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
