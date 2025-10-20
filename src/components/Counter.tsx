import React from 'react';

interface CounterProps {
  value: number;
  index: number;
  onIncrement: () => void;
  onDecrement: () => void;
}

export function Counter({ value, index, onIncrement, onDecrement }: CounterProps) {
  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onIncrement();
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onDecrement();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Prevent card drag when clicking counter buttons
    e.stopPropagation();
  };

  return (
    <div
      className="card-counter"
      data-counter-index={index}
      onMouseDown={handleMouseDown}
    >
      <button
        className="counter-btn counter-plus"
        onClick={handleIncrement}
        onMouseDown={handleMouseDown}
        title="Increase counter"
      >
        +
      </button>

      <div className="counter-value">{value}</div>

      <button
        className="counter-btn counter-minus"
        onClick={handleDecrement}
        onMouseDown={handleMouseDown}
        title="Decrease counter"
      >
        −
      </button>
    </div>
  );
}