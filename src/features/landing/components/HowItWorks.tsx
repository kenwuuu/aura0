/**
 * HowItWorks — three mono-numbered steps on hairline panels. Emphasizes speed:
 * import, share, play.
 */
import { SectionHeading } from './Section';

const STEPS = [
  {
    n: '01',
    title: 'Paste a decklist',
    body: 'Drop in a list and Aura resolves every card — Aura library first, Scryfall as a fallback for the deep cuts.',
  },
  {
    n: '02',
    title: 'Share the link',
    body: 'A room is a URL. Send it to your pod. They join instantly, peer-to-peer — no account, no lobby, no wait.',
  },
  {
    n: '03',
    title: 'Play',
    body: 'Draw, cast, tap, counter. The board syncs live between everyone at the table while the chrome stays out of your way.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:py-28">
      <SectionHeading
        eyebrow="How it works"
        title="Three steps to your first draw."
        center
      />
      <div className="mx-auto mt-12 grid max-w-[980px] gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <div key={s.n} className="mb-panel relative overflow-hidden p-6">
            <span
              className="mb-mono text-[52px] font-bold leading-none text-transparent"
              style={{ WebkitTextStroke: '1px var(--line-2)' }}
            >
              {s.n}
            </span>
            <h3 className="mt-3 font-display text-[1.2rem] font-medium tracking-[-0.02em] text-text">
              {s.title}
            </h3>
            <p className="mt-2 text-[0.95rem] leading-[1.5] text-text-dim">{s.body}</p>
            {i < STEPS.length - 1 && (
              <span
                className="absolute right-4 top-6 hidden text-text-mute md:block"
                aria-hidden
              >
                →
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
