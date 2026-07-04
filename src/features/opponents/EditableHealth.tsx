import React, { useState, useEffect } from 'react';

interface EditableHealthProps {
  health: number;
  className?: string;
  onModifyHealth: (delta: number) => void;
}

export const EditableHealth: React.FC<EditableHealthProps> = ({ health, className, onModifyHealth }) => {
  const [value, setValue] = useState(String(health));

  useEffect(() => {
    setValue(String(health));
  }, [health]);

  const commit = (raw: string) => {
    const parsed = parseInt(raw.replace(/[^0-9-]/g, ''), 10);
    if (!isNaN(parsed) && parsed !== health) {
      onModifyHealth(parsed - health);
    }
    setValue(String(health));
  };

  return (
    <input
      className={className}
      data-testid="health-value"
      aria-label="Health"
      type="text"
      value={value}
      onChange={e => setValue(e.target.value.replace(/[^0-9-]/g, ''))}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
};
