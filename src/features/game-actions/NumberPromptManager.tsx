/**
 * NumberPromptManager
 *
 * Headless manager that mounts once in App.tsx and listens to
 * numberPromptStore. When a request arrives it renders the NumberPrompt
 * dialog, calling back onConfirm/onCancel from the request.
 *
 * This is the same request/consume pattern as ScryManager + scryStore.
 */

import React, { useEffect, useState } from 'react';
import { useNumberPromptStore, NumberPromptRequest } from './numberPromptStore';
import { NumberPrompt } from './NumberPrompt';

export function NumberPromptManager() {
  const [current, setCurrent] = useState<NumberPromptRequest | null>(null);

  useEffect(() => {
    const unsub = useNumberPromptStore.subscribe((state) => {
      if (state.request) {
        setCurrent(state.request);
        useNumberPromptStore.getState().consume();
      }
    });
    return unsub;
  }, []);

  const handleConfirm = (n: number) => {
    current?.onConfirm(n);
    setCurrent(null);
  };

  const handleCancel = () => {
    current?.onCancel?.();
    setCurrent(null);
  };

  if (!current) return null;

  return (
    <NumberPrompt
      isOpen
      title={current.title}
      label={current.label}
      min={current.min}
      max={current.max}
      defaultValue={current.defaultValue}
      confirmLabel={current.confirmLabel}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );
}
