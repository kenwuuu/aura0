/**
 * Display settings section — how big things are drawn. Nothing here changes
 * what an interaction does; that's Gameplay.
 *
 * Live demo: while a slider is being dragged, the real CardPreview popup or
 * FloatingHand in the main window responds live. The demo appears on first
 * onValueChange and is cleaned up on onValueCommit (thumb released).
 * We drive existing stores — no simulation inside the settings panel.
 */
import React from 'react';
import { Slider } from '@/shared/ui/slider';
import {
  useSettingsStore,
  HAND_ZOOM_MIN,
  HAND_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_MAX,
} from '@/app/stores/settingsStore';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { DEFAULT_CARD_BACK } from '@/constants';
import type { Card } from '@/features/player/types';
import { SettingRow } from '../components/SettingRow';
import { SettingGroup } from '../components/SettingGroup';
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

  return (
    <div>
      <SettingGroup title="Zoom">
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
      </SettingGroup>
    </div>
  );
}
