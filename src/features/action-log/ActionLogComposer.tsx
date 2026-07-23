/**
 * Chat composer for the action log. Appends `type: 'message'` entries to the
 * same shared Y.Array the rest of the log uses, so chat and game actions
 * interleave in one chronological feed.
 */

import React, { useState } from 'react';
import * as Y from 'yjs';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { logAction } from './actionLog';

const MAX_MESSAGE_LENGTH = 280;

interface ActionLogComposerProps {
  yDoc: Y.Doc;
  localPlayerId: string;
}

export function ActionLogComposer({ yDoc, localPlayerId }: ActionLogComposerProps) {
  const [text, setText] = useState('');

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    logAction(yDoc, {
      actorId: localPlayerId,
      type: 'message',
      text: trimmed,
      // Soft blue: distinguishes chat from game-action entries in the feed.
      tone: 'rgba(130,180,255,0.95)',
    });
    setText('');
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      style={{ display: 'flex', gap: 6, padding: '8px 10px' }}
    >
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Send a message…"
        maxLength={MAX_MESSAGE_LENGTH}
        aria-label="Chat message"
        className="h-8"
      />
      <Button type="submit" size="sm" disabled={!text.trim()}>
        Send
      </Button>
    </form>
  );
}
