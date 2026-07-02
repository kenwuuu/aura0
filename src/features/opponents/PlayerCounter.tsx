import React from 'react';
import { CustomCounter } from '@/features/player/types';
import { Stat } from './Stat';

interface PlayerCounterProps {
  counter: CustomCounter;
  onModify: (delta: number) => void;
  onRemove: () => void;
  /** Reveal the stepper/remove controls (typically on widget hover). */
  showControls?: boolean;
}

/** A single custom counter rendered as a horizontal {@link Stat} chip. */
export const PlayerCounter: React.FC<PlayerCounterProps> = ({
  counter,
  onModify,
  onRemove,
  showControls,
}) => (
  <Stat
    orientation="horizontal"
    size="sm"
    icon={counter.icon}
    label={counter.title}
    value={counter.value}
    name={counter.title}
    onModify={onModify}
    onRemove={onRemove}
    showControls={showControls}
  />
);
