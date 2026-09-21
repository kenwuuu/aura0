/**
 * The Help guide's content registry.
 *
 * Prose lives in the sibling `.md` files; ids, titles and grouping live here.
 * The sidebar nav and the scrolling pane both derive entirely from this array —
 * adding a section is one `.md` file plus one entry, the same one-entry contract
 * `features/settings/sections.tsx` has for settings categories.
 *
 * ## Ids are authored, never derived
 *
 * `id` is the anchor everything else joins on: deep links (`openHelp`), and — in
 * future — the ⌘K palette's vocabulary entries (issue #164, Track B). It is
 * deliberately NOT slugified from `title`, because then renaming a heading
 * during a copy edit would silently move every anchor pointing at it, with no
 * type error and no failing test. Retitle freely; never retype an `id`.
 *
 * Because the array is `as const`, `HelpSectionId` is a union of the literal
 * ids, so a link to a section that no longer exists fails to compile.
 *
 * ## Section bodies
 *
 * A body starts at the prose — no leading `#` heading. The section's `title` is
 * rendered by `HelpModal`, so a heading in the markdown would print it twice;
 * use `###` for subheadings within a section.
 *
 * Write a bound key as `` `key:<action>` `` (e.g. `` `key:tap` ``) rather than
 * typing the letter. It renders the live binding from `HOTKEYS`, and
 * `sections.test.ts` fails the build if the action doesn't exist or has no key —
 * so the guide cannot promise a keystroke the app doesn't have. Actions with no
 * binding at all (Scry, Surveil, Mill, …) have to be described by their menu
 * instead, which is exactly what that test enforces.
 */
import invitingFriends from './inviting-friends.md?raw';
import importingDecks from './importing-decks.md?raw';
import commanders from './commanders.md?raw';
import playingYourFirstCard from './playing-your-first-card.md?raw';
import movingCardsBetweenZones from './moving-cards-between-zones.md?raw';
import faceDownCards from './face-down-cards.md?raw';
import copiesAndTokens from './copies-and-tokens.md?raw';
import counters from './counters.md?raw';
import addingAndRemovingCards from './adding-and-removing-cards.md?raw';
import tappingAndUntapping from './tapping-and-untapping.md?raw';
import summoningSickness from './summoning-sickness.md?raw';
import selectingSeveralCards from './selecting-several-cards.md?raw';
import movingAroundTheBoard from './moving-around-the-board.md?raw';
import labels from './labels.md?raw';
import viewingPiles from './viewing-piles.md?raw';
import deckActions from './deck-actions.md?raw';
import sideboard from './sideboard.md?raw';
import resettingYourDeck from './resetting-your-deck.md?raw';
import lifeAndCounters from './life-and-counters.md?raw';
import passingTheTurn from './passing-the-turn.md?raw';
import handPrivacy from './hand-privacy.md?raw';
import actionHistoryAndChat from './action-history-and-chat.md?raw';
import diceAndCoinFlips from './dice-and-coin-flips.md?raw';
import settings from './settings.md?raw';
import keyboardShortcuts from './keyboard-shortcuts.md?raw';
import troubleshooting from './troubleshooting.md?raw';
import gettingHelp from './getting-help.md?raw';

/**
 * Sidebar rail order. A section's `group` must be one of these, and the rail
 * renders them in this order — roughly the order a new player meets them.
 */
export const HELP_GROUPS = [
  'Start',
  'Cards',
  'Battlefield',
  'Deck and piles',
  'Players and life',
  'Table and setup',
] as const;

export type HelpGroup = (typeof HELP_GROUPS)[number];

export interface HelpSection {
  /** Stable anchor. Authored, never derived from `title`. See the file header. */
  readonly id: string;
  readonly group: HelpGroup;
  /** Rendered as the section's heading and its sidebar label. Safe to reword. */
  readonly title: string;
  /**
   * Extra search terms for this section. Nothing reads them yet — they are the
   * input to #164 Track B's help indexing, and belong with the prose rather
   * than being back-filled later by someone who didn't write it.
   */
  readonly keywords: readonly string[];
  readonly body: string;
}

