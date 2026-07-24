/**
 * Display settings section — zoom preferences for in-game UI elements.
 *
 * Live demo: while a slider is being dragged, the real CardPreview popup or
 * FloatingHand in the main window responds live. The demo appears on first
 * onValueChange and is cleaned up on onValueCommit (thumb released).
 * We drive existing stores — no simulation inside the settings panel.
 */
import React from 'react';
import { Slider } from '@/shared/ui/slider';
import { Checkbox } from '@/shared/ui/checkbox';
import { Button } from '@/shared/ui/button';
import {
  useSettingsStore,
  HAND_ZOOM_MIN,
  HAND_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_MAX,
} from '@/app/stores/settingsStore';
import { useSettingsModalStore } from '@/app/stores/settingsModalStore';
import { useTourStore } from '@/features/onboarding';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { DEFAULT_CARD_BACK } from '@/constants';
import type { Card } from '@/features/player/types';
import { SettingRow } from '../components/SettingRow';
import styles from './DisplaySection.module.css';

const DEMO_HAND_CARDS: Card[] = [
  { id: '__demo_1', cardNumber: 0, x: 0, y: 0, rotation: 0, isTapped: false, isSick: false, isFlipped: false, counters: [], images: { front: { normal: DEFAULT_CARD_BACK } } },
  { id: '__demo_2', cardNumber: 0, x: 0, y: 0, rotation: 0, isTapped: false, isSick: false, isFlipped: false, counters: [], images: { front: { normal: DEFAULT_CARD_BACK } } },
  { id: '__demo_3', cardNumber: 0, x: 0, y: 0, rotation: 0, isTapped: false, isSick: false, isFlipped: false, counters: [], images: { front: { normal: DEFAULT_CARD_BACK } } },
];

const DEMO_PREVIEW_CARD: Card = {
  id: '__demo_preview',
  cardNumber: 0,
  x: 0,
  y: 0,
  rotation: 0,
  isTapped: false,
  isSick: false,
  isFlipped: false,
  counters: [],
  images: { front: { normal: DEFAULT_CARD_BACK } },
};

function ZoomSlider({
  value,
  min,
  max,
  step,
  onChange,
  onStart,
  onEnd,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  ariaLabel: string;
}) {
  return (
    <div className={styles.sliderContainer}>
      <Slider
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => { onStart?.(); onChange(v); }}
        onValueCommit={() => onEnd?.()}
      />
      <span className={styles.sliderValue}>{value.toFixed(1)}×</span>
    </div>
  );
}

export function DisplaySection() {
  const handZoom = useSettingsStore((s) => s.handZoom);
  const previewZoom = useSettingsStore((s) => s.previewZoom);
  const setHandZoom = useSettingsStore((s) => s.setHandZoom);
  const setPreviewZoom = useSettingsStore((s) => s.setPreviewZoom);
  const snapToGridEnabled = useSettingsStore((s) => s.snapToGridEnabled);
  const setSnapToGridEnabled = useSettingsStore((s) => s.setSnapToGridEnabled);
  const confirmCardDelete = useSettingsStore((s) => s.confirmCardDelete);
  const setConfirmCardDelete = useSettingsStore((s) => s.setConfirmCardDelete);

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Zoom</p>
      <SettingRow
        label="Hand card size"
        description="Scale of cards in your hand at the bottom of the screen."
      >
        <ZoomSlider
          ariaLabel="Hand card size"
          value={handZoom}
          min={HAND_ZOOM_MIN}
          max={HAND_ZOOM_MAX}
          step={0.1}
          onChange={setHandZoom}
          onStart={() => useSettingsStore.getState().setDemoHandCards(DEMO_HAND_CARDS)}
          onEnd={() => useSettingsStore.getState().setDemoHandCards(null)}
        />
      </SettingRow>
      <SettingRow
        label="Card preview size"
        description="Scale of the card hover-preview that appears when you mouse over a card."
      >
        <ZoomSlider
          ariaLabel="Card preview size"
          value={previewZoom}
          min={PREVIEW_ZOOM_MIN}
          max={PREVIEW_ZOOM_MAX}
          step={0.1}
          onChange={setPreviewZoom}
          onStart={() => {
            useCardPreviewStore.getState().show(DEMO_PREVIEW_CARD);
            useCardPreviewStore.getState().updatePosition(0, 0);
          }}
          onEnd={() => useCardPreviewStore.getState().hide()}
        />
      </SettingRow>

      <p className={styles.sectionTitle}>Board</p>
      <SettingRow
        label="Always snap to grid"
        description="Cards and tokens snap to the grid while dragging. When off, hold Alt during a drag to snap instead."
      >
        <Checkbox
          aria-label="Always snap to grid"
          checked={snapToGridEnabled}
          onCheckedChange={(checked) => setSnapToGridEnabled(checked === true)}
        />
      </SettingRow>

      <p className={styles.sectionTitle}>Confirmations</p>
      <SettingRow
        label="Ask before deleting a card"
        description="Deleting removes a card from the battlefield without sending it to a pile, and can't be undone."
      >
        <Checkbox
          aria-label="Ask before deleting a card"
          checked={confirmCardDelete}
          onCheckedChange={(checked) => setConfirmCardDelete(checked === true)}
        />
      </SettingRow>

      <p className={styles.sectionTitle}>Onboarding</p>
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
    </div>
  );
}
