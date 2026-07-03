import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { spawnTokenAtPosition, getMaxZIndex } from './spawnToken';
import { getActionLog } from '@/features/action-log/actionLog';
import type { WhiteboardCard } from './types';
import type { KeywordToken } from '@/features/keyword-tokens/types';
import type { KeywordTokenTemplate } from '@/features/keyword-tokens/types';
import { NODE_SIZES } from './nodeAttachment';

function makeWhiteboardCard(overrides: Partial<WhiteboardCard> = {}): WhiteboardCard {
  return {
    id: 'card-1',
    cardNumber: 1,
    name: 'Lightning Bolt',
    x: 0,
    y: 0,
    rotation: 0,
    isTapped: false,
    isFlipped: false,
    counters: [],
    zIndex: 1,
    ownerId: 'p1',
    ...overrides,
  };
}

const template: KeywordTokenTemplate = { title: '+1/+1', backgroundColor: '#e8e1df', count: 1 };

describe('spawnTokenAtPosition', () => {
  let yDoc: Y.Doc;
  let yCards: Y.Map<WhiteboardCard>;
  let yTokens: Y.Map<KeywordToken>;

  function setup() {
    yDoc = new Y.Doc();
    yCards = yDoc.getMap('cards');
    yTokens = yDoc.getMap('tokens');
  }

  it('writes a well-formed token to yTokens at the given position', () => {
    setup();
    spawnTokenAtPosition(template, { x: 100, y: 100 }, yCards, yTokens, 'p1');

    const tokens = Array.from(yTokens.values());
    expect(tokens).toHaveLength(1);
    const token = tokens[0];
    expect(token.title).toBe('+1/+1');
    expect(token.backgroundColor).toBe('#e8e1df');
    expect(token.count).toBe(1);
    expect(token.ownerId).toBe('p1');
    expect(token.x).toBe(100 - NODE_SIZES.token.width / 2);
    expect(token.y).toBe(100 - NODE_SIZES.token.height / 2);
  });

  it('attaches to a card whose bounds contain the token center', () => {
    setup();
    const card = makeWhiteboardCard({ id: 'card-1', x: 50, y: 50, zIndex: 1 });
    yCards.set(card.id, card);

    // Position the token squarely inside the card's bounds.
    const cardCenter = { x: card.x + 10, y: card.y + 10 };
    spawnTokenAtPosition(template, cardCenter, yCards, yTokens, 'p1');

    const token = Array.from(yTokens.values())[0];
    expect(token.attachedTo).toBe('card-1');
    expect(token.zIndex).toBeGreaterThan(card.zIndex);
  });

  it('leaves attachedTo undefined when placed away from any card', () => {
    setup();
    yCards.set('card-1', makeWhiteboardCard({ id: 'card-1', x: 0, y: 0, zIndex: 1 }));

    spawnTokenAtPosition(template, { x: 5000, y: 5000 }, yCards, yTokens, 'p1');

    const token = Array.from(yTokens.values())[0];
    expect(token.attachedTo).toBeUndefined();
  });

  it('stacks above the highest existing zIndex among cards and tokens', () => {
    setup();
    yCards.set('card-1', makeWhiteboardCard({ id: 'card-1', zIndex: 5 }));
    yTokens.set('token-existing', {
      id: 'token-existing',
      title: 'Flying',
      backgroundColor: '#000',
      ownerId: 'p1',
      x: 0,
      y: 0,
      zIndex: 8,
      rotation: 0,
    });

    spawnTokenAtPosition(template, { x: 900, y: 900 }, yCards, yTokens, 'p1');

    const newToken = Array.from(yTokens.values()).find((t) => t.id !== 'token-existing')!;
    expect(newToken.zIndex).toBe(9);
  });

  it('logs a spawn_token action', () => {
    setup();
    spawnTokenAtPosition(template, { x: 0, y: 0 }, yCards, yTokens, 'p1');

    const log = getActionLog(yDoc).toArray();
    const entry = log.find((e) => e.type === 'spawn_token');
    expect(entry).toBeDefined();
    expect(entry!.text).toContain('+1/+1');
  });
});

describe('getMaxZIndex', () => {
  it('is 0 when both maps are empty', () => {
    const yDoc = new Y.Doc();
    expect(getMaxZIndex(yDoc.getMap('cards'), yDoc.getMap('tokens'))).toBe(0);
  });

  it('returns the highest zIndex across cards and tokens', () => {
    const yDoc = new Y.Doc();
    const yCards = yDoc.getMap<WhiteboardCard>('cards');
    const yTokens = yDoc.getMap<KeywordToken>('tokens');
    yCards.set('card-1', makeWhiteboardCard({ id: 'card-1', zIndex: 3 }));
    yTokens.set('token-1', {
      id: 'token-1',
      title: 'Flying',
      backgroundColor: '#000',
      ownerId: 'p1',
      x: 0,
      y: 0,
      zIndex: 7,
      rotation: 0,
    });

    expect(getMaxZIndex(yCards, yTokens)).toBe(7);
  });
});
