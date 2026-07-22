/**
 * Phone-layout clamp for the hand zoom.
 *
 * The persisted `settingsStore.handZoom` (0.5–2) is a desktop preference; at
 * zoom 1 a hand card is ~189px wide — half a phone screen. On phone the
 * rendered zoom is capped so ~3–4 cards fit a 390px viewport, WITHOUT
 * mutating the stored setting (the desktop preference must survive a visit
 * at phone width).
 *
 * Hand zoom flows only through the `zoomLevel` prop (docs/architecture/responsive.md):
 * the clamped value must feed HandCardsContainer — which derives both the
 * JS-computed container height and the CSS `--card-zoom` var from it — and
 * the dnd-kit drag overlay, so all three can never disagree.
 */
export const PHONE_HAND_ZOOM_CAP = 0.6;

export function effectiveHandZoom(handZoom: number, isPhone: boolean): number {
  return isPhone ? Math.min(handZoom, PHONE_HAND_ZOOM_CAP) : handZoom;
}
