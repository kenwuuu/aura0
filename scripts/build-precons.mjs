/**
 * Build the precon catalog shipped to the app.
 *
 * Reads the source decklists in `precons_new/` (a hand-maintained Moxfield-style
 * CSV export, one deck per file) and emits lightweight, format-agnostic JSON that
 * the runtime hydrates on demand via the card API:
 *
 *   public/precons/index.json   — PreconSummary[] (the picker's catalog)
 *   public/precons/<id>.json    — PreconList (one deck's card list, no images)
 *
 * This is the ONLY place that knows the source CSV format. A future precon source
 * in a different shape just needs its own reader feeding the same PreconEntry.
 *
 * The deck is exactly the rows whose `boardType` is `mainboard` or `commanders`
 * (verified to sum to 100 for every deck); tokens/emblems/related cards and stray
 * sideboard rows carry a different boardType and are dropped.
 *
 * Run: `npm run build:precons`. Commit the generated JSON.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC_DIR = join(ROOT, 'precons_new');
const OUT_DIR = join(ROOT, 'public', 'precons');

const DECK_BOARDS = new Set(['mainboard', 'commanders']);
const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'];

/** Kebab-case slug: accent-fold, `&`→`and`, collapse non-alphanumerics to `-`. */
function slugify(s) {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Filename is `<DeckName> (<Set> Precon Decklist).csv`. Split on the paren group. */
function parseFileName(file) {
  const stem = basename(file, '.csv').trim();
  const m = stem.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (!m) return { name: stem, set: '' };
  return {
    name: m[1].trim(),
    set: m[2].replace(/\s*Precon Decklist\s*$/i, '').trim(),
  };
}

/** Color identity comes as a Python-list string, e.g. "['B', 'G', 'W']". */
function extractColors(raw) {
  const found = new Set((raw || '').match(/[WUBRG]/g) || []);
  return COLOR_ORDER.filter((c) => found.has(c));
}

function cell(row, key) {
  return (row[key] ?? '').trim();
}

function buildDeck(file) {
  const raw = readFileSync(join(SRC_DIR, file), 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });

  const { name, set } = parseFileName(file);
  const deckRows = rows.filter((r) => DECK_BOARDS.has(cell(r, 'boardType')));
  const commanderRows = deckRows.filter((r) => cell(r, 'boardType') === 'commanders');

  const cards = deckRows.map((r) => ({
    quantity: Math.round(Number(cell(r, 'quantity'))),
    name: r['info.name'],
    setCode: cell(r, 'info.set'),
    collectorNumber: cell(r, 'info.cn'),
    scryfallId: cell(r, 'info.scryfall_id'),
    commander: cell(r, 'boardType') === 'commanders',
  }));

  const cardCount = cards.reduce((sum, c) => sum + c.quantity, 0);
  const colors = COLOR_ORDER.filter((c) =>
    commanderRows.some((r) => extractColors(cell(r, 'info.color_identity')).includes(c)),
  );

  return {
    list: { id: '', name, set, cards },
    summary: {
      id: '',
      name,
      set,
      setCode: commanderRows[0] ? cell(commanderRows[0], 'info.set') : (cards[0]?.setCode ?? ''),
      colors,
      commanderNames: commanderRows.map((r) => r['info.name']),
      cardCount,
    },
  };
}

function main() {
  if (!existsSync(SRC_DIR)) {
    console.error(`Source directory not found: ${SRC_DIR}`);
    process.exit(1);
  }

  // Clear stale output (renamed decks leave orphaned files otherwise).
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith('.csv')).sort();
  const summaries = [];
  const usedIds = new Map();
  const problems = [];

  for (const file of files) {
    const { list, summary } = buildDeck(file);

    // `<name>-<set>` already disambiguates the 12 cross-set name collisions;
    // the counter is a last-resort guard so an id is never silently reused.
    let id = slugify(`${summary.name} ${summary.set}`);
    if (usedIds.has(id)) {
      const n = usedIds.get(id) + 1;
      usedIds.set(id, n);
      id = `${id}-${n}`;
    }
    usedIds.set(id, usedIds.get(id) ?? 1);

    list.id = id;
    summary.id = id;

    if (summary.cardCount !== 100) {
      problems.push(`${file}: ${summary.cardCount} cards (expected 100)`);
    }
    if (summary.commanderNames.length === 0) {
      problems.push(`${file}: no commander row`);
    }

    writeFileSync(join(OUT_DIR, `${id}.json`), JSON.stringify(list));
    summaries.push(summary);
  }

  summaries.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(summaries, null, 2) + '\n');

  console.log(`Wrote ${summaries.length} precons to ${OUT_DIR}`);
  console.log(`  partner decks (>1 commander): ${summaries.filter((s) => s.commanderNames.length > 1).length}`);
  if (problems.length) {
    console.warn(`\n${problems.length} problem(s):`);
    for (const p of problems) console.warn(`  - ${p}`);
    process.exitCode = 1;
  }
}

main();
