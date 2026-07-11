import { ScrollArea } from 'aura';
import type { ReactNode } from 'react';

// Dark-only DS — render on the near-black app surface.
const Surface = ({ children }: { children: ReactNode }) => (
  <div style={{ background: 'var(--bg)', padding: 24, borderRadius: 8 }}>{children}</div>
);

const CARDS = [
  'Sol Ring', 'Lightning Bolt', 'Counterspell', 'Birds of Paradise', 'Swords to Plowshares',
  'Cultivate', 'Rhystic Study', 'Cyclonic Rift', 'Demonic Tutor', 'Path to Exile',
  'Brainstorm', 'Eternal Witness', 'Beast Within', 'Smothering Tithe', 'Dockside Extortionist',
];

export const CardList = () => (
  <Surface>
    <ScrollArea
      type="always"
      style={{ height: 200, width: 240, border: '1px solid var(--line-2)', borderRadius: 6 }}
    >
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1, padding: '4px 0 8px' }}>
          Graveyard · {CARDS.length}
        </div>
        {CARDS.map((c) => (
          <div key={c} style={{ padding: '7px 0', fontSize: 14, color: 'var(--text)', borderTop: '1px solid var(--line)' }}>{c}</div>
        ))}
      </div>
    </ScrollArea>
  </Surface>
);
