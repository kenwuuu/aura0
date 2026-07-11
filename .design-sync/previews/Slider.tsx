import { Slider } from 'aura';
import type { ReactNode } from 'react';

// Dark-only DS — render on the near-black app surface.
const Surface = ({ children }: { children: ReactNode }) => (
  <div style={{ background: 'var(--bg)', padding: 28, borderRadius: 8, maxWidth: 320 }}>{children}</div>
);

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <span style={{ fontSize: 12, color: 'var(--text-mute)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
    {children}
  </div>
);

export const Default = () => (
  <Surface>
    <Field label="Card size">
      <Slider defaultValue={[60]} aria-label="Card size" />
    </Field>
  </Surface>
);

export const Range = () => (
  <Surface>
    <Field label="Mana range">
      <Slider defaultValue={[2, 5]} min={0} max={10} step={1} aria-label="Mana range" />
    </Field>
  </Surface>
);
