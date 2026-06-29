/**
 * Settings modal.
 *
 * Sidebar nav on the left, active-section content on the right.
 * The nav is driven entirely by the SECTIONS registry (sections.tsx) —
 * to add a new settings category, append one entry there.
 *
 * Follows the isOpen/onClose prop convention used by HelpModal and HotkeysModal.
 */
import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { SECTIONS } from './sections';
import styles from './SettingsModal.module.css';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeSectionId, setActiveSectionId] = useState(SECTIONS[0].id);

  const activeSection = SECTIONS.find((s) => s.id === activeSectionId) ?? SECTIONS[0];
  const ActiveComponent = activeSection.Component;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[680px] max-w-[95vw] p-0">
        <DialogHeader className="px-6 py-5">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className={styles.shell}>
          {/* Sidebar nav */}
          <nav className={styles.sidebar} aria-label="Settings categories">
            {SECTIONS.map((section) => {
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
