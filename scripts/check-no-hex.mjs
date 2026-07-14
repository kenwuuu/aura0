#!/usr/bin/env node
/**
 * Pre-commit guard: rejects new chrome color literals outside the token layer.
 * See docs/styling.md — src/tokens.css is the ONLY home for hex/rgba chrome
 * values; components consume tokens (Tailwind utilities or var(--*)).
 *
 * Invoked by lint-staged with the staged file paths as arguments.
 *
 * Allowed:
 *  - src/tokens.css (the token source) and token-template data files
 *  - test files
 *  - pure black/white alphas (shadows/scrims: rgba(0,0,0,…), rgba(255,255,255,…))
 *  - the sanctioned translucent surface literals rgba(8,8,12,…)/rgba(13,13,20,…)
 *    (--bg/--bg-2 with alpha — CSS vars can't carry alpha without color-mix)
 *  - SVG data URIs (can't read CSS vars)
 *  - lines carrying a `hex-ok` comment (escape hatch for data colors — say why)
 */
import { readFileSync } from 'node:fs';

const EXEMPT_FILES = [
  'src/tokens.css',
  'src/features/game-actions/defaultTokenTemplates.ts',
];

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const RGBA = /rgba?\(/;
const RGBA_ALLOWED = /rgba?\(\s*(0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255|8\s*,\s*8\s*,\s*12|13\s*,\s*13\s*,\s*20)\s*[,)]/;

const failures = [];

for (const file of process.argv.slice(2)) {
  const rel = file.replace(/\\/g, '/').replace(/^.*?(src\/)/, '$1');
  if (!/\.(tsx?|css)$/.test(rel)) continue;
  if (/\.test\.(tsx?|css)$/.test(rel)) continue;
  if (EXEMPT_FILES.some((f) => rel.endsWith(f))) continue;

  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes('hex-ok') || line.includes('data:image')) return;
    if (HEX.test(line)) {
      failures.push(`${rel}:${i + 1}: hex literal — use a token from src/tokens.css\n    ${line.trim()}`);
    } else if (RGBA.test(line) && !RGBA_ALLOWED.test(line)) {
      failures.push(`${rel}:${i + 1}: rgba literal — use a token or color-mix(...var(--*)...)\n    ${line.trim()}`);
    }
  });
}

if (failures.length) {
  console.error('\nChrome color literals outside the token layer (docs/styling.md):\n');
  for (const f of failures) console.error('  ' + f);
  console.error(
    '\nFix: reference src/tokens.css (bg-surface / border-line-2 / var(--accent) / color-mix),' +
      "\nor append a `/* hex-ok: <reason> */` comment if it's genuinely a data color.\n",
  );
  process.exit(1);
}
