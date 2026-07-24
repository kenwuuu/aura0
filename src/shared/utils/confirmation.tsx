import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmationDialog } from '@/shared/components/ConfirmationDialog';

export interface ConfirmationOptions {
  /** Shows a "Don't ask me again" checkbox below the message. */
  showDontAskAgain?: boolean;
}

export interface ConfirmationResult {
  confirmed: boolean;
  /** Whether the "Don't ask me again" checkbox was checked when the dialog closed. */
  dontAskAgain: boolean;
}

/**
 * Triggers a confirmation dialog and returns a promise resolving once the user confirms or cancels.
 * @param message The confirmation message to display
 * @param confirmKey The keyboard key that the user must press to confirm (e.g., 'z', 'y')
 * @param options Optional extras — e.g. a "don't ask me again" checkbox
 */
export function triggerConfirmation(
  message: string,
  confirmKey: string,
  options: ConfirmationOptions = {},
): Promise<ConfirmationResult> {
  return new Promise((resolve) => {
    // Create a container div for the dialog
    const container = document.createElement('div');
    container.id = 'confirmation-dialog-container';
    document.body.appendChild(container);

    const root = createRoot(container);

    let dontAskAgain = false;

    const cleanup = () => {
      root.unmount();
      document.body.removeChild(container);
    };

    const handleConfirm = () => {
      cleanup();
      resolve({ confirmed: true, dontAskAgain });
    };

    const handleCancel = () => {
      cleanup();
      resolve({ confirmed: false, dontAskAgain });
    };

    const handleDontAskAgainChange = (checked: boolean) => {
      dontAskAgain = checked;
    };

    root.render(
      <ConfirmationDialog
        isOpen={true}
        message={message}
        confirmKey={confirmKey}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        showDontAskAgain={options.showDontAskAgain}
        onDontAskAgainChange={handleDontAskAgainChange}
      />
    );
  });
}
