export const TRACKING_QUERY_PARAMS: readonly string[] = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
];

const TRACKING_SET = new Set(TRACKING_QUERY_PARAMS);

export const canonicalizeUrl = (raw: string | undefined): string | undefined => {
  if (!raw || raw.trim() === '') return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return undefined;
  }

  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = '';

  const kept: [string, string][] = [];
  for (const [key, value] of parsed.searchParams.entries()) {
    if (!TRACKING_SET.has(key.toLowerCase())) kept.push([key, value]);
  }

  parsed.search = '';
  for (const [key, value] of kept) parsed.searchParams.append(key, value);

  let out = parsed.toString();

  const u = new URL(out);
  if (u.pathname.length > 1 && u.pathname.endsWith('/') && u.search === '') {
    u.pathname = u.pathname.replace(/\/+$/, '');
    out = u.toString();
  }
  return out;
};

export const sameCanonicalUrl = (a: string | undefined, b: string | undefined): boolean => {
  const ca = canonicalizeUrl(a);
  const cb = canonicalizeUrl(b);
  return ca !== undefined && cb !== undefined && ca === cb;
};
