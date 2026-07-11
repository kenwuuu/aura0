import { Button } from 'aura';
import { SettingsIcon, PlusIcon, RotateCcwIcon } from 'lucide-react';
import type { ReactNode } from 'react';

// The app is dark-only — render on the near-black app surface (var(--bg)) so
// secondary/ghost variants (transparent + light text) are visible. Every
// preview in this DS uses the same pattern.
const Surface = ({ children }: { children: ReactNode }) => (
  <div style={{ background: 'var(--bg)', padding: 24, borderRadius: 8 }}>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
  </div>
);

// One primary (accent + glow) per view; everything else is secondary/ghost.
export const Variants = () => (
  <Surface>
    <Button>Choose Deck</Button>
    <Button variant="secondary">Secondary</Button>
    <Button variant="ghost">Ghost</Button>
    <Button variant="destructive">Concede</Button>
    <Button variant="link">Learn more</Button>
  </Surface>
);

export const Sizes = () => (
  <Surface>
    <Button size="sm">Small</Button>
    <Button size="default">Default</Button>
    <Button size="lg">Large</Button>
  </Surface>
);

// variant="secondary" size="icon" is the app's on-canvas icon button.
export const IconButtons = () => (
  <Surface>
    <Button size="icon" aria-label="New game"><PlusIcon /></Button>
    <Button variant="secondary" size="icon" aria-label="Settings"><SettingsIcon /></Button>
    <Button variant="ghost" size="icon" aria-label="Reset"><RotateCcwIcon /></Button>
  </Surface>
);

export const WithIcon = () => (
  <Surface>
    <Button><PlusIcon /> New Game</Button>
    <Button variant="secondary"><RotateCcwIcon /> Restart</Button>
  </Surface>
);

export const Disabled = () => (
  <Surface>
    <Button disabled>Choose Deck</Button>
    <Button variant="secondary" disabled>Secondary</Button>
  </Surface>
);
