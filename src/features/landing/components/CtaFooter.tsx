/**
 * CtaFooter — closing call-to-action over a dot-grid board, plus a hairline
 * footer with links. Ends the page on the primary action.
 */
import { ArrowRight } from 'lucide-react';
import { Button } from './Button';
import { PLAY_URL, DISCORD_URL, KOFI_URL } from '../links';

export function CtaFooter() {
  return (
    <>
      {/* Final CTA */}
      <section className="relative overflow-hidden">
        <div className="mb-dotgrid absolute inset-0" />
        <div className="relative mx-auto max-w-[1200px] px-4 py-24 text-center sm:px-6 lg:py-32">
          <h2 className="mx-auto max-w-[18ch] font-display text-[clamp(2rem,5.5vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-text">
            Your pod is waiting.
          </h2>
          <p className="mx-auto mt-5 max-w-[46ch] text-[1.05rem] leading-[1.55] text-text-dim">
            No account. No download. Just a link and a board that keeps up with you.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href={PLAY_URL} className="!px-7 !py-3.5 !text-[15px]">
              Start a table <ArrowRight size={16} />
            </Button>
            <Button href={DISCORD_URL} target="_blank" rel="noreferrer" variant="secondary" className="!px-6 !py-3.5 !text-[15px]">
              Join the Discord
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line bg-bg-2">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-6 px-4 py-10 sm:px-6 md:flex-row">
          <div className="flex items-center gap-2.5">
            <img src="/assets/aura.png" alt="" className="h-6 w-6" />
            <span className="font-display text-[15px] font-semibold tracking-[-0.03em] text-text">
              Aura
            </span>
            <span className="mb-label ml-2">Play Magic, instantly</span>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {[
              ['Play', PLAY_URL],
              ['Discord', DISCORD_URL],
              ['Support on Ko-fi', KOFI_URL],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                target={href.startsWith('http') ? '_blank' : undefined}
                rel="noreferrer"
                className="mb-label transition-colors hover:!text-text"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div className="border-t border-line px-4 py-4 text-center sm:px-6">
          <p className="mb-label !tracking-[0.08em]">
            Aura is an unofficial fan project. Not affiliated with or endorsed by Wizards of the Coast.
          </p>
        </div>
      </footer>
    </>
  );
}
