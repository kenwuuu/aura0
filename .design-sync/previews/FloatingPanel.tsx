import { FloatingPanel } from 'aura';

const LOG: Array<{ who: string; what: string; tone: string }> = [
  { who: 'Jace', what: 'drew a card', tone: 'var(--accent-2)' },
  { who: 'You', what: 'tapped Sol Ring', tone: 'var(--accent)' },
  { who: 'Chandra', what: 'cast Lightning Bolt', tone: 'var(--accent-pink)' },
  { who: 'You', what: 'gained 2 life', tone: 'var(--accent)' },
];

// FloatingPanel is position:fixed and draggable (grip handle). Rendered inside a
// full-bleed dark backdrop at its defaultPosition. Body here is a mini action
// log — one of the panel's real uses in the app.
export const ActionLog = () => (
  <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)' }}>
    <FloatingPanel persistKey="ds-preview-action-log" defaultPosition={{ x: 24, y: 24 }} title="Action Log" width={288}>
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {LOG.map((e, i) => (
          <div key={i} style={{ fontSize: 13, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: e.tone, fontWeight: 700 }}>{e.who}</span> {e.what}
          </div>
        ))}
      </div>
    </FloatingPanel>
  </div>
);
