/**
 * Unit coverage for the last-input-modality signal. The gating it enables
 * (hover-preview going inert on touch) is exercised at the surface level in
 * HandCardsContainer / CardNode tests; here we pin the raw signal: default,
 * touch flips it, mouse flips it back.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { wasLastInputTouch, getLastPointerType, __setLastPointerTypeForTest } from './pointerInput';

describe('pointerInput', () => {
  beforeEach(() => __setLastPointerTypeForTest('mouse'));

  it('defaults to mouse (desktop is correct before any pointer moves)', () => {
    expect(getLastPointerType()).toBe('mouse');
    expect(wasLastInputTouch()).toBe(false);
  });

  it('a touch pointerdown flips the signal to touch', () => {
    window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' }));
    expect(wasLastInputTouch()).toBe(true);
    expect(getLastPointerType()).toBe('touch');
  });

  it('a mouse pointermove flips the signal back to mouse', () => {
    __setLastPointerTypeForTest('touch');
    window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse' }));
    expect(wasLastInputTouch()).toBe(false);
    expect(getLastPointerType()).toBe('mouse');
  });
});
