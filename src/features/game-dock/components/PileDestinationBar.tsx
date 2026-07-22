/**
 * PileDestinationBar
 *
 * The selection-gated "move to…" surface for the pile viewer (design 1a).
 * Turns the hidden desktop H/D/S/T/Y hotkey layer into a visible, tappable,
 * batch-capable destination bar. Rendered only when a selection exists — zero
 * chrome until then.
 *
 * The available targets are derived from *which move callbacks the viewer was
 * given*, so the bar flexes per pile for free: scry shows only D/T/Y, discard
 * drops D (cards are already in the graveyard), exile drops S, etc. This is the
 * same presence-driven rule that governs the desktop key legend.
 */
import * as React from 'react';
import type { PileViewerCallbacks } from './PileViewerReact';

/**
 * The five pile destinations, in fixed display order. `action` matches the
 * `PileMoveAction` strings routed by `dispatchPileMove`; `callbackKey` is the
 * callback whose presence decides whether this target is offered at all.
 */
export const PILE_DESTINATIONS: {
  key: string;
  label: string;
  action: string;
  callbackKey: keyof PileViewerCallbacks;
}[] = [
  { key: 'H', label: 'Hand', action: 'moveToHand', callbackKey: 'onMoveToHand' },
  { key: 'D', label: 'Grave', action: 'moveToDiscard', callbackKey: 'onMoveToDiscard' },
  { key: 'S', label: 'Exile', action: 'moveToExile', callbackKey: 'onMoveToExile' },
  { key: 'T', label: 'Deck top', action: 'moveToDeckTop', callbackKey: 'onMoveToDeckTop' },
  { key: 'Y', label: 'Deck btm', action: 'moveToDeckBottom', callbackKey: 'onMoveToDeckBottom' },
];

/** Destinations this viewer can actually move cards to (callback present). */
export function getAvailableDestinations(callbacks: PileViewerCallbacks) {
  return PILE_DESTINATIONS.filter((d) => typeof callbacks[d.callbackKey] === 'function');
}

interface PileDestinationBarProps {
  selectedCount: number;
  callbacks: PileViewerCallbacks;
  /** Move every selected card to `action`'s destination. */
  onDestination: (action: string) => void;
  onClear: () => void;
}

export function PileDestinationBar({
  selectedCount,
  callbacks,
  onDestination,
  onClear,
}: PileDestinationBarProps) {
  const destinations = getAvailableDestinations(callbacks);
  if (selectedCount === 0 || destinations.length === 0) return null;

  return (
    <div
      className="pile-destination-bar"
      data-testid="pile-destination-bar"
      data-selected-count={selectedCount}
    >
      <div className="pile-destination-bar-head">
        <span className="pile-destination-bar-count" data-testid="pile-destination-count">
          {selectedCount} SELECTED
        </span>
        <span className="pile-destination-bar-hint">MOVE TO…</span>
        <button type="button" className="pile-destination-bar-clear" onClick={onClear}>
          CLEAR
        </button>
      </div>
      <div className="pile-destination-bar-targets">
        {destinations.map((d) => (
          <button
            key={d.key}
            type="button"
            className="pile-destination-target"
            data-testid={`pile-destination-${d.action}`}
            onClick={() => onDestination(d.action)}
          >
            <span className="pile-destination-target-key">{d.key}</span>
            <span className="pile-destination-target-label">{d.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}