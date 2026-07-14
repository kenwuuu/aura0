import { Checkbox } from 'aura';
import type { ReactNode } from 'react';

// Dark-only DS — render on the near-black app surface.
const Surface = ({ children }: { children: ReactNode }) => (
  <div style={{ background: 'var(--bg)', padding: 24, borderRadius: 8 }}>{children}</div>
);

const Row = ({ children }: { children: ReactNode }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text)', fontSize: 14, cursor: 'pointer' }}>
    {children}
  </label>
);

export const States = () => (
  <Surface>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Row><Checkbox defaultChecked /> Snap cards to grid</Row>
      <Row><Checkbox /> Auto-draw opening hand</Row>
      <Row><Checkbox defaultChecked disabled /> Commander damage (locked)</Row>
      <Row><Checkbox disabled /> Spectator chat (locked)</Row>
    </div>
  </Surface>
);
