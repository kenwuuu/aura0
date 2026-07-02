/** Section heading — mono eyebrow + display title + optional lede. Reused across sections. */
import type { ReactNode } from 'react';

export function SectionHeading({
  eyebrow,
  title,
  lede,
  center,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  center?: boolean;
}) {
  return (
    <div className={center ? 'mx-auto max-w-[60ch] text-center' : 'max-w-[60ch]'}>
      <span className="mb-label !text-[var(--accent)]">{eyebrow}</span>
      <h2 className="mt-3 font-display text-[clamp(1.75rem,4vw,2.4rem)] font-semibold leading-tight tracking-[-0.03em] text-text">
        {title}
      </h2>
      {lede && <p className="mt-4 text-[1.05rem] leading-[1.55] text-text-dim">{lede}</p>}
    </div>
  );
}
