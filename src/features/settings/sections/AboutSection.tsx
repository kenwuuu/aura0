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

// Set by CI to the deploy's full commit SHA (see vite.config.ts); absent in dev.
const COMMIT_SHA = import.meta.env.VITE_APP_VERSION as string | undefined;
// Frozen in at build time by Vite's `define`; always present, even in dev.
const BUILD_DATE = __BUILD_DATE__;

/**
 * A human-readable version label for the About panel, e.g. "2026-07-24 ·
 * f33566b". Two signals in one line: the date answers "am I on a recent
 * build?" at a glance, the 7-char SHA is the unambiguous handle to quote in a
 * bug report (short enough to read back, long enough to `git show`). No semver
 * to show — this app ships continuously off staging, so a date + commit is the
 * only stable identity a build has.
 */
function versionLabel(): string {
  const date = BUILD_DATE ? BUILD_DATE.slice(0, 10) : null;
  const sha = COMMIT_SHA ? COMMIT_SHA.slice(0, 7) : null;
  // Local dev has no SHA — label it as such rather than showing a bare date
  // that looks like a real release.
  if (!sha) return date ? `dev · ${date}` : 'dev';
  return date ? `${date} · ${sha}` : sha;
}

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
          <span className={styles.version}>{versionLabel()}</span>
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
