// Compile the design-system Tailwind v4 stylesheet the converter can't produce
// itself (esbuild doesn't run Tailwind). Uses the repo's own @tailwindcss/node
// + @tailwindcss/oxide (exact installed version, resolves tw-animate-css from
// repo node_modules). Output → .design-sync/.cache/ds-tailwind.css, which
// cfg.cssEntry points at.
//
// RE-SYNC: run this BEFORE the converter (package-build.mjs / resync.mjs)
// whenever tokens.css, the scoped components, or authored previews change:
//   node .design-sync/build-css.mjs
import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ENTRY = resolve('.design-sync/tailwind-entry.css');
const OUT = resolve('.design-sync/.cache/ds-tailwind.css');
const base = dirname(ENTRY);

const input = readFileSync(ENTRY, 'utf8');
const compiler = await compile(input, { base, onDependency() {} });
const scanner = new Scanner({ sources: compiler.sources ?? [] });
const candidates = scanner.scan();
const css = compiler.build(candidates);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, css);
console.error(`  css compiled: ${(css.length / 1024).toFixed(0)} KB from ${candidates.length} candidates → ${OUT}`);
