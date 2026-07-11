import { Input } from 'aura';
import type { ReactNode } from 'react';

// Dark-only DS — render on the near-black app surface.
const Surface = ({ children }: { children: ReactNode }) => (
  <div style={{ background: 'var(--bg)', padding: 24, borderRadius: 8, maxWidth: 320 }}>{children}</div>
);

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <span style={{ fontSize: 12, color: 'var(--text-mute)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
    {children}
  </div>
);

export const Default = () => (
  <Surface>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Field label="Player name"><Input placeholder="Enter your name" defaultValue="Jace" /></Field>
      <Field label="Room code"><Input placeholder="e.g. dragon-storm-42" /></Field>
    </div>
  </Surface>
);

export const Types = () => (
  <Surface>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Field label="Starting life"><Input type="number" defaultValue={40} /></Field>
      <Field label="Disabled"><Input placeholder="Locked" disabled /></Field>
    </div>
  </Surface>
);
