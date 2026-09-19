import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const scanDir = (rel: string): string[] => {
  const dir = join(repoRoot, rel);
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relPath = join(rel, entry.name);
    if (entry.isDirectory()) {
      if (relPath === join('src', '__tests__')) continue;
      out.push(...scanDir(relPath));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      out.push(relPath);
    }
  }
  return out;
};

const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const hasGlobalFetchCall = (code: string): boolean => {
  const re = /(?<![.\w])fetch\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const after = code.slice(m.index + m[0].length);
    if (/^\s*\)/.test(after)) continue;
    if (/^\s*[\w$]+\s*[?:]/.test(after)) continue;
    return true;
  }
  return false;
};

const FORBIDDEN_APIS: Array<[string, RegExp]> = [
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
  ['localStorage', /\blocalStorage\b/],
  ['indexedDB', /\bindexedDB\b/],
];

const activeFiles = scanDir('src');

describe('No-Network Repo Guard — active src is offline-only', () => {
  it('scans a meaningful set of active runtime files (not just one folder)', () => {
    expect(activeFiles.length).toBeGreaterThan(20);

    expect(activeFiles.some((f) => f.includes(join('domain', 'sourceReadiness')))).toBe(true);
    expect(activeFiles.some((f) => f.includes(join('domain', 'ingestion')))).toBe(true);
    expect(activeFiles.some((f) => f.includes(join('ingestion', 'fetchers')))).toBe(true);
  });

  it('no active src file performs a real global fetch() network call', () => {
    const offenders = activeFiles.filter((f) =>
      hasGlobalFetchCall(stripComments(readFileSync(join(repoRoot, f), 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });

  it('no active src file uses any other network / timer / storage API', () => {
    const offenders: string[] = [];
    for (const f of activeFiles) {
      const code = stripComments(readFileSync(join(repoRoot, f), 'utf8'));
      for (const [name, re] of FORBIDDEN_APIS) {
        if (re.test(code)) offenders.push(`${f}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the deleted real RSS HTTP fetcher is gone and unreferenced by active src', () => {
    expect(activeFiles.some((f) => /rssHttpFetcher/i.test(f))).toBe(false);
    const importers = activeFiles.filter((f) =>
      /rssHttpFetcher|RssHttpFetcher/.test(readFileSync(join(repoRoot, f), 'utf8')),
    );
    expect(importers).toEqual([]);
  });

  it('detector fires on a real fetch(url, …) call (regression sentinel)', () => {
    const offending = `const res = await fetch(url, { headers: { accept: 'x' } });`;
    expect(hasGlobalFetchCall(stripComments(offending))).toBe(true);
  });

  it('detector does NOT fire on legitimate offline interface methods', () => {
    expect(hasGlobalFetchCall('await fetcher.fetch(source, ctx);')).toBe(false);

    expect(hasGlobalFetchCall('fetch(source: SourceProfile, ctx: FetchContext): Promise<X>;')).toBe(
      false,
    );
    expect(hasGlobalFetchCall('async fetch(source: SourceProfile, _ctx: FetchContext) {}')).toBe(
      false,
    );

    expect(hasGlobalFetchCall('read(request: SourceFetchRequest): FetchTransportResult;')).toBe(
      false,
    );
  });
});

describe('No-Network Guard — data fixtures + recording-script boundary', () => {
  it('the guard scans only .ts/.tsx code files, never .xml/.json data fixtures', () => {
    expect(activeFiles.every((f) => /\.(ts|tsx)$/.test(f))).toBe(true);

    const fedXml = join('src', 'fixtures', 'recordedSources', 'fed', 'press_all.rss.xml');
    const fedMeta = join('src', 'fixtures', 'recordedSources', 'fed', 'press_all.meta.json');
    expect(activeFiles).not.toContain(fedXml);
    expect(activeFiles).not.toContain(fedMeta);
  });

  it('recorded RSS XML containing http(s):// (and even literal "fetch(" text) cannot weaken the guard', () => {
    const fedXmlPath = resolve(repoRoot, 'src/fixtures/recordedSources/fed/press_all.rss.xml');
    expect(existsSync(fedXmlPath)).toBe(true);
    expect(readFileSync(fedXmlPath, 'utf8')).toMatch(/https?:\/\//);

    expect(hasGlobalFetchCall('<link>https://example.gov/x</link> fetch(url)')).toBe(true);
    expect(hasGlobalFetchCall('const u = "https://example.gov/feeds/press.xml";')).toBe(false);
  });

  it('the manual recording script lives OUTSIDE src and is not imported by active src', () => {
    expect(existsSync(resolve(repoRoot, 'scripts/record-fed-rss.ts'))).toBe(true);
    expect(activeFiles.some((f) => f.includes('record-fed-rss'))).toBe(false);

    const importers = activeFiles.filter((f) => {
      const code = readFileSync(join(repoRoot, f), 'utf8');
      return (
        /\b(import|require)\b[^;\n]*record-fed-rss/.test(code) ||
        /from\s+['"][^'"]*scripts\//.test(code)
      );
    });
    expect(importers).toEqual([]);
  });

  it('the recording script (which DOES contain a real fetch) is not part of active src', () => {
    const scriptPath = resolve(repoRoot, 'scripts/record-fed-rss.ts');
    expect(hasGlobalFetchCall(stripComments(readFileSync(scriptPath, 'utf8')))).toBe(true);
    expect(activeFiles.every((f) => f.startsWith('src'))).toBe(true);
    expect(activeFiles.some((f) => f.startsWith('scripts'))).toBe(false);
  });
});

describe('No-Network Guard — Phase 2.12 multi-feed recorder + fixtures boundary', () => {
  const FEED_FIXTURES = [
    'monetary_policy.rss.xml',
    'monetary_policy.meta.json',
    'all_speeches.rss.xml',
    'all_speeches.meta.json',
    'all_testimony.rss.xml',
    'all_testimony.meta.json',
  ];

  it('the reusable multi-feed recorder exists OUTSIDE src and is not imported by active src', () => {
    expect(existsSync(resolve(repoRoot, 'scripts/record-fed-rss-feed.ts'))).toBe(true);
    expect(activeFiles.some((f) => f.includes('record-fed-rss-feed'))).toBe(false);
    const importers = activeFiles.filter((f) => {
      const code = readFileSync(join(repoRoot, f), 'utf8');
      return (
        /\b(import|require)\b[^;\n]*record-fed-rss-feed/.test(code) ||
        /from\s+['"][^'"]*scripts\//.test(code)
      );
    });
    expect(importers).toEqual([]);
  });

  it('the multi-feed recorder DOES contain a real fetch but is not in the guarded set', () => {
    const scriptPath = resolve(repoRoot, 'scripts/record-fed-rss-feed.ts');
    expect(hasGlobalFetchCall(stripComments(readFileSync(scriptPath, 'utf8')))).toBe(true);
    expect(activeFiles.some((f) => f.includes('record-fed-rss-feed'))).toBe(false);
  });

  it('the new recorded .xml/.json data fixtures are NOT scanned as code', () => {
    for (const name of FEED_FIXTURES) {
      const rel = join('src', 'fixtures', 'recordedSources', 'fed', name);
      expect(existsSync(resolve(repoRoot, rel))).toBe(true);
      expect(activeFiles).not.toContain(rel);
    }
  });
});
