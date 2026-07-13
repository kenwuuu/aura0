import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { MtgTextListDeckImporter } from '@/features/deck-manager';
import { DeckStorageService } from '@/infrastructure/persistence';
import { SavedDeck } from '@/features/player/types';
import { DeckImportHelpDialog } from './DeckImportHelpDialog';
import { parseDecklistWithStats } from './DeckListParser';
import { ModalFooter } from '@/shared/components/ModalFooter';
import {InfoIcon} from "lucide-react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/shared/ui/alert"
import { randomIdSuffix } from '@/shared/utils/ids';

interface DeckImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeckImported: (deck: SavedDeck) => void;
}

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 10001,
    animation: 'fadeIn 150ms ease-out',
  },
  content: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#1f1f1f',
    border: '2px solid #3d3d3d',
    borderRadius: '16px',
    padding: '0',
    maxWidth: '600px',
    width: '90vw',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
    zIndex: 10002,
    animation: 'slideIn 200ms ease-out',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid #3d3d3d',
  },
  title: {
    color: '#fff',
    fontSize: '18px',
    fontWeight: 600,
    margin: 0,
  },
  closeButton: {
    width: '32px',
    height: '32px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#9ca3af',
    fontSize: '24px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    lineHeight: '1',
  },
  formGroup: {
    marginBottom: '10px',
  },
  body: {
    padding: '24px',
    overflowY: 'auto',
    flex: 1,
  },
};

/** Deck sizes a format actually calls for. Anything else is worth a second look. */
const STANDARD_DECK_SIZES = new Map([
  [60, 'Constructed'],
  [100, 'Commander'],
]);

/** How long the list must sit still before we read it back to the player. */
const PREVIEW_DEBOUNCE_MS = 2000;

/**
 * What we made of the list, section by section — the parser's reading of the
 * text, before a single card has been looked up.
 */
export type DeckPreview = {
  /** Cards that would be imported: the deck plus the command zone. */
  total: number;
  /** Cards bound for the library. */
  main: number;
  /** Cards bound for the command zone — every one of these is drawn on turn one. */
  commander: number;
  /** Cards under a sideboard-style header, which are NOT imported. */
  excluded: number;
};

/**
 * Read a deck list the way the importer will, with no network involved.
 *
 * Parsing is pure and instant while the lookup takes 12-54 seconds, so the
 * player can be told what we made of their list *as they type it* rather than
 * after a minute of waiting. That distinction is the whole point: a warning
 * arriving after the import is a postmortem, one arriving during it is a chance
 * to fix the list.
 */
export function previewDeck(text: string): DeckPreview {
  const { items, excludedCardCount } = parseDecklistWithStats(text);

  const total = items.reduce((sum, item) => sum + item.count, 0);
  const commander = items
    .filter((item) => item.commander)
    .reduce((sum, item) => sum + item.count, 0);

  return { total, main: total - commander, commander, excluded: excludedCardCount };
}

/** Is this a deck size no format asks for? An empty list is not yet a deck. */
export function isUnusualDeckSize(total: number): boolean {
  return total > 0 && !STANDARD_DECK_SIZES.has(total);
}

/**
 * Say what the list came to, and where it went.
 *
 * A deck list is the one input we can neither validate nor correct: we cannot
 * know whether 99 cards means the player forgot one, pasted a list that omits
 * the commander, or is deliberately playing something odd. What we *can* do is
 * stop importing 101 cards in silence. So show the number, show the section
 * counts that produced it — the breakdown is what turns "101?" into "ah, the
 * command zone took two" — and let the player decide.
 */
export function describeUnusualDeckSize(preview: DeckPreview): string {
  const formats = [...STANDARD_DECK_SIZES]
    .map(([size, format]) => `${size} (${format})`)
    .join(' or ');

  return (
    `This list comes to ${preview.total} cards. Decks are usually ${formats}.\n\n` +
    `If that isn't what you expected, check for a card you meant to include, ` +
    `or a section header we read as a card. You can import it anyway.`
  );
}

