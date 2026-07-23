import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as Y from 'yjs';
import { ActionLogComposer } from './ActionLogComposer';
import { getActionLog } from './actionLog';

describe('ActionLogComposer', () => {
  it('appends a message entry and clears the input on submit', async () => {
    const user = userEvent.setup();
    const yDoc = new Y.Doc();
    render(<ActionLogComposer yDoc={yDoc} localPlayerId="p1" />);

    const input = screen.getByLabelText('Chat message');
    await user.type(input, 'gg everyone{Enter}');

    const arr = getActionLog(yDoc);
    expect(arr.length).toBe(1);
    expect(arr.get(0)).toMatchObject({ actorId: 'p1', type: 'message', text: 'gg everyone' });
    expect(input).toHaveValue('');
  });

  it('trims whitespace before storing the message', async () => {
    const user = userEvent.setup();
    const yDoc = new Y.Doc();
    render(<ActionLogComposer yDoc={yDoc} localPlayerId="p1" />);

    await user.type(screen.getByLabelText('Chat message'), '  hello  {Enter}');

    expect(getActionLog(yDoc).get(0).text).toBe('hello');
  });

  it('does not append an entry for a blank message', async () => {
    const user = userEvent.setup();
    const yDoc = new Y.Doc();
    render(<ActionLogComposer yDoc={yDoc} localPlayerId="p1" />);

    await user.type(screen.getByLabelText('Chat message'), '   {Enter}');

    expect(getActionLog(yDoc).length).toBe(0);
  });

  it('disables the send button while the input is empty', async () => {
    const user = userEvent.setup();
    const yDoc = new Y.Doc();
    render(<ActionLogComposer yDoc={yDoc} localPlayerId="p1" />);

    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();

    await user.type(screen.getByLabelText('Chat message'), 'hi');
    expect(screen.getByRole('button', { name: /send/i })).toBeEnabled();
  });

  it('sends the message when clicking the send button', async () => {
    const user = userEvent.setup();
    const yDoc = new Y.Doc();
    render(<ActionLogComposer yDoc={yDoc} localPlayerId="p1" />);

    await user.type(screen.getByLabelText('Chat message'), 'hello there');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(getActionLog(yDoc).get(0).text).toBe('hello there');
  });
});
