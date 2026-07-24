/**
 * Settings section registry.
 *
 * To add a new settings category:
 *   1. Create its component under `sections/`.
 *   2. Append one entry to the SECTIONS array below.
 * The sidebar nav and panel both derive entirely from this array — no other
 * file needs updating.
 *
 * Ordered by how often a player touches it, identity first and escape hatches
 * last. Sections split by *what a setting changes*, not by which component
 * happens to read it: Display changes how things look, Gameplay changes what
 * an interaction does, About holds one-shot actions rather than preferences.
 * If a group heading inside a section wouldn't fit under that section's name,
 * it's a section waiting to be extracted — which is how snap-to-grid ("Board")
 * and Replay tour ("Onboarding") both ended up filed under Display.
 */
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Gamepad2, Info, Monitor, User, Wrench } from 'lucide-react';
import { ProfileSection } from './sections/ProfileSection';
import { DisplaySection } from './sections/DisplaySection';
import { GameplaySection } from './sections/GameplaySection';
import { AdvancedSection } from './sections/AdvancedSection';
import { AboutSection } from './sections/AboutSection';

export interface SettingsSection {
  id: string;
  label: string;
  icon: LucideIcon;
  Component: React.ComponentType;
}

export const SECTIONS: SettingsSection[] = [
  {
    id: 'profile',
    label: 'Profile',
    icon: User,
    Component: ProfileSection,
  },
  {
    id: 'display',
    label: 'Display',
    icon: Monitor,
    Component: DisplaySection,
  },
  {
    id: 'gameplay',
    label: 'Gameplay',
    icon: Gamepad2,
    Component: GameplaySection,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: Wrench,
    Component: AdvancedSection,
  },
  {
    id: 'about',
    label: 'About',
    icon: Info,
    Component: AboutSection,
  },
];