export function DeckImportModal({ isOpen, onClose, onDeckImported }: DeckImportModalProps) {
  const [deckText, setDeckText] = useState('');
  const [deckName, setDeckName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  // What we make of the list as it stands, refreshed once the player stops
  // typing. `null` means we have not read this text yet.
  const [deckPreview, setDeckPreview] = useState<DeckPreview | null>(null);

  // Re-read the list whenever it settles. Parsing is pure and cheap — no lookup,
  // no network — so this costs nothing but tells the player what we made of
  // their text while they can still do something about it.
  useEffect(() => {
    if (!deckText.trim()) {
      setDeckPreview(null);
      return;
    }

    const timer = setTimeout(() => setDeckPreview(previewDeck(deckText)), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [deckText]);

  const commitImport = async (deck: SavedDeck) => {
    const storage = new DeckStorageService();
    await storage.saveDeck(deck);

    setSuccessMessage(`Successfully imported ${deck.cards.length} cards!`);

    // Wait a moment to show success message, then call the callback
    setTimeout(() => {
      onDeckImported(deck);
      handleClose();
    }, 1000);
  };

  const handleImport = async () => {
    if (!deckText.trim() || !deckName.trim()) {
      setErrors(['Please provide both a deck name and deck list']);
      return;
    }

    // Read the list right now rather than waiting on the debounce: a player who
    // pastes and immediately clicks Import must not slip past the warning in the
    // two seconds before it would have appeared.
    const preview = previewDeck(deckText);
    const alreadyWarned =
      deckPreview !== null && deckPreview.total === preview.total && isUnusualDeckSize(preview.total);

    if (isUnusualDeckSize(preview.total) && !alreadyWarned) {
      setDeckPreview(preview);
      return;
    }

    setIsImporting(true);
    setErrors([]);
    setSuccessMessage('');
    setProgress({ current: 0, total: 0 });

    try {
      const importer = new MtgTextListDeckImporter((current, total) => {
        setProgress({ current, total });
      });

      const result = await importer.importFromText(deckText);

      if (result.errors && result.errors.length > 0) {
        setErrors(result.errors);
        setIsImporting(false);
        return;
      }

      if (result.cards.length === 0) {
        setErrors(['No cards could be imported. Please check your deck list format.']);
        setIsImporting(false);
        return;
      }

      const savedDeck: SavedDeck = {
        metadata: {
          id: `deck-${Date.now()}-${randomIdSuffix(7)}`,
          name: deckName,
          source: 'scryfall',
          cardCount: result.cards.length,
          importedAt: new Date(),
          lastModified: new Date(),
          ...result.metadata,
        },
        cards: result.cards,
      };

      await commitImport(savedDeck);
    } catch (error) {
      console.error('Import error:', error);
      setErrors([error instanceof Error ? error.message : 'An unknown error occurred']);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setDeckText('');
    setDeckName('');
    setErrors([]);
    setSuccessMessage('');
    setProgress({ current: 0, total: 0 });
    setDeckPreview(null);
    onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay style={styles.overlay} />
        <Dialog.Content style={styles.content} data-testid="deck-import-modal">
          <div style={styles.header}>
            <Dialog.Title style={styles.title}>Import Deck</Dialog.Title>
            <Dialog.Close style={styles.closeButton} onClick={handleClose}>×</Dialog.Close>
          </div>

          <div style={styles.body}>
          <div className="form-group">
            <label htmlFor="deck-name">Deck Name</label>
            <input
              id="deck-name"
              type="text"
              value={deckName}
              autoFocus={true}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="Deck name"
              disabled={isImporting}
            />
          </div>

          <Alert className={"mb-4"}>
            <InfoIcon />
            <AlertTitle>To automatically draw your commander...</AlertTitle>
            <AlertDescription>
              Put it under a "Commander" header in your list.
            </AlertDescription>
          </Alert>

          <div className="form-group">
            <label htmlFor="deck-list">Deck List</label>
            <textarea
              id="deck-list"
              value={deckText}
              onChange={(e) => setDeckText(e.target.value)}
              placeholder={`Enter your deck list (one card per line):
              \n1 Rhystic Study (WOT) 71\n4 Lightning Bolt\n20 Mountain`}
              rows={15}
              disabled={isImporting}
            />
          </div>

          {isImporting && progress.total > 0 && (
            <div className="progress-container">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <p className="progress-text">
                Fetching card {progress.current} of {progress.total}...
              </p>
            </div>
          )}

          {errors.length > 0 && (
            <div className="error-container" style={{ whiteSpace: 'pre-line' }}>
              <h4>Errors:</h4>
              <ul>
                {errors.map((error, idx) => (
                  <li key={idx}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {deckPreview && isUnusualDeckSize(deckPreview.total) && (
            <div className="warning-container" style={{ whiteSpace: 'pre-line' }}>
              <h4>Unusual deck size</h4>
              <p>{describeUnusualDeckSize(deckPreview)}</p>
              {/* Where the cards went. A bare "101?" is a riddle; "the command
                  zone took two" is an answer. */}
              <p className="warning-breakdown">
                Deck {deckPreview.main} · Command zone {deckPreview.commander} · Sideboard{' '}
                {deckPreview.excluded} (not imported)
              </p>
            </div>
          )}

          {successMessage && (
            <div className="success-container">
              <p>{successMessage}</p>
            </div>
          )}
          </div>

          <ModalFooter
            buttons={[
              {
                label: 'Help',
                onClick: () => setIsHelpOpen(true),
                disabled: isImporting,
                align: 'left',
              },
              {
                label: 'Cancel',
                onClick: handleClose,
                disabled: isImporting,
              },
              {
                // Once the player has been shown the size, the button says so —
                // clicking it is the acknowledgement, and no second gate follows.
                label: isImporting
                  ? 'Importing...'
                  : deckPreview && isUnusualDeckSize(deckPreview.total)
                    ? 'Import Anyway'
                    : 'Import Deck',
                onClick: handleImport,
                disabled: isImporting || !deckText.trim() || !deckName.trim(),
                variant: 'primary' as const,
              },
            ]}
          />
        </Dialog.Content>
      </Dialog.Portal>

      <DeckImportHelpDialog isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </Dialog.Root>
  );
}