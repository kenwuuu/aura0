/**
 * About settings section — the app itself, rather than a preference.
 *
 * "Replay tour" was filed under Display behind an "Onboarding" heading. It
 * isn't a display preference and isn't really a preference at all — it's a
 * one-shot action, which is what this section is for.
 *
 * Deliberately does NOT restate the Discord/Ko-fi links: those already exist
 * in the toolbar and in the ⌘K palette, and a third copy is upkeep with no
 * new reach.
 */
import React from 'react';
import { Button } from '@/shared/ui/button';
import { useTourStore } from '@/features/onboarding';
import { useSettingsModalStore } from '@/app/stores/settingsModalStore';
import { SettingRow } from '../components/SettingRow';
import { SettingGroup } from '../components/SettingGroup';
import styles from './AboutSection.module.css';

// Set by CI to the deploy's commit SHA (see vite.config.ts); absent in dev.
const APP_VERSION = import.meta.env.VITE_APP_VERSION as string | undefined;

export function AboutSection() {
  return (
    <div>
      <SettingGroup title="Onboarding">
        <SettingRow
          label="Replay tour"
          description="Walk through playing, tapping, and drawing a card again."
        >
          <Button
            variant="secondary"
            size="sm"
            data-testid="replay-tour"
            onClick={() => {
              useTourStore.getState().requestReplay();
              // Get the dialog off the board the tour is about to point at.
              useSettingsModalStore.getState().close();
            }}
          >
            Replay
          </Button>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="About">
        <SettingRow label="Version" description="Include this when reporting a bug.">
          <span className={styles.version}>{APP_VERSION ?? 'dev'}</span>
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
