import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PileDestinationBar, getAvailableDestinations } from './PileDestinationBar';
import type { PileViewerCallbacks } from './PileViewerReact';

const noop = () => {};

const deckCallbacks: PileViewerCallbacks = {
  onMoveToHand: noop,
  onMoveToDiscard: noop,
  onMoveToExile: noop,
  onMoveToDeckTop: noop,
  onMoveToDeckBottom: noop,
};

// The load-bearing property: the bar's targets are derived from which move
// callbacks the viewer was given, so each pile gets exactly the destinations it
// can use — no per-pile branching in the bar. This is what makes scry (1e) and
// discard (1f) "just work".
describe('getAvailableDestinations — targets flex per pile', () => {
  it('a deck viewer offers all five targets, in H/D/S/T/Y order', () => {
    expect(getAvailableDestinations(deckCallbacks).map((d) => d.key)).toEqual(['H', 'D', 'S', 'T', 'Y']);
  });

  it('a discard viewer drops D — the cards are already in the graveyard (1f)', () => {
    const discard: PileViewerCallbacks = { ...deckCallbacks };
    delete discard.onMoveToDiscard;
    expect(getAvailableDestinations(discard).map((d) => d.key)).toEqual(['H', 'S', 'T', 'Y']);
  });

  it('a scry viewer offers only D/T/Y — no Hand/Exile (1e)', () => {
    const scry: PileViewerCallbacks = {
      onMoveToDiscard: noop,
      onMoveToDeckTop: noop,
      onMoveToDeckBottom: noop,
    };
    expect(getAvailableDestinations(scry).map((d) => d.key)).toEqual(['D', 'T', 'Y']);
  });

  it('a read-only viewer (no move callbacks) offers nothing', () => {
    expect(getAvailableDestinations({})).toEqual([]);
  });
});

describe('PileDestinationBar', () => {
  it('renders nothing until a selection exists (zero chrome by default)', () => {
    const { container } = render(
      <PileDestinationBar selectedCount={0} callbacks={deckCallbacks} onDestination={noop} onClear={noop} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a read-only viewer even with a selection', () => {
    const { container } = render(
      <PileDestinationBar selectedCount={2} callbacks={{}} onDestination={noop} onClear={noop} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the selected count and one button per available destination', () => {
    render(
      <PileDestinationBar selectedCount={2} callbacks={deckCallbacks} onDestination={noop} onClear={noop} />,
    );
    expect(screen.getByTestId('pile-destination-count')).toHaveTextContent('2 SELECTED');
    expect(screen.getByTestId('pile-destination-moveToHand')).toBeInTheDocument();
    expect(screen.getByTestId('pile-destination-moveToDeckBottom')).toBeInTheDocument();
  });

  it('clicking a target reports its move action', async () => {
    const onDestination = vi.fn();
    const user = userEvent.setup();
    render(
      <PileDestinationBar selectedCount={1} callbacks={deckCallbacks} onDestination={onDestination} onClear={noop} />,
    );
    await user.click(screen.getByTestId('pile-destination-moveToExile'));
    expect(onDestination).toHaveBeenCalledTimes(1);
    expect(onDestination).toHaveBeenCalledWith('moveToExile');
  });

  it('CLEAR clears the selection', async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <PileDestinationBar selectedCount={3} callbacks={deckCallbacks} onDestination={noop} onClear={onClear} />,
    );
    await user.click(screen.getByRole('button', { name: 'CLEAR' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
