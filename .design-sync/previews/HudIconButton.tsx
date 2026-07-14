import { HudIconButton } from 'aura';
import { SettingsIcon, MessageSquareIcon, ScrollTextIcon, Volume2Icon } from 'lucide-react';
import type { ReactNode } from 'react';

// Dark-only DS — render on the near-black app surface. HudIconButton is the
// app's 34×34 on-canvas HUD control (dark translucent + blur + glow on hover).
const Surface = ({ children }: { children: ReactNode }) => (
  <div style={{ background: 'var(--bg)', padding: 24, borderRadius: 8 }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>{children}</div>
  </div>
);

const noop = () => {};

export const Toolbar = () => (
  <Surface>
    <HudIconButton icon={<SettingsIcon size={18} />} ariaLabel="Settings" onClick={noop} />
    <HudIconButton icon={<MessageSquareIcon size={18} />} ariaLabel="Chat" onClick={noop} ariaExpanded />
    <HudIconButton icon={<ScrollTextIcon size={18} />} ariaLabel="Action log" onClick={noop} />
    <HudIconButton icon={<Volume2Icon size={18} />} ariaLabel="Sound" onClick={noop} />
  </Surface>
);
