const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
};

const stripCdata = (input: string): string => input.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

const stripTags = (input: string): string => input.replace(/<\/?[^>]*>/g, '');

const decodeEntities = (input: string): string => {
  let out = input;
  for (const [entity, value] of Object.entries(NAMED_ENTITIES)) {
    out = out.split(entity).join(value);
  }

  out = out.replace(/&#(\d+);/g, (_m, code: string) => {
    const n = Number(code);
    return Number.isFinite(n) ? String.fromCodePoint(n) : _m;
  });
  return out;
};

const collapseWhitespace = (input: string): string => input.replace(/\s+/g, ' ').trim();

export const sanitizeText = (input: string | undefined | null): string => {
  if (!input) return '';
  return collapseWhitespace(decodeEntities(stripTags(stripCdata(input))));
};

export const containsHtmlMarkup = (input: string | undefined | null): boolean => {
  if (!input) return false;
  return /<\/?[a-zA-Z][^>]*>/.test(stripCdata(input));
};

export const stableHash = (input: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
};
