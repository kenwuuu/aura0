/**
 * PlayerPanel — the signature player panel: animated conic-gradient border trace
 * around a raised card, a big tabular life number with text-glow, a gradient life
 * bar, and −/+ steppers. Clicking a stepper plays the life "tick" (scale + tint,
 * 380ms) verbatim from the prototype's playTick.
 */
import { useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

export function PlayerPanel() {
  const [life, setLife] = useState(40);
  const lifeRef = useRef<HTMLDivElement>(null);

  function tick(delta: number) {
    setLife((n) => Math.max(0, n + delta));
    const el = lifeRef.current;
    if (!el) return;
    const color = delta > 0 ? '#39D98A' : '#FF5C7A';
    el.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.22)', color },
        { transform: 'scale(1)' },
      ],
      { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' },
    );
  }

  const lifePct = Math.min(100, (life / 40) * 100);

  return (
    <div className="mb-trace w-[280px] max-w-full">
      <div className="mb-trace__spin" />
      <div className="mb-trace__inner p-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="mb-label !text-text-dim">Nissa</span>
          <span
            className="mb-mono rounded-chip px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-[#0a0410]"
            style={{ background: 'var(--accent)' }}
          >
            YOU
          </span>
        </div>

        {/* Life */}
        <div className="mt-3 flex items-end justify-center gap-3">
          <button
            aria-label="Lose life"
            onClick={() => tick(-1)}
            className="mb-btn mb-btn--secondary !h-9 !w-9 !p-0"
            style={{ color: 'var(--danger)' }}
          >
            <Minus size={16} />
          </button>
          <div
            ref={lifeRef}
            className="mb-mono text-[64px] font-bold leading-none text-text"
            style={{ textShadow: '0 0 24px var(--glow)' }}
          >
            {life}
          </div>
          <button
            aria-label="Gain life"
            onClick={() => tick(1)}
            className="mb-btn mb-btn--secondary !h-9 !w-9 !p-0"
            style={{ color: 'var(--good)' }}
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Life bar */}
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${lifePct}%`,
              background: 'linear-gradient(90deg, var(--accent-2), var(--accent))',
              boxShadow: '0 0 12px var(--glow)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
