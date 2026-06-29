/**
 * Settings section registry.
 *
 * To add a new settings category:
 *   1. Create its component under `sections/`.
 *   2. Append one entry to the SECTIONS array below.
 * The sidebar nav and panel both derive entirely from this array — no other
 * file needs updating.
 */
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Monitor } from 'lucide-react';
import { DisplaySection } from './sections/DisplaySection';

export interface SettingsSection {
  id: string;
  label: string;
  icon: LucideIcon;
  Component: React.ComponentType;
}

export const SECTIONS: SettingsSection[] = [
  {
    id: 'display',
    label: 'Display',
    icon: Monitor,
    Component: DisplaySection,
  },
  // Future sections — append here:
  // { id: 'gameplay', label: 'Gameplay', icon: Gamepad2, Component: GameplaySection },
  // { id: 'account',  label: 'Account',  icon: User,     Component: AccountSection  },
];
