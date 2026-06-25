import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmationDialog } from '@/shared/components/ConfirmationDialog';

/**
 * Triggers a confirmation dialog and returns a promise that resolves to true if confirmed, false if canceled.
 * @param message The confirmation message to display
 * @param confirmKey The keyboard key that the user must press to confirm (e.g., 'z', 'y')
 * @returns Promise<boolean> - resolves to true if confirmed, false if canceled
 */
export function triggerConfirmation(message: string, confirmKey: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Create a container div for the dialog
    const container = document.createElement('div');
    container.id = 'confirmation-dialog-container';
    document.body.appendChild(container);

    const root = createRoot(container);

    const cleanup = () => {
      root.unmount();
      document.body.removeChild(container);
    };

    const handleConfirm = () => {
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    root.render(
      <ConfirmationDialog
        isOpen={true}
        message={message}
        confirmKey={confirmKey}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );
  });
}