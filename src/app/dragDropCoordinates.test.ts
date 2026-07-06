import { describe, it, expect } from 'vitest';
import { coordinatesFromPointerEvent, coordinatesFromTouchMoveEvent } from './dragDropCoordinates';

describe('coordinatesFromPointerEvent', () => {
  it('reads clientX/clientY off the event', () => {
    expect(coordinatesFromPointerEvent({ clientX: 120, clientY: 45 })).toEqual({ x: 120, y: 45 });
  });
});

describe('coordinatesFromTouchMoveEvent', () => {
  it('reads clientX/clientY off the first active touch', () => {
    const event = { touches: [{ clientX: 30, clientY: 40 }] } as unknown as TouchEvent;

    expect(coordinatesFromTouchMoveEvent(event)).toEqual({ x: 30, y: 40 });
  });

  it('returns null once the touch has lifted (empty touches)', () => {
    const event = { touches: [] } as unknown as TouchEvent;

    expect(coordinatesFromTouchMoveEvent(event)).toBeNull();
  });
});
