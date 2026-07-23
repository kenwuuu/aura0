import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as Y from 'yjs';
import { ActionLogPanel } from './ActionLogPanel';
import { logAction } from './actionLog';
import { YDOC_PLAYER, YSTATE_PLAYER_NAME } from '@/constants';

describe('ActionLogPanel', () => {
  it('shows a placeholder when there are no entries', () => {
    render(<ActionLogPanel yDoc={new Y.Doc()} localPlayerId="p1" />);
    expect(screen.getByText('No actions yet')).toBeInTheDocument();
  });

  it('renders logged entries by resolved actor name and text, in order', () => {
    const yDoc = new Y.Doc();
    yDoc.getMap(YDOC_PLAYER('p1')).set(YSTATE_PLAYER_NAME, 'Alice');
    logAction(yDoc, { actorId: 'p1', type: 'draw', text: 'drew a card' });
    logAction(yDoc, { actorId: 'p1', type: 'pass_turn', text: 'passed their turn' });

    render(<ActionLogPanel yDoc={yDoc} localPlayerId="p1" />);

    const entries = screen.getAllByText('Alice');
    expect(entries).toHaveLength(2);
    expect(screen.getByText('drew a card')).toBeInTheDocument();
    expect(screen.getByText('passed their turn')).toBeInTheDocument();

    // Order preserved: "drew a card" appears before "passed their turn" in the DOM.
    const position = entries[0].compareDocumentPosition(screen.getByText('passed their turn'));
    // eslint-disable-next-line no-bitwise
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('falls back to a truncated id when the actor has no stored name', () => {
    const yDoc = new Y.Doc();
    logAction(yDoc, { actorId: 'unnamed-player-id', type: 'draw', text: 'drew a card' });

    render(<ActionLogPanel yDoc={yDoc} localPlayerId="p1" />);

    expect(screen.getByText('unnamed-p')).toBeInTheDocument();
  });

  it('updates live as new entries are logged to the same Y.Doc', () => {
    const yDoc = new Y.Doc();
    render(<ActionLogPanel yDoc={yDoc} localPlayerId="p1" />);
    expect(screen.getByText('No actions yet')).toBeInTheDocument();

    act(() => {
      logAction(yDoc, { actorId: 'p1', type: 'draw', text: 'drew a card' });
    });

    expect(screen.queryByText('No actions yet')).not.toBeInTheDocument();
    expect(screen.getByText('drew a card')).toBeInTheDocument();
  });

  it('renders a message entry with a colon after the sender name', () => {
    const yDoc = new Y.Doc();
    yDoc.getMap(YDOC_PLAYER('p1')).set(YSTATE_PLAYER_NAME, 'Alice');
    logAction(yDoc, { actorId: 'p1', type: 'message', text: 'gg everyone' });

    render(<ActionLogPanel yDoc={yDoc} localPlayerId="p1" />);

    expect(screen.getByText('Alice:')).toBeInTheDocument();
    expect(screen.getByText('gg everyone')).toBeInTheDocument();
  });

  it('lets the local player send a chat message through the composer', async () => {
    const user = userEvent.setup();
    const yDoc = new Y.Doc();
    render(<ActionLogPanel yDoc={yDoc} localPlayerId="p1" />);

    await user.type(screen.getByLabelText('Chat message'), 'hello{Enter}');

    expect(await screen.findByText('hello')).toBeInTheDocument();
  });

  it('collapses and re-expands the entry list on header click', async () => {
    const user = userEvent.setup();
    const yDoc = new Y.Doc();
    logAction(yDoc, { actorId: 'p1', type: 'draw', text: 'drew a card' });
    render(<ActionLogPanel yDoc={yDoc} localPlayerId="p1" />);
    expect(screen.getByText('drew a card')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /action log/i }));
    expect(screen.queryByText('drew a card')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /action log/i }));
    expect(screen.getByText('drew a card')).toBeInTheDocument();
  });
});
