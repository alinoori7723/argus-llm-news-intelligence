import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PERSISTENCE_DIR = join('src', 'domain', 'persistence');

const scanDir = (rel: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(join(repoRoot, rel), { withFileTypes: true })) {
    const relPath = join(rel, entry.name);
    if (entry.isDirectory()) out.push(...scanDir(relPath));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(relPath);
  }
  return out;
};

const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const files = scanDir(PERSISTENCE_DIR);
const codeOf = (f: string) => stripComments(readFileSync(join(repoRoot, f), 'utf8'));

const FORBIDDEN: Array<[string, RegExp]> = [
  ['Date.now(', /\bDate\.now\s*\(/],
  ['argless new Date()', /new\s+Date\s*\(\s*\)/],
  ['localStorage', /\blocalStorage\b/],
  ['indexedDB', /\bindexedDB\b/i],
  ['fetch(', /(?<![.\w])fetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['axios', /\baxios\b/],
  ['undici', /\bundici\b/],
  ['got(', /\bgot\s*\(/],
  ['node-fetch', /node-fetch/],
  ['http.request', /\bhttp\.request\b/],
  ['https.request', /\bhttps\.request\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['setTimeout', /\bsetTimeout\b/],
  ['setInterval', /\bsetInterval\b/],
  ['sqlite', /\bsqlite\b/i],
  ['better-sqlite3', /better-sqlite3/i],
  ['dexie', /\bdexie\b/i],
  ['drizzle', /\bdrizzle\b/i],
  ['prisma', /\bprisma\b/i],
  ['typeorm', /\btypeorm\b/i],

  ['update(', /\bupdate\s*\(/],
  ['delete(', /\bdelete\s*\(/],
  ['upsert(', /\bupsert\s*\(/],
  ['replace(', /\breplace\s*\(/],
  ['remove(', /\bremove\s*\(/],
  ['truncate(', /\btruncate\s*\(/],
  ['clear(', /\bclear\s*\(/],
];

describe('persistence static guard — interface-first, append-only, no DB/storage/clock', () => {
  it('scans the persistence module files', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const name of [
      'index.ts',
      'types.ts',
      'appendOnlyStore.ts',
      'inMemoryAppendOnlyStore.ts',
      'replay.ts',
      'guards.ts',
    ]) {
      expect(files).toContain(join(PERSISTENCE_DIR, name));
    }
  });

  it('contains no forbidden DB / storage / network / timer / wall-clock / mutation API', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const code = codeOf(f);
      for (const [label, re] of FORBIDDEN) {
        if (re.test(code)) offenders.push(`${f}: ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('any `new Date(...)` usage is explicit-arg only (deterministic, never wall clock)', () => {
    for (const f of files) {
      const code = codeOf(f);
      const matches = code.match(/new\s+Date\s*\([^)]*\)/g) ?? [];
      for (const m of matches) {
        expect(/new\s+Date\s*\(\s*\)/.test(m)).toBe(false);
      }
    }
  });

  it('imports no DB/ORM/storage package', () => {
    const BAD_IMPORT =
      /from\s+['"](better-sqlite3|sqlite3|sqlite|dexie|drizzle-orm|drizzle|@prisma\/client|prisma|typeorm|pg|mysql2|idb|localforage)['"]/i;
    for (const f of files) {
      expect(BAD_IMPORT.test(readFileSync(join(repoRoot, f), 'utf8'))).toBe(false);
    }
  });
});