export const HELP_SECTIONS = [
  {
    id: 'inviting-friends',
    group: 'Start',
    title: 'Inviting friends',
    keywords: ['invite', 'share', 'link', 'room', 'multiplayer', 'join', 'new game'],
    body: invitingFriends,
  },
  {
    id: 'importing-decks',
    group: 'Start',
    title: 'Importing a deck',
    keywords: ['import', 'decklist', 'moxfield', 'archidekt', 'edhrec', 'mtggoldfish', 'tappedout', 'paste', 'library'],
    body: importingDecks,
  },
  {
    id: 'commanders',
    group: 'Start',
    title: 'Commanders and partners',
    keywords: ['commander', 'command zone', 'edh', 'partner', 'background', 'general'],
    body: commanders,
  },
  {
    id: 'playing-your-first-card',
    group: 'Start',
    title: 'Playing your first card',
    keywords: ['play', 'drag', 'drop', 'cast', 'first', 'basics', 'draw'],
    body: playingYourFirstCard,
  },

  {
    id: 'moving-cards-between-zones',
    group: 'Cards',
    title: 'Moving cards between zones',
    keywords: ['move', 'discard', 'graveyard', 'exile', 'bounce', 'return', 'tuck', 'bottom', 'zone'],
    body: movingCardsBetweenZones,
  },
  {
    id: 'face-down-cards',
    group: 'Cards',
    title: 'Face-down cards',
    keywords: ['face down', 'facedown', 'morph', 'manifest', 'megamorph', 'disguise', 'cloak', 'foretell', 'peek', 'flip'],
    body: faceDownCards,
  },
  {
    id: 'copies-and-tokens',
    group: 'Cards',
    title: 'Copies and tokens',
    keywords: ['copy', 'clone', 'token', 'treasure', 'steal', 'gain control', 'threaten', 'populate'],
    body: copiesAndTokens,
  },
  {
    id: 'counters',
    group: 'Cards',
    title: 'Counters and keyword markers',
    keywords: ['counter', '+1/+1', '-1/-1', 'plus one', 'minus one', 'flying', 'deathtouch', 'keyword', 'marker'],
    body: counters,
  },
  {
    id: 'adding-and-removing-cards',
    group: 'Cards',
    title: 'Adding and deleting cards',
    keywords: ['add card', 'outside the game', 'wish', 'delete', 'remove', 'destroy'],
    body: addingAndRemovingCards,
  },

  {
    id: 'tapping-and-untapping',
    group: 'Battlefield',
    title: 'Tapping and untapping',
    keywords: ['tap', 'untap', 'attack', 'block', 'mana', 'vigilance'],
    body: tappingAndUntapping,
  },
  {
    id: 'summoning-sickness',
    group: 'Battlefield',
    title: 'Summoning sickness',
    keywords: ['summoning sickness', 'sick', 'haste', 'tilt', 'just played'],
    body: summoningSickness,
  },
  {
    id: 'selecting-several-cards',
    group: 'Battlefield',
    title: 'Selecting several cards',
    keywords: ['select', 'multi-select', 'box select', 'group', 'multiple', 'all'],
    body: selectingSeveralCards,
  },
  {
    id: 'moving-around-the-board',
    group: 'Battlefield',
    title: 'Moving around the board',
    keywords: ['pan', 'zoom', 'scroll', 'playmat', 'grid', 'snap', 'navigate'],
    body: movingAroundTheBoard,
  },
  {
    id: 'labels',
    group: 'Battlefield',
    title: 'Text labels',
    keywords: ['label', 'text', 'note', 'monarch', 'emblem', 'name a card', 'initiative'],
    body: labels,
  },

  {
    id: 'viewing-piles',
    group: 'Deck and piles',
    title: 'Viewing your piles',
    keywords: ['pile', 'graveyard', 'discard', 'exile', 'search', 'tutor', 'look'],
    body: viewingPiles,
  },
  {
    id: 'deck-actions',
    group: 'Deck and piles',
    title: 'Deck actions',
    keywords: ['scry', 'surveil', 'mill', 'draw', 'shuffle', 'mulligan', 'library', 'top of deck', 'explore'],
    body: deckActions,
  },
  {
    id: 'sideboard',
    group: 'Deck and piles',
    title: 'Sideboard',
    keywords: ['sideboard', 'companion', 'wish', 'outside the game', 'game two'],
    body: sideboard,
  },
  {
    id: 'resetting-your-deck',
    group: 'Deck and piles',
    title: 'Resetting your deck',
    keywords: ['reset', 'restart', 'new game', 'game two', 'start over'],
    body: resettingYourDeck,
  },

  {
    id: 'life-and-counters',
    group: 'Players and life',
    title: 'Life and player counters',
    keywords: ['life', 'health', 'damage', 'poison', 'commander damage', 'experience', 'energy', 'monarch'],
    body: lifeAndCounters,
  },
  {
    id: 'passing-the-turn',
    group: 'Players and life',
    title: 'Passing the turn',
    keywords: ['pass', 'turn', 'priority', 'end turn', 'whose turn'],
    body: passingTheTurn,
  },
  {
    id: 'hand-privacy',
    group: 'Players and life',
    title: 'Revealing your hand',
    keywords: ['reveal', 'hand', 'hidden', 'private', 'show', 'random discard'],
    body: handPrivacy,
  },

  {
    id: 'action-history-and-chat',
    group: 'Table and setup',
    title: 'Action history and chat',
    keywords: ['history', 'log', 'chat', 'message', 'what happened', 'undo'],
    body: actionHistoryAndChat,
  },
  {
    id: 'dice-and-coin-flips',
    group: 'Table and setup',
    title: 'Dice and coin flips',
    keywords: ['dice', 'die', 'roll', 'd20', 'coin', 'flip', 'random', 'who goes first'],
    body: diceAndCoinFlips,
  },
  {
    id: 'settings',
    group: 'Table and setup',
    title: 'Settings',
    keywords: ['settings', 'preferences', 'name', 'colour', 'color', 'card size', 'snap to grid', 'version'],
    body: settings,
  },
  {
    id: 'keyboard-shortcuts',
    group: 'Table and setup',
    title: 'Keyboard shortcuts',
    keywords: ['shortcut', 'hotkey', 'keyboard', 'keys', 'command palette', 'search'],
    body: keyboardShortcuts,
  },
  {
    id: 'troubleshooting',
    group: 'Table and setup',
    title: 'Troubleshooting',
    keywords: ['broken', 'help', 'not working', 'disconnected', 'cant see', 'missing cards', 'refresh'],
    body: troubleshooting,
  },
  {
    id: 'getting-help',
    group: 'Table and setup',
    title: 'Getting help',
    keywords: ['discord', 'support', 'bug', 'report', 'feedback', 'community', 'ko-fi', 'donate'],
    body: gettingHelp,
  },
] as const satisfies readonly HelpSection[];

export type HelpSectionId = (typeof HELP_SECTIONS)[number]['id'];

/** The sections of one group, in manifest order. */
export function helpSectionsInGroup(group: HelpGroup): readonly HelpSection[] {
  return HELP_SECTIONS.filter((s) => s.group === group);
}
