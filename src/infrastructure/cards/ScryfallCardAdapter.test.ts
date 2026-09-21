import { describe, it, expect } from 'vitest';
import { fromCardDataResult, toCardDataResult } from './ScryfallCardAdapter';
import type { CardDataResult, ScryfallCard } from './types';

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

describe('the foil flag', () => {
  const result = (overrides: Partial<CardDataResult> = {}): CardDataResult => ({
    count: 1,
    name: 'Sol Ring',
    scryfallId: 'id-1',
    imageUris: { front: null, back: null },
    ...overrides,
  });

  it('carries a foil entry through the lookup result', () => {
    expect(toCardDataResult(card(), 1, false, undefined, true).isFoil).toBe(true);
  });

  it('leaves the flag off a non-foil entry', () => {
    expect(toCardDataResult(card(), 1, false, undefined, false).isFoil).toBeUndefined();
  });

  it('puts the flag on the Card', () => {
    // `fromCardDataResult` hand-picks the fields it copies rather than spreading
    // the result, so a field added upstream reaches the Card only if it is named
    // here too — and because every field is optional, missing it is silent.
    expect(fromCardDataResult(result({ isFoil: true })).isFoil).toBe(true);
  });

  it('leaves the flag off a non-foil Card', () => {
    expect(fromCardDataResult(result()).isFoil).toBeUndefined();
  });

  it('never carries an applied foil style out of a lookup', () => {
    // `isFoil` is the printing the player owns; `foil` is the cosmetic, decided
    // later by the entitlement layer. A lookup must never set the second one.
    expect(fromCardDataResult(result({ isFoil: true })).foil).toBeUndefined();
  });
});
