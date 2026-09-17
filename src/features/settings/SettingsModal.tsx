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
import { useFoilCosmeticFlag } from './useFoilCosmeticFlag';
import styles from './SettingsModal.module.css';

export function SettingsModal() {
  const isOpen = useSettingsModalStore((s) => s.isOpen);
  const initialSectionId = useSettingsModalStore((s) => s.initialSectionId);
  const close = useSettingsModalStore((s) => s.close);

  // Two sections are gated behind PostHog flags; every other section in the
  // registry is unconditionally visible. 'advanced' gates the manual
  // transport-override rollout (currently its only control) — if Advanced grows
  // an ungated control, move that gate onto the transport row rather than
  // dropping the whole section. 'cosmetics' gates the foil store, whose
  // fulfillment is manual, so the ability to stop offering it without a deploy
  // is the point. Note it hides the storefront only: a player who has already
  // redeemed keeps their foils, because the flag never reaches the renderers.
  const advancedSectionEnabled = useManualTransportOverrideFlag();
  const cosmeticsSectionEnabled = useFoilCosmeticFlag();
  const sections = SECTIONS.filter((s) => {
    if (s.id === 'advanced') return advancedSectionEnabled;
    if (s.id === 'cosmetics') return cosmeticsSectionEnabled;
    return true;
  });

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
