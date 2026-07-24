import { describe, it, expect, vi } from 'vitest';
import {
  useSettingsStore,
  HAND_ZOOM_MIN,
  HAND_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_MAX,
} from './settingsStore';

describe('useSettingsStore', () => {
  describe('setHandZoom', () => {
    it('sets the zoom within bounds', () => {
      useSettingsStore.getState().setHandZoom(1.5);
      expect(useSettingsStore.getState().handZoom).toBe(1.5);
    });

    it('clamps above HAND_ZOOM_MAX', () => {
      useSettingsStore.getState().setHandZoom(HAND_ZOOM_MAX + 5);
      expect(useSettingsStore.getState().handZoom).toBe(HAND_ZOOM_MAX);
    });

    it('clamps below HAND_ZOOM_MIN', () => {
      useSettingsStore.getState().setHandZoom(HAND_ZOOM_MIN - 5);
      expect(useSettingsStore.getState().handZoom).toBe(HAND_ZOOM_MIN);
    });
  });

  describe('setPreviewZoom', () => {
    it('sets the zoom within bounds', () => {
      useSettingsStore.getState().setPreviewZoom(2);
      expect(useSettingsStore.getState().previewZoom).toBe(2);
    });

    it('clamps above PREVIEW_ZOOM_MAX', () => {
      useSettingsStore.getState().setPreviewZoom(PREVIEW_ZOOM_MAX + 5);
      expect(useSettingsStore.getState().previewZoom).toBe(PREVIEW_ZOOM_MAX);
    });

    it('clamps below PREVIEW_ZOOM_MIN', () => {
      useSettingsStore.getState().setPreviewZoom(PREVIEW_ZOOM_MIN - 5);
      expect(useSettingsStore.getState().previewZoom).toBe(PREVIEW_ZOOM_MIN);
    });
  });

  describe('setSnapToGridEnabled', () => {
    it('toggles the flag', () => {
      useSettingsStore.getState().setSnapToGridEnabled(true);
      expect(useSettingsStore.getState().snapToGridEnabled).toBe(true);

      useSettingsStore.getState().setSnapToGridEnabled(false);
      expect(useSettingsStore.getState().snapToGridEnabled).toBe(false);
    });
  });

  describe('setConfirmCardDeletion', () => {
    it('defaults to true and toggles', () => {
      expect(useSettingsStore.getState().confirmCardDeletion).toBe(true);

      useSettingsStore.getState().setConfirmCardDeletion(false);
      expect(useSettingsStore.getState().confirmCardDeletion).toBe(false);

      useSettingsStore.getState().setConfirmCardDeletion(true);
      expect(useSettingsStore.getState().confirmCardDeletion).toBe(true);
    });
  });

  describe('setDemoHandCards', () => {
    it('sets and clears the ephemeral demo hand', () => {
      const cards = [{ id: 'c1' } as any];
      useSettingsStore.getState().setDemoHandCards(cards);
      expect(useSettingsStore.getState().demoHandCards).toBe(cards);

      useSettingsStore.getState().setDemoHandCards(null);
      expect(useSettingsStore.getState().demoHandCards).toBeNull();
    });
  });

  describe('legacy key migration (first load only)', () => {
    it('seeds handZoom/previewZoom from the legacy hand-zoom/card-preview-zoom keys', async () => {
      localStorage.setItem('hand-zoom', '1.75');
      localStorage.setItem('card-preview-zoom', '2.25');

      vi.resetModules();
      const fresh = await import('./settingsStore');

      expect(fresh.useSettingsStore.getState().handZoom).toBe(1.75);
      expect(fresh.useSettingsStore.getState().previewZoom).toBe(2.25);
    });

    it('clamps a legacy value that is out of bounds', async () => {
      localStorage.setItem('hand-zoom', '99');

      vi.resetModules();
      const fresh = await import('./settingsStore');

      expect(fresh.useSettingsStore.getState().handZoom).toBe(fresh.HAND_ZOOM_MAX);
    });

    it('falls back to 1 when no legacy key is present', async () => {
      vi.resetModules();
      const fresh = await import('./settingsStore');

      expect(fresh.useSettingsStore.getState().handZoom).toBe(1);
      expect(fresh.useSettingsStore.getState().previewZoom).toBe(1);
    });
  });

  describe('version migration (zoom reset)', () => {
    it('resets handZoom/previewZoom to 1 when the persisted version predates SETTINGS_VERSION', async () => {
      localStorage.setItem('aura:settings', JSON.stringify({
        state: { handZoom: 1.75, previewZoom: 2.25, snapToGridEnabled: true },
        version: 0,
      }));

      vi.resetModules();
      const fresh = await import('./settingsStore');

      expect(fresh.useSettingsStore.getState().handZoom).toBe(1);
      expect(fresh.useSettingsStore.getState().previewZoom).toBe(1);
      // unrelated preferences are untouched by the reset
      expect(fresh.useSettingsStore.getState().snapToGridEnabled).toBe(true);
    });

    it('leaves zoom untouched once the persisted version is current', async () => {
      localStorage.setItem('aura:settings', JSON.stringify({
        state: { handZoom: 1.75, previewZoom: 2.25 },
        version: 1,
      }));

      vi.resetModules();
      const fresh = await import('./settingsStore');

      expect(fresh.useSettingsStore.getState().handZoom).toBe(1.75);
      expect(fresh.useSettingsStore.getState().previewZoom).toBe(2.25);
    });
  });
});
