import { describe, expect, it } from 'vitest';
import {
  canonicalizeUrl,
  sameCanonicalUrl,
  normalizeTitle,
  sameNormalizedTitle,
} from '@/domain/clustering';

describe('1. deterministic URL normalization (closed list)', () => {
  it('lowercases scheme + host but preserves path case', () => {
    expect(canonicalizeUrl('HTTPS://News.Example/Fed-Holds')).toBe(
      'https://news.example/Fed-Holds',
    );
  });

  it('strips known tracking params → same canonical URL', () => {
    const plain = canonicalizeUrl('https://h.example/a');
    expect(canonicalizeUrl('https://h.example/a?utm_source=tw&utm_campaign=x')).toBe(plain);
    expect(canonicalizeUrl('https://h.example/a?fbclid=abc')).toBe(plain);
    expect(canonicalizeUrl('https://h.example/a?gclid=zzz')).toBe(plain);
    expect(sameCanonicalUrl('https://h.example/a?utm_medium=email', 'https://h.example/a')).toBe(
      true,
    );
  });

  it('removes the URL fragment', () => {
    expect(sameCanonicalUrl('https://h.example/a#section', 'https://h.example/a')).toBe(true);
  });

  it('normalizes a trailing slash consistently', () => {
    expect(canonicalizeUrl('https://h.example/a/b/')).toBe(
      canonicalizeUrl('https://h.example/a/b'),
    );
  });

  it('does NOT strip meaningful (non-tracking) query params', () => {
    const c = canonicalizeUrl('https://h.example/a?id=1&ref=newsletter');
    expect(c).toContain('id=1');
    expect(c).toContain('ref=newsletter');
    expect(sameCanonicalUrl('https://h.example/a?id=1', 'https://h.example/a?id=2')).toBe(false);
  });

  it('does NOT merge different paths', () => {
    expect(sameCanonicalUrl('https://h.example/a', 'https://h.example/b')).toBe(false);
  });

  it('does NOT merge AMP vs non-AMP paths', () => {
    expect(sameCanonicalUrl('https://h.example/a-amp', 'https://h.example/a')).toBe(false);
    expect(sameCanonicalUrl('https://h.example/amp/a', 'https://h.example/a')).toBe(false);
  });

  it('refuses to canonicalize unparseable input (no guessing)', () => {
    expect(canonicalizeUrl('not a url')).toBeUndefined();
    expect(canonicalizeUrl('')).toBeUndefined();
    expect(sameCanonicalUrl(undefined, undefined)).toBe(false);
  });
});

describe('2. deterministic title normalization (closed list)', () => {
  it('normalizes case / whitespace / punctuation spacing / wrapping quotes', () => {
    expect(normalizeTitle('  Fed   Holds   Rates  ')).toBe('fed holds rates');
    expect(normalizeTitle('Fed holds rates .')).toBe('fed holds rates.');
    expect(normalizeTitle('"Fed holds rates"')).toBe('fed holds rates');
    expect(normalizeTitle('“Fed holds rates”')).toBe('fed holds rates');
  });

  it('"Fed holds rates" and "Fed holds rates steady" must NOT match', () => {
    expect(sameNormalizedTitle('Fed holds rates', 'Fed holds rates steady')).toBe(false);
  });

  it('one extra meaningful word must NOT match', () => {
    expect(sameNormalizedTitle('ECB statement', 'ECB statement summary')).toBe(false);
  });

  it('synonym-like titles must NOT match', () => {
    expect(sameNormalizedTitle('Fed holds rates', 'Fed keeps rates')).toBe(false);
  });

  it('empty / missing titles never match', () => {
    expect(sameNormalizedTitle('', '')).toBe(false);
    expect(sameNormalizedTitle(undefined, 'Fed holds rates')).toBe(false);
  });

  it('exact normalized identity DOES match (only case/spacing differs)', () => {
    expect(sameNormalizedTitle('Fed Holds Rates', '  fed   holds rates ')).toBe(true);
  });
});
