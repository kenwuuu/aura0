import { Alert, AlertTitle, AlertDescription } from 'aura';
import { InfoIcon, TriangleAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';

// Dark-only DS — render on the near-black app surface.
const Surface = ({ children }: { children: ReactNode }) => (
  <div style={{ background: 'var(--bg)', padding: 24, borderRadius: 8, maxWidth: 460 }}>{children}</div>
);

export const Default = () => (
  <Surface>
    <Alert>
      <InfoIcon />
      <AlertTitle>This room is peer-to-peer</AlertTitle>
      <AlertDescription>
        Game state lives only in the browsers of the players connected right now
        — there is no server. Keep this tab open to stay in the game, and share
        the room link to invite others.
      </AlertDescription>
    </Alert>
  </Surface>
);

export const Destructive = () => (
  <Surface>
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertTitle>Connection lost</AlertTitle>
      <AlertDescription>
        You&apos;ve been disconnected from the room. Reconnect to resume syncing
        the board with the other players.
      </AlertDescription>
    </Alert>
  </Surface>
);
