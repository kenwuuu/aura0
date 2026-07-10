import React from 'react';
import { Button } from '@/shared/ui/button';

export interface ModalFooterButton {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  align?: 'left' | 'right';
}

interface ModalFooterProps {
  buttons: ModalFooterButton[];
  style?: React.CSSProperties;
}

/** Maps ModalFooter's legacy variant names onto the shared Button variants. */
const BUTTON_VARIANT = {
  default: 'secondary',
  primary: 'default',
  danger: 'destructive',
} as const;

export const ModalFooter: React.FC<ModalFooterProps> = ({ buttons, style }) => {
  // Group buttons by alignment
  const leftButtons = buttons.filter(b => b.align === 'left');
  const rightButtons = buttons.filter(b => !b.align || b.align === 'right');

  const renderButton = (button: ModalFooterButton, key: string) => (
    <Button
      key={key}
      variant={BUTTON_VARIANT[button.variant ?? 'default']}
      size="lg"
      onClick={button.onClick}
      disabled={button.disabled}
    >
      {button.label}
    </Button>
  );

  return (
    <div
      className="flex items-center gap-3 border-t border-line px-6 py-4"
      style={style}
    >
      {leftButtons.map((button, index) => renderButton(button, `left-${index}`))}

      {leftButtons.length > 0 && rightButtons.length > 0 && (
        <div className="flex-1" />
      )}

      {rightButtons.map((button, index) => renderButton(button, `right-${index}`))}
    </div>
  );
};
