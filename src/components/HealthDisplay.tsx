import React from 'react';

interface HealthDisplayProps {
  label: string;
  health: number;
  onModifyHealth: (delta: number) => void;
  variant?: 'local' | 'opponent';
  playerId?: string;
}

export const HealthDisplay: React.FC<HealthDisplayProps> = ({
  label,
  health,
  onModifyHealth,
  variant = 'local',
  playerId,
}) => {
  const containerClass = variant === 'local' ? 'health-container' : 'opponent-health';

  return (
    <div
      className={containerClass}
      data-player-id={playerId}
    >
      <div className={variant === 'local' ? 'health-label' : 'opponent-health-label'}>
        {label}
      </div>
      <div className={variant === 'local' ? 'health-value' : 'opponent-health-value'}>
        {health}
      </div>
      <div className={variant === 'local' ? 'health-controls' : 'opponent-health-controls'}>
        <button onClick={() => onModifyHealth(-1)}>-</button>
        <button onClick={() => onModifyHealth(1)}>+</button>
      </div>
    </div>
  );
};