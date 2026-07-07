/**
 * Entry for the task-3 spike (`demo.html` → `/demo.html`). Creates a
 * networking-free game instance, seeds a small board, and mounts <DemoBoard>.
 * No bootstrapGame(), no networking, no landing — isolated from both the game
 * app and the marketing bundle so it proves the board runs standalone.
 *
 * Instance creation happens here, once, before render (mirroring main.ts) — not
 * inside a component — because the factory writes to the game store and must not
 * be double-invoked. No <StrictMode>, matching the real app's root.
 */
import { createRoot } from 'react-dom/client';
import { DemoBoard } from './DemoBoard';
import { createLocalGameInstance } from '@/app/createLocalGameInstance';
import { seedDemoBoard } from './seedDemoBoard';
import { DEFAULT_DECK } from '@/features/deck-manager/defaultDeck';
import '@/style.css';

// Board cards must not also live in the deck — a drawn card that shares an id
// with a board card would collide. Split the list: first 4 go on the board, the
// rest become the deck.
const BOARD_CARD_COUNT = 4;
const boardCards = DEFAULT_DECK.cards.slice(0, BOARD_CARD_COUNT);
const deckCards = DEFAULT_DECK.cards.slice(BOARD_CARD_COUNT);

const instance = createLocalGameInstance({
  playerId: 'demo-player',
  deck: deckCards,
  initialHealth: 40,
});
seedDemoBoard(instance.yDoc, instance.playerId, boardCards);
// Deal an opening hand so the FloatingHand isn't empty on load.
instance.player.drawCards(5);

const root = document.getElementById('demo-root');
if (root) {
  createRoot(root).render(<DemoBoard instance={instance} />);
}
