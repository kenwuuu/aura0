import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { MtgTextListDeckImporter } from '@/features/deck-manager';
import { DeckStorageService } from '@/infrastructure/persistence';
import { SavedDeck } from '@/features/player/types';
import { DeckImportHelpDialog } from './DeckImportHelpDialog';
import { isSideboardCard, parseDecklistWithStats } from './DeckListParser';
import { ModalFooter } from '@/shared/components/ModalFooter';
import {ArrowLeft, InfoIcon} from "lucide-react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/shared/ui/alert"
import { randomIdSuffix } from '@/shared/utils/ids';
import {
  DeckImportProblem,
  DeckSource,
  fetchImportedDeck,
  parseDeckUrl,
  problemOf,
  sourceLabel,
  toDecklistText,
} from './url-import';
import { DeckImportProblemNotice } from './DeckImportProblemNotice';
import { decklistTextForEditing } from './savedDeckText';

interface DeckImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeckImported: (deck: SavedDeck) => void;
  /**
   * The deck being edited, if this is an edit rather than a new import.
   *
   * Editing is the same dialog on purpose: a saved deck *is* its decklist, so
   * "change my deck" and "import a deck" are the same act on the same text, with
   * the same parser, preview, size warning and lookup behind them. The only
   * differences are where the result lands — over this deck's id instead of a
   * new one — and that the result is handed back through `onDeckUpdated`.
   */
  editing?: SavedDeck;
  /**
   * Called instead of `onDeckImported` when an edit is saved.
   *
   * Kept separate because the two mean different things to the caller: a fresh
   * import is a deck the player just chose and wants in play, while an edit is a
   * deck they were only correcting — loading that one would reset the board of
   * whoever was mid-game when they fixed a typo.
   */
  onDeckUpdated?: (deck: SavedDeck) => void;
  /**
   * Return to the deck list this dialog was opened from.
   *
   * Distinct from `onClose`, which puts the player back in the game: both ways
   * into this dialog come from the deck list, so "not this one" almost always
   * means "let me pick another", not "forget the whole thing". Omit it and no
   * back button is offered — a caller that opened this dialog from somewhere
   * else has nowhere to send the player back to.
   */
  onBack?: () => void;
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
  // The back button and the title read as one unit — "← Import Deck" — so they
  // share the left side and leave `space-between` to push Close to the right.
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  backButton: {
    width: '32px',
    height: '32px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#9ca3af',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    // Pull the arrow out to the panel's edge so it lines up with the body's
    // padding rather than sitting indented from it.
    marginLeft: '-8px',
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
  /** Cards bound for the sideboard pile. Imported, but not part of the deck. */
  sideboard: number;
  /**
   * Cards under a maybeboard/wishlist/token header: withheld and genuinely
   * dropped. Kept apart from `sideboard` because the two used to be one number
   * and no longer mean the same thing — one lands in a zone the player can pull
   * cards out of, the other doesn't land anywhere.
   */
  dropped: number;
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
  const { items, excluded, excludedCardCount } = parseDecklistWithStats(text);

  const total = items.reduce((sum, item) => sum + item.count, 0);
  const commander = items
    .filter((item) => item.commander)
    .reduce((sum, item) => sum + item.count, 0);

  const sideboard = excluded
    .filter(isSideboardCard)
    .reduce((sum, item) => sum + item.count, 0);

  return {
    total,
    main: total - commander,
    commander,
    sideboard,
    dropped: excludedCardCount - sideboard,
  };
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

export function DeckImportModal({
  isOpen,
  onClose,
  onDeckImported,
  editing,
  onDeckUpdated,
  onBack,
}: DeckImportModalProps) {
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
  // Set while a pasted deck link is being fetched and turned into a list.
  const [resolvingUrlFrom, setResolvingUrlFrom] = useState<DeckSource | null>(null);
  /**
   * Why the last deck link failed, and what to suggest about it.
   *
   * Kept apart from `errors` because the two are different kinds of thing.
   * `errors` is a list of cards a lookup couldn't find — genuinely many, and
   * each one its own line. A link failure is one event with one explanation and
   * a handful of suggested fixes, and flattening it into a list of strings is
   * what threw the fixes away.
   */
  const [urlProblem, setUrlProblem] = useState<DeckImportProblem | null>(null);
  /**
   * Whether the player has typed in the name field themselves.
   *
   * A name we filled in from a deck link has to stay replaceable — otherwise
   * pasting a second link leaves the first deck's name behind. "The field is
   * non-empty" cannot tell those apart, so we track who put the text there.
   */
  const nameEditedByPlayer = useRef(false);
  /**
   * The list this dialog opened with, when it opened on an existing deck.
   *
   * Kept so saving can tell a real edit from a deck the player opened, read, and
   * left alone — see `handleImport`, where an untouched list skips the lookup
   * entirely.
   */
  const openedWithText = useRef('');

  /**
   * Fill the fields when the dialog opens.
   *
   * Editing seeds the list the deck was saved from rather than starting empty,
   * which is what makes "edit" a real edit: the player changes the line they
   * came to change and the other ninety-nine arrive back exactly as they were.
   */
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const seed = editing === undefined ? '' : decklistTextForEditing(editing);
    setDeckText(seed);
    setDeckName(editing === undefined ? '' : editing.metadata.name);
    openedWithText.current = seed;
    // A name carried in from a saved deck is the player's own, not a default we
    // filled in — so a link pasted into the box must not overwrite it.
    nameEditedByPlayer.current = editing !== undefined;
  }, [isOpen, editing]);

  /**
   * Turn a pasted deck link into a decklist, in place.
   *
   * Resolving into the same textarea rather than behind a separate "import from
   * URL" mode is what keeps this honest: the player sees the exact list that is
   * about to be imported, and can edit it first. It also means everything
   * downstream — the size warning, the preview, the import itself — keeps
   * working on text and needs no knowledge of where the text came from.
   */
  useEffect(() => {
    const ref = parseDeckUrl(deckText);
    // Not a link — including the decklist we just replaced it with, which is
    // what keeps this from looping.
    if (ref === null || isImporting) {
      return;
    }

    const controller = new AbortController();
    setResolvingUrlFrom(ref.source);
    setErrors([]);
    setUrlProblem(null);

    fetchImportedDeck(ref, controller.signal)
      .then((deck) => {
        setDeckText(toDecklistText(deck));
        // The deck's own name is a default, never an override: a name the
        // player typed is a decision and survives. A name we filled in from an
        // earlier link is not, so a second link replaces it. Clearing the field
        // hands it back to us.
        setDeckName((current) =>
          nameEditedByPlayer.current && current.trim().length > 0 ? current : deck.name,
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        // `problemOf` is what keeps a stray `TypeError` from reaching the
        // dialog: an unexpected throw becomes a generic failure described as
        // ours, never a sentence about our source code shown to the player.
        setUrlProblem(problemOf(error, { source: ref.source }));
      })
      .finally(() => setResolvingUrlFrom(null));

    return () => controller.abort();
  }, [deckText, isImporting]);

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

  /**
   * Write the deck and hand it back.
   *
   * `saveDeck` is a put keyed on `metadata.id`, so an edit overwrites the record
   * it came from for the same reason a new import creates one — the id decides,
   * and nothing else has to know which of the two happened.
   */
  const commitImport = async (deck: SavedDeck) => {
    const storage = new DeckStorageService();
    await storage.saveDeck(deck);

    setSuccessMessage(
      editing === undefined
        ? `Successfully imported ${deck.cards.length} cards!`
        : `Saved "${deck.metadata.name}" — ${deck.cards.length} cards.`,
    );

    // Wait a moment to show success message, then call the callback
    setTimeout(() => {
      if (editing === undefined) {
        onDeckImported(deck);
      } else {
        onDeckUpdated?.(deck);
      }
      handleClose();
    }, 1000);
  };

  const handleImport = async () => {
    if (!deckText.trim() || !deckName.trim()) {
      setErrors(['Please provide both a deck name and deck list']);
      return;
    }

    // An edit that left the list alone is a rename, and a rename has no cards to
    // look up. Re-importing here would spend a minute resolving names that are
    // already resolved — and worse, it would put a working deck back through a
    // lookup that can fail, so a deck could come back smaller than it went in.
    // The saved cards are the ones this text produced; keep them.
    if (editing !== undefined && deckText.trim() === openedWithText.current.trim()) {
      await commitImport({
        ...editing,
        metadata: { ...editing.metadata, name: deckName, lastModified: new Date() },
      });
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
    setUrlProblem(null);
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
          source: 'scryfall',
          // The deck's size, not the import's: the sideboard is saved alongside
          // the deck, never counted as part of it.
          cardCount: result.cards.length,
          importedAt: new Date(),
          lastModified: new Date(),
          ...result.metadata,
          // After the spread, not before it: the importer sets its own
          // `importedAt`/`lastModified`, so anything that must survive an edit
          // has to be written last or the spread quietly puts it back.
          //
          // Reusing the id is the whole of "overwrite": the store is keyed on it.
          id: editing?.metadata.id ?? `deck-${Date.now()}-${randomIdSuffix(7)}`,
          name: deckName,
          // When this deck first entered the collection, not when it was last
          // corrected — that is what `lastModified` is for.
          ...(editing ? { importedAt: editing.metadata.importedAt } : {}),
        },
        cards: result.cards,
        ...(result.sideboard ? { sideboard: result.sideboard } : {}),
        // Kept so the next edit reopens this exact list, printings and all,
        // instead of a version rebuilt from cards that no longer names them.
        decklistText: deckText,
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
    nameEditedByPlayer.current = false;
    openedWithText.current = '';
    setErrors([]);
    setUrlProblem(null);
    setSuccessMessage('');
    setProgress({ current: 0, total: 0 });
    setDeckPreview(null);
    onClose();
  };

  /**
   * Leave for the deck list.
   *
   * Clears the form on the way out, exactly as closing does — going back is a
   * decision not to import *this* list, so a half-typed one has no reason to
   * still be sitting there on the next visit.
   */
  const handleBack = () => {
    handleClose();
    onBack?.();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay style={styles.overlay} />
        <Dialog.Content style={styles.content} data-testid="deck-import-modal">
          <div style={styles.header}>
            <div style={styles.headerLeft}>
              {onBack !== undefined && (
                <button
                  type="button"
                  style={styles.backButton}
                  onClick={handleBack}
                  disabled={isImporting}
                  title="Back to deck list"
                  aria-label="Back to deck list"
                  data-testid="deck-import-back"
                >
                  <ArrowLeft size={20} aria-hidden="true" />
                </button>
              )}
              <Dialog.Title style={styles.title}>
                {editing === undefined ? 'Import Deck' : 'Edit Deck'}
              </Dialog.Title>
            </div>
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
              onChange={(e) => {
                nameEditedByPlayer.current = true;
                setDeckName(e.target.value);
              }}
              placeholder="Deck name"
              disabled={isImporting}
            />
          </div>

          <Alert className={"mb-4"}>
            <InfoIcon />
            <AlertTitle>To automatically draw your commander...</AlertTitle>
            <AlertDescription>
              Put it under a "Commander" header in your list — or paste an
              Archidekt or EDHREC link, which carries the commander across for you.
            </AlertDescription>
          </Alert>

          <div className="form-group">
            <label htmlFor="deck-list">Deck List</label>
            <textarea
              id="deck-list"
              value={deckText}
              onChange={(e) => setDeckText(e.target.value)}
              placeholder={`Paste a deck link (Archidekt, TappedOut, MTGGoldfish, EDHREC), or enter your deck list (one card per line):
              \nhttps://archidekt.com/decks/24569510\n\n1 Rhystic Study (WOT) 71\n4 Lightning Bolt\n20 Mountain`}
              rows={15}
              disabled={isImporting || resolvingUrlFrom !== null}
            />
          </div>

          {resolvingUrlFrom !== null && (
            <p className="progress-text" data-testid="deck-url-resolving">
              Reading your deck from {sourceLabel(resolvingUrlFrom)}...
            </p>
          )}

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

          {urlProblem !== null && <DeckImportProblemNotice problem={urlProblem} />}

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
                  zone took two" is an answer. The sideboard is named because it
                  is imported now — and anything still being dropped is named
                  separately, since that is the part a player might want back. */}
              <p className="warning-breakdown">
                Deck {deckPreview.main} · Command zone {deckPreview.commander} · Sideboard{' '}
                {deckPreview.sideboard}
                {deckPreview.dropped > 0 && ` · ${deckPreview.dropped} not imported`}
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
                    ? editing === undefined
                      ? 'Import Anyway'
                      : 'Save Anyway'
                    : editing === undefined
                      ? 'Import Deck'
                      : 'Save Changes',
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