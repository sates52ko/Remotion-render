import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FORBIDDEN_GENERIC_TEXTS } from '../src/semantic/visualContract.ts';

/**
 * P2.0c — strip baked forbidden templates from production configs.
 *
 * The generator (scripts/lib/antidote-semantic-director.js) was cleaned first,
 * but existing config.antidote.json files still contain historical
 * FORBIDDEN_GENERIC_TEXTS callouts baked into scene.texts[]. This tool removes
 * exactly what the render gate would reject — same set, same exact-match
 * rule — so "gate exit 0" is guaranteed by construction.
 *
 * Usage:
 *   node scripts/strip-generic-templates.mjs               # all books
 *   node scripts/strip-generic-templates.mjs --slug=verity  # one book
 *   node scripts/strip-generic-templates.mjs --dry-run
 *
 * Every write is preceded by a timestamped backup (*.bak-<ts>).
 * Exit 0 = post-condition holds (0 forbidden texts remain), 1 = otherwise.
 */

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; })
);

const booksDir = path.join(rootDir, 'books');
const slugs = args.slug
  ? [String(args.slug)]
  : fs.readdirSync(booksDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(booksDir, d.name, 'config.antidote.json')))
      .map((d) => d.name);

const TS = new Date().toISOString().replace(/[:.]/g, '-');
const isForbidden = (text) => FORBIDDEN_GENERIC_TEXTS.has(String(text ?? '').toUpperCase().trim());

let totalRemoved = 0;
let totalRemaining = 0;
const summary = [];

for (const slug of slugs) {
  const cfgPath = path.join(booksDir, slug, 'config.antidote.json');
  const raw = fs.readFileSync(cfgPath, 'utf8');
  const config = JSON.parse(raw);

  let removed = 0;
  let remaining = 0;
  for (const scene of config.scenes || []) {
    if (!Array.isArray(scene.texts)) continue;
    const kept = scene.texts.filter((t) => {
      if (isForbidden(t.text)) { removed++; return false; }
      return true;
    });
    if (kept.length !== scene.texts.length) scene.texts = kept;
    for (const t of scene.texts || []) if (isForbidden(t.text)) remaining++;
  }

  if (removed > 0 && !args['dry-run']) {
    fs.writeFileSync(`${cfgPath}.bak-${TS}`, raw);
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2) + '\n');
  }

  totalRemoved += removed;
  totalRemaining += remaining;
  summary.push({ slug, removed, remaining, backup: removed > 0 && !args['dry-run'] ? `config.antidote.json.bak-${TS}` : null });
  console.log(`${slug}: ${removed} forbidden callout(s) ${args['dry-run'] ? 'would be removed (dry-run)' : 'removed'}, ${remaining} remaining${removed > 0 && !args['dry-run'] ? `, backup → config.antidote.json.bak-${TS}` : ''}`);
}

console.log(`\nTOTAL: ${totalRemoved} removed, ${totalRemaining} remaining (FORBIDDEN_GENERIC_TEXTS: ${FORBIDDEN_GENERIC_TEXTS.size} literals)`);
process.exit(totalRemaining === 0 ? 0 : 1);
