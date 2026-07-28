/**
 * ConfirmDialogManager
 *
 * Headless manager that mounts once in App.tsx and listens to confirmStore.
 * When a request arrives it renders the shared ConfirmDialog, calling back
 * onConfirm/onCancel from the request. Same request/consume pattern as
 * NumberPromptManager.
 */

import React, { useEffect, useState } from 'react';
import { useConfirmStore, ConfirmRequest } from '@/app/stores/confirmStore';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';

export function ConfirmDialogManager() {
  const [current, setCurrent] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    const unsub = useConfirmStore.subscribe((state) => {
      if (state.request) {
        setCurrent(state.request);
        useConfirmStore.getState().consume();
      }
    });
    return unsub;
  }, []);

  const handleConfirm = (dontAskAgain: boolean) => {
    // Suppress first: onConfirm may open another surface, and the preference
    // should already be written by the time it does.
    if (dontAskAgain) current?.onSuppress?.();
    current?.onConfirm();
    setCurrent(null);
  };

  const handleCancel = () => {
    current?.onCancel?.();
    setCurrent(null);
  };

  if (!current) return null;

  return (
    <ConfirmDialog
      isOpen
      title={current.title}
      description={current.description}
      confirmLabel={current.confirmLabel}
      cancelLabel={current.cancelLabel}
      destructive={current.destructive}
      dontAskAgainLabel={current.dontAskAgainLabel}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );
}
