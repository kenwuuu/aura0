import { describe, it, expect } from 'vitest';
import { toCardDataResult } from './ScryfallCardAdapter';
import type { ScryfallCard } from './types';

const card = (overrides: Partial<ScryfallCard> = {}): ScryfallCard =>
  ({
    id: 'id-1',
    name: 'Sol Ring',
    type_line: 'Artifact',
    ...overrides,
  }) as ScryfallCard;

describe('toCardDataResult — the commander tag', () => {
  it('keeps the tag on a legendary creature', () => {
    const result = toCardDataResult(
      card({ name: 'Krenko, Mob Boss', type_line: 'Legendary Creature — Goblin Warrior' }),
      1,
      true,
    );

    expect(result.commander).toBe(true);
  });

  it('keeps the tag on a Background, which is a legendary enchantment', () => {
    const result = toCardDataResult(
      card({ name: 'Raised by Giants', type_line: 'Legendary Enchantment — Background' }),
      1,
      true,
    );

    expect(result.commander).toBe(true);
  });

  it('drops the tag from a card that cannot be a commander', () => {
    // The parser can only guess where a command zone ends — a text list carries
    // no card types. Here the lookup has told us: Sol Ring is not legendary, so
    // it is not a commander, whatever the list's formatting implied. Without
    // this, Player draws it straight into the opening hand.
    const result = toCardDataResult(card({ name: 'Sol Ring', type_line: 'Artifact' }), 1, true);

    expect(result.commander).toBeUndefined();
  });

  it('drops the tag from a basic land', () => {
    const result = toCardDataResult(card({ name: 'Mountain', type_line: 'Basic Land — Mountain' }), 1, true);

    expect(result.commander).toBeUndefined();
  });

  it('keeps the tag when the lookup gave us no type line to judge by', () => {
    // Absence of evidence is not evidence: stripping the tag here would cost a
    // player their real commander on the strength of data we never received.
    const result = toCardDataResult(
      card({ name: 'Krenko, Mob Boss', type_line: undefined }),
      1,
      true,
    );

    expect(result.commander).toBe(true);
  });

  it('never invents a commander out of an untagged legendary', () => {
    // 40 legendary creatures in a deck do not make 40 commanders. The tag still
    // has to come from the list.
    const result = toCardDataResult(
      card({ name: 'Krenko, Mob Boss', type_line: 'Legendary Creature — Goblin Warrior' }),
      1,
      false,
    );

    expect(result.commander).toBeUndefined();
  });
});
