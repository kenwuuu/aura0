import { describe, it, expect } from 'vitest';
import { findDropTarget } from './dropTargetDetection';

function buildDom(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

describe('findDropTarget', () => {
  it('returns null when nothing in the ancestor chain is a drop target', () => {
    const container = buildDom('<div class="board"><div id="leaf">card</div></div>');
    const leaf = container.querySelector('#leaf');

    expect(findDropTarget(leaf)).toBeNull();
  });

  it('resolves a board PileNode from its own data attributes', () => {
    const container = buildDom(
      '<div data-pile-type="deck" data-pile-owner="p1"><span id="count">12</span></div>',
    );
    const inner = container.querySelector('#count');

    expect(findDropTarget(inner)).toEqual({ pileType: 'deck', ownerId: 'p1' });
  });

  it('resolves the FloatingHand overlay the same way, even over empty hand space', () => {
    const container = buildDom(
      '<div data-pile-type="hand" data-pile-owner="p1"><div class="hand-scroll"><div class="hand-cards"></div></div></div>',
    );
    // Simulates dropping on the empty part of the hand strip, not on top of a card.
    const emptySpace = container.querySelector('.hand-cards');

    expect(findDropTarget(emptySpace)).toEqual({ pileType: 'hand', ownerId: 'p1' });
  });

  it('walks up multiple ancestor levels to find the marked element', () => {
    const container = buildDom(
      '<div data-pile-type="exile" data-pile-owner="p2"><div><div><span id="deep">x</span></div></div></div>',
    );
    const deep = container.querySelector('#deep');

    expect(findDropTarget(deep)).toEqual({ pileType: 'exile', ownerId: 'p2' });
  });

  it('finds the nearest marked ancestor when nested pile-like elements exist', () => {
    const container = buildDom(
      '<div data-pile-type="discard" data-pile-owner="outer">' +
        '<div data-pile-type="deck" data-pile-owner="inner"><span id="target">x</span></div>' +
        '</div>',
    );
    const target = container.querySelector('#target');

    expect(findDropTarget(target)).toEqual({ pileType: 'deck', ownerId: 'inner' });
  });

  it('treats a missing data-pile-owner as null', () => {
    const container = buildDom('<div data-pile-type="hand"><span id="child">x</span></div>');
    const child = container.querySelector('#child');

    expect(findDropTarget(child)).toEqual({ pileType: 'hand', ownerId: null });
  });

  it('ignores an unrecognized data-pile-type value', () => {
    const container = buildDom('<div data-pile-type="battlefield"><span id="child">x</span></div>');
    const child = container.querySelector('#child');

    expect(findDropTarget(child)).toBeNull();
  });

  it('returns null for a null element', () => {
    expect(findDropTarget(null)).toBeNull();
  });
});
