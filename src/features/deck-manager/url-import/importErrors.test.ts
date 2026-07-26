import { describe, expect, it } from 'vitest';
import { DeckSource } from './deckUrls';
import {
  DeckImportError,
  DeckImportReason,
  deckImportError,
  deckImportProblem,
  isDeckImportErrorBody,
  problemFromBody,
  problemOf,
} from './importErrors';

const REASONS: DeckImportReason[] = [
  'link_not_supported',
  'deck_not_found',
  'deck_private',
  'deck_empty',
  'deck_unreadable',
  'source_rate_limited',
  'source_unavailable',
  'source_unreachable',
  'import_queue_busy',
  'source_not_configured',
  'aura_unreachable',
  'aura_error',
];

const SOURCES: DeckSource[] = [
  'archidekt',
  'tappedout',
  'mtggoldfish',
  'edhrec',
  'edhrec-average',
  'moxfield',
];

describe('deckImportProblem', () => {
  /**
   * The property the whole module exists for. A failure with no suggested fix
   * leaves a player one move — paste the same link again — and for a private or
   * deleted deck that fails identically forever. Two players in #174 did exactly
   * that three times each and gave up.
   */
  it.each(REASONS)('gives %s something to try', (reason) => {
    const problem = deckImportProblem(reason, { source: 'archidekt' });

    expect(problem.message.length).toBeGreaterThan(0);
    expect(problem.fixes.length).toBeGreaterThan(0);
    expect(problem.fixes.every((fix) => fix.trim().length > 0)).toBe(true);
  });

  /**
   * This copy is read by people who have never heard of a status code. Anything
   * naming the shape of our system tells them nothing they can act on — and a
   * status code that genuinely helps a bug report belongs in `detail`, which is
   * rendered small and last, never in the sentence.
   */
  it.each(REASONS)('describes %s without jargon', (reason) => {
    const problem = deckImportProblem(reason, { source: 'moxfield' });
    // Example links are stripped first: an address a player can copy is the
    // opposite of jargon, and `https://` would otherwise trip the check below.
    const prose = [problem.message, ...problem.fixes].join(' ').replace(/https?:\/\/\S+/g, '');

    expect(prose).not.toMatch(/\b[45]\d\d\b/);
    expect(prose).not.toMatch(/upstream|endpoint|parse|payload|adapter|null|HTTP/i);
  });

  it.each(SOURCES)('names %s in the sentence a player reads', (source) => {
    // Except for the failures that are ours: naming the deck site there would
    // send the player off to check a deck that was never the problem.
    const problem = deckImportProblem('deck_not_found', { source });

    expect(problem.message).toMatch(/Archidekt|TappedOut|MTGGoldfish|EDHREC|Moxfield/);
  });

  /** An unrecognized link has no source, and must still read as a sentence. */
  it('falls back to a stand-in when there is no source yet', () => {
    const problem = deckImportProblem('link_not_supported');

    expect(problem.message).not.toMatch(/undefined/);
    expect(problem.fixes.join(' ')).not.toMatch(/undefined/);
  });

  it('carries a technical detail only when given one', () => {
    expect(deckImportProblem('source_unavailable', { source: 'archidekt' }).detail).toBeUndefined();
    expect(
      deckImportProblem('source_unavailable', { source: 'archidekt', detail: 'status 503' }).detail,
    ).toBe('status 503');
  });

  /**
   * "Paste the list instead" is the fallback on almost every problem — but not
   * this one. The card lookup needs the network too, so offering it to somebody
   * whose browser can't reach us would be advice that cannot work.
   */
  it('does not offer the paste-the-list fallback when the network is the problem', () => {
    const problem = deckImportProblem('aura_unreachable', { source: 'archidekt' });

    expect(problem.fixes.join(' ')).not.toMatch(/paste the text here instead/i);
  });
});

describe('deckImportError', () => {
  it('is an Error whose message is the sentence the player reads', () => {
    const error = deckImportError('deck_private', { source: 'moxfield' });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(error.problem.message);
    expect(error.problem.reason).toBe('deck_private');
  });
});

describe('problemOf', () => {
  it('keeps the explanation an intentional failure already carries', () => {
    const thrown = deckImportError('deck_empty', { source: 'tappedout' });

    expect(problemOf(thrown, { source: 'tappedout' })).toBe(thrown.problem);
  });

  /**
   * A `TypeError` message is a sentence about our source code. A player reading
   * "Cannot read properties of undefined" has been handed our bug and no way to
   * tell it apart from something they did wrong.
   */
  it.each([
    ['a stray TypeError', new TypeError("Cannot read properties of undefined (reading 'cards')")],
    ['a thrown string', 'boom'],
    ['nothing at all', undefined],
  ])('reports %s as a generic failure of ours', (_label, thrown) => {
    const problem = problemOf(thrown, { source: 'archidekt' });

    expect(problem.reason).toBe('aura_error');
    expect(problem.message).not.toMatch(/TypeError|undefined|boom/);
    expect(problem.fixes.length).toBeGreaterThan(0);
  });
});

describe('problemFromBody', () => {
  const full = {
    error: 'Aura couldn’t find that deck on Archidekt.',
    reason: 'deck_not_found',
    fixes: ['Open the link in a new tab.'],
    detail: 'Archidekt replied with status 404.',
  };

  it('repeats a fully-explained failure verbatim', () => {
    expect(problemFromBody(full, { source: 'archidekt' })).toEqual({
      reason: 'deck_not_found',
      message: full.error,
      fixes: full.fixes,
      detail: full.detail,
    });
  });

  /**
   * The shape every reply had before reasons existed. A browser holding a cached
   * build newer than the Worker it is talking to still has a real sentence in
   * front of it — throwing it away for "something went wrong" would be a
   * downgrade caused purely by deploy ordering.
   */
  it('keeps the sentence from a body that predates reasons', () => {
    const problem = problemFromBody(
      { error: 'Moxfield imports are busy right now.' },
      { source: 'moxfield' },
    );

    expect(problem.message).toBe('Moxfield imports are busy right now.');
    expect(problem.reason).toBe('aura_error');
    expect(problem.fixes.length).toBeGreaterThan(0);
  });

  it.each([
    ['a body that failed to parse', null],
    ['HTML from something that is not our endpoint', '<!doctype html>'],
    ['a body with no message in it', { status: 'nope' }],
  ])('falls back to a generic failure for %s', (_label, body) => {
    const problem = problemFromBody(body, { source: 'archidekt', detail: 'status 502' });

    expect(problem.reason).toBe('aura_error');
    expect(problem.message.length).toBeGreaterThan(0);
    expect(problem.detail).toBe('status 502');
  });
});

describe('isDeckImportErrorBody', () => {
  it.each([
    ['a full body', { error: 'x', reason: 'deck_empty', fixes: [] }, true],
    ['a message with no reason', { error: 'x' }, false],
    ['fixes that are not strings', { error: 'x', reason: 'deck_empty', fixes: [1] }, false],
    ['fixes that are not an array', { error: 'x', reason: 'deck_empty', fixes: 'nope' }, false],
    ['null', null, false],
    ['a string', 'error', false],
  ])('reads %s correctly', (_label, value, expected) => {
    expect(isDeckImportErrorBody(value)).toBe(expected);
  });
});

describe('DeckImportError', () => {
  it('survives an instanceof check across a rethrow', () => {
    const thrown: unknown = deckImportError('deck_unreadable', { source: 'edhrec' });

    expect(thrown instanceof DeckImportError).toBe(true);
    expect((thrown as DeckImportError).name).toBe('DeckImportError');
  });
});
