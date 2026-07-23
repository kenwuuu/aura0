import { describe, it, expect } from 'vitest';
import { resolveCardFace, resolveCardRotation } from './cardNodeLogic';
import { makeCard } from '@/test/factories';
import { DEFAULT_CARD_BACK } from '@/constants';

describe('resolveCardFace', () => {
  it('shows the front image and the name as alt when not flipped', () => {
    const face = resolveCardFace(
      makeCard({ name: 'Lightning Bolt', images: { front: { normal: 'front.png' } } }),
    );
    expect(face).toEqual({ src: 'front.png', alt: 'Lightning Bolt' });
  });

  it('falls back to "Card #<n>" alt when the card has no name', () => {
    const face = resolveCardFace(
      makeCard({ name: undefined, cardNumber: 42, images: { front: { normal: 'front.png' } } }),
    );
    expect(face.alt).toBe('Card #42');
  });

  it('returns a null src (placeholder) when the front image is missing', () => {
    const face = resolveCardFace(makeCard({ images: { front: null } }));
    expect(face.src).toBeNull();
  });

  it('shows the back image with a "Card Back" alt when flipped', () => {
    const face = resolveCardFace(
      makeCard({
        isFlipped: true,
        images: { front: { normal: 'front.png' }, back: { normal: 'back.png' } },
      }),
    );
    expect(face).toEqual({ src: 'back.png', alt: 'Card Back' });
  });

  it('falls back to the default card back when flipped with no back image', () => {
    const face = resolveCardFace(
      makeCard({ isFlipped: true, images: { front: { normal: 'front.png' } } }),
    );
    expect(face).toEqual({ src: DEFAULT_CARD_BACK, alt: 'Card Back' });
  });
});

describe('resolveCardRotation', () => {
  it('is 0 for an untapped, unrotated card', () => {
    expect(resolveCardRotation(makeCard({ rotation: 0, isTapped: false }))).toBe(0);
  });

  it('adds 90° when tapped', () => {
    expect(resolveCardRotation(makeCard({ rotation: 0, isTapped: true }))).toBe(90);
  });

  it('composes tap rotation on top of the card rotation', () => {
    expect(resolveCardRotation(makeCard({ rotation: 90, isTapped: true }))).toBe(180);
  });

  it('uses the card rotation alone when untapped', () => {
    expect(resolveCardRotation(makeCard({ rotation: 45, isTapped: false }))).toBe(45);
  });

  it('adds 45° when summoning-sick', () => {
    expect(resolveCardRotation(makeCard({ rotation: 0, isSick: true }))).toBe(45);
  });

  it('lets tap win over the sick tilt when both flags are set (mutually exclusive)', () => {
    expect(resolveCardRotation(makeCard({ rotation: 0, isTapped: true, isSick: true }))).toBe(90);
  });

  it('composes the sick tilt on top of the card rotation', () => {
    expect(resolveCardRotation(makeCard({ rotation: 90, isSick: true }))).toBe(135);
  });

  it('treats an absent isSick as not sick', () => {
    expect(resolveCardRotation(makeCard({ rotation: 0, isSick: undefined }))).toBe(0);
  });
});
