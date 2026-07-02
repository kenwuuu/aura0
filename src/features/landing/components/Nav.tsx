/**
 * Nav — sticky top toolbar. Raised bar with a hairline bottom border and a
 * top surface wash, per the design system's toolbar spec. Collapses to a
 * hamburger sheet on small screens.
 */
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from './Button';
import { PLAY_URL, DISCORD_URL } from '../links';

const LINKS = [
  { label: 'How it works', href: '#how' },
  { label: 'Features', href: '#features' },
  { label: 'Motion', href: '#motion' },
  { label: 'Cosmetics', href: '#cosmetics' },
];

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-50 border-b border-line bg-bg-2/85 backdrop-blur-md"
      style={{ backgroundImage: 'linear-gradient(180deg, var(--surface), transparent)' }}
    >
      <nav className="mx-auto flex max-w-[1200px] items-center gap-4 px-4 py-3 sm:px-6">
        {/* Wordmark */}
        <a href="#top" className="flex items-center gap-2.5">
          <img src="/assets/aura.png" alt="" className="h-7 w-7" />
          <span className="font-display text-[19px] font-semibold tracking-[-0.03em] text-text">
            Aura
          </span>
          <span className="mb-label ml-1 hidden rounded-chip border border-line px-1.5 py-0.5 !text-[9px] sm:inline">
            MTG
          </span>
        </a>

        {/* Desktop links */}
        <div className="ml-4 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="mb-btn mb-btn--ghost !px-3 !text-[13px]"
            >
              {l.label}
            </a>
          ))}
        </div>

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-2">
          <span className="mb-label hidden items-center gap-2 sm:inline-flex">
            <span className="mb-pip" />
            <span className="!text-[var(--good)]">Peer-to-peer</span>
          </span>
          <Button
            href={DISCORD_URL}
            target="_blank"
            rel="noreferrer"
            variant="ghost"
            className="!hidden !px-3 sm:!inline-flex"
            style={{ color: 'var(--accent-2)' }}
          >
            Discord
          </Button>
          <Button href={PLAY_URL} className="!px-4 !text-[13px]">
            Play now
          </Button>
          <button
            className="mb-btn mb-btn--ghost !px-2 md:!hidden"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {/* Mobile sheet */}
      {open && (
        <div className="border-t border-line bg-bg-2 px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="mb-btn mb-btn--ghost !justify-start !text-[14px]"
              >
                {l.label}
              </a>
            ))}
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noreferrer"
              className="mb-btn mb-btn--ghost !justify-start !text-[14px]"
              style={{ color: 'var(--accent-2)' }}
            >
              Discord
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
