/**
 * Settings modal.
 *
 * Sidebar nav on the left, active-section content on the right.
 * The nav is driven entirely by the SECTIONS registry (sections.tsx) —
 * to add a new settings category, append one entry there.
 *
 * Self-mounted at the app root and controlled via settingsModalStore, so any
 * surface (gear icon, the connection-status tooltip) can open it — optionally
 * jumping straight to a specific section — without prop-drilling.
 */
import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { SECTIONS } from './sections';
import { useSettingsModalStore } from '@/app/stores/settingsModalStore';
import { useManualTransportOverrideFlag } from './useManualTransportOverrideFlag';
import styles from './SettingsModal.module.css';

export function SettingsModal() {
  const isOpen = useSettingsModalStore((s) => s.isOpen);
  const initialSectionId = useSettingsModalStore((s) => s.initialSectionId);
  const close = useSettingsModalStore((s) => s.close);

  // 'network' is the one section gated behind a PostHog flag (rollout for
  // the manual transport-override feature) — every other section in the
  // registry is unconditionally visible.
  const networkSectionEnabled = useManualTransportOverrideFlag();
  const sections = SECTIONS.filter((s) => s.id !== 'network' || networkSectionEnabled);

  const [activeSectionId, setActiveSectionId] = useState(sections[0].id);

  // Jump to the requested section each time the modal is opened.
  useEffect(() => {
    if (isOpen && initialSectionId) {
      setActiveSectionId(initialSectionId);
    }
  }, [isOpen, initialSectionId]);

  const activeSection = sections.find((s) => s.id === activeSectionId) ?? sections[0];
  const ActiveComponent = activeSection.Component;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent size="lg">
        <DialogHeader className="px-6 py-5">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className={styles.shell}>
          {/* Sidebar nav */}
          <nav className={styles.sidebar} aria-label="Settings categories">
            {sections.map((section) => {
              const Icon = section.icon;
              const isActive = section.id === activeSectionId;
              return (
                <button
                  key={section.id}
                  className={`${styles.navButton} ${isActive ? styles.navButtonActive : ''}`}
                  onClick={() => setActiveSectionId(section.id)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className={styles.navIcon} aria-hidden="true" />
                  {section.label}
                </button>
              );
            })}
          </nav>

          {/* Active section panel */}
          <main className={styles.panel}>
            <ActiveComponent />
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
