const WRAPPING_QUOTES: ReadonlyArray<[string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['‘', '’'],
];

const stripWrappingQuotes = (s: string): string => {
  for (const [open, close] of WRAPPING_QUOTES) {
    if (s.length >= 2 && s.startsWith(open) && s.endsWith(close)) {
      return s.slice(1, -1).trim();
    }
  }
  return s;
};

export const normalizeTitle = (raw: string | undefined): string => {
  if (!raw) return '';
  let s = raw.trim();
  s = stripWrappingQuotes(s);
  s = s.toLowerCase();
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\s+([,.;:!?])/g, '$1');
  return s.trim();
};

export const sameNormalizedTitle = (a: string | undefined, b: string | undefined): boolean => {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  return na !== '' && nb !== '' && na === nb;
};
