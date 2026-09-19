import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NO_ARG_NEW_DATE = /new Date\s*\(\s*\)/;
const DATE_NOW = /Date\.now\s*\(\s*\)/;

const DOMAIN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../domain');

const collectTsFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
};

describe('deterministic time guard for src/domain', () => {
  const files = collectTsFiles(DOMAIN_DIR);

  it('finds domain source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('contains no no-argument new Date() in any domain file', () => {
    const offenders = files.filter((f) => NO_ARG_NEW_DATE.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('contains no Date.now() in any domain file', () => {
    const offenders = files.filter((f) => DATE_NOW.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('explicit new Date(<value>) parsing is still permitted (sanity check)', () => {
    expect(NO_ARG_NEW_DATE.test('new Date(iso)')).toBe(false);
    expect(NO_ARG_NEW_DATE.test('new Date()')).toBe(true);
    expect(DATE_NOW.test('Date.now()')).toBe(true);
  });
});
