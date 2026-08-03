/**
 * Scoring for the ⌘K palette: cmdk's default, with a relevance floor.
 *
 * ## The floor
 *
 * `command-score` is a fuzzy subsequence matcher, so almost any short query
 * matches almost any row a little. Searching "scry" used to return 13 rows —
 * "Import a deck" (0.0048), "Join our Discord" (0.0048), "Copy game link" — none
 * of which contain it in any meaningful sense. That noise is why the palette
 * felt arbitrary, and it gets worse as rows are added.
 *
 * Measured, the two populations barely overlap:
 *
 *     real, including typos    "shufle" → Shuffle deck        0.168
 *                              "discrd" → Move card to discard 0.153
 *     fuzzy noise              "mill"   → Import a deck        0.080
 *                              "scry"   → Import a deck        0.005
 *
 * so a floor of 0.1 drops the noise and keeps typo tolerance.
 *
 * ## Why there is no score bias for help rows
 *
 * Issue #164 (B3) called for multiplying help scores by 0.4, on the grounds that
 * cmdk re-sorts groups by their best-scoring item — so a strong help match would
 * float Help above Game and "draw" + Enter would open a doc instead of drawing.
 *
 * That mechanism does not work in cmdk 1.1.1. Measured in a real browser:
 * searching "scry", the help row scored **0.356** and the best Navigation row
 * **0.0048**, and Navigation still rendered first and took the selection. Group
 * order here follows source order, not score. A bias would have been a no-op
 * with a test pinning it — worse than nothing, because it would read as solved.
 *
 * What actually keeps a doc from beating the action it documents:
 *
 *   1. **Source order.** The Help group is rendered after Game/Players/
 *      Navigation in `CommandPalette`, so a runnable row wins any tie.
 *   2. **This floor.** When a query has no real action match, the junk matches
 *      are filtered out entirely rather than outranking the one good help hit.
 *
 * Both are properties of this file and `CommandPalette`, neither depends on
 * cmdk's internal ordering, and `palette_help_search.spec.ts` pins the outcomes
 * in a real browser — which is the only place they can be observed.
 */
import { defaultFilter } from 'cmdk';
import { HELP_SECTIONS, type HelpGroup } from '@/app/content/help/sections';

/**
 * Minimum score for a row to be considered a match at all. Sits in the gap
 * between the weakest real match measured (~0.15, a typo) and the strongest
 * fuzzy coincidence (~0.08).
 */
export const MIN_MATCH_SCORE = 0.1;

/** The searchable label for a help row: `Deck and piles › Deck actions`. */
export function helpRowValue(group: HelpGroup | string, title: string): string {
  return `${group} › ${title}`;
}

const normalize = (value: string) => value.trim().toLowerCase();

/** Every help row's value, normalized — used by tests and by the e2e harness. */
const HELP_VALUES: ReadonlySet<string> = new Set(
  HELP_SECTIONS.map((s) => normalize(helpRowValue(s.group, s.title))),
);

export function isHelpRowValue(value: string): boolean {
  return HELP_VALUES.has(normalize(value));
}

/** cmdk's `filter` contract: 0 hides the row, higher sorts earlier. */
export function paletteFilter(value: string, search: string, keywords?: string[]): number {
  const score = defaultFilter(value, search, keywords);
  return score < MIN_MATCH_SCORE ? 0 : score;
}
