import {
  RSS_PARSER_VERSION,
  type MalformedSourceItem,
  type ParsedRssItem,
  type ParseResult,
  type ParseWarning,
  type PubDateState,
} from './types';
import { containsHtmlMarkup, sanitizeText } from './sanitize';

export interface ParseRssOptions {
  sourceId: string;
  rawPayloadId: string;

  observedAt: string;

  now: Date;
  parserVersion?: string;
}

const tagContent = (block: string, tag: string): string | undefined => {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : undefined;
};

const isWellFormedEnough = (xml: string): boolean => {
  if (!/<rss|<feed|<channel/i.test(xml)) return false;
  const opens = (xml.match(/<item\b[^>]*>/gi) ?? []).length;
  const closes = (xml.match(/<\/item>/gi) ?? []).length;
  return opens === closes;
};

interface PubDateResult {
  state: PubDateState;
  sourceEventTime: string | null;
}

const interpretPubDate = (rawPubDate: string | undefined, now: Date): PubDateResult => {
  if (rawPubDate === undefined || sanitizeText(rawPubDate) === '') {
    return { state: 'missing', sourceEventTime: null };
  }
  const ms = new Date(sanitizeText(rawPubDate)).getTime();
  if (Number.isNaN(ms)) {
    return { state: 'invalid', sourceEventTime: null };
  }
  if (ms > now.getTime()) {
    return { state: 'future', sourceEventTime: null };
  }
  return { state: 'valid', sourceEventTime: new Date(ms).toISOString() };
};

export const parseRss = (xml: string, opts: ParseRssOptions): ParseResult => {
  const parserVersion = opts.parserVersion ?? RSS_PARSER_VERSION;
  const quarantinedAt = opts.now.toISOString();
  const base: Omit<ParseResult, 'parsedItems' | 'malformedItems' | 'warnings'> = {
    parserVersion,
    sourceId: opts.sourceId,
    ok: true,
  };

  if (!isWellFormedEnough(xml)) {
    return {
      ...base,
      ok: false,
      parsedItems: [],
      malformedItems: [],
      warnings: [
        {
          code: 'malformed_xml',
          message: 'Payload is not well-formed RSS/XML; parse aborted.',
        },
      ],
    };
  }

  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const parsedItems: ParsedRssItem[] = [];
  const malformedItems: MalformedSourceItem[] = [];
  const warnings: ParseWarning[] = [];
  const seenIds = new Set<string>();

  itemBlocks.forEach((block, index) => {
    const rawTitle = tagContent(block, 'title');
    const rawDescription = tagContent(block, 'description') ?? tagContent(block, 'summary');
    const rawGuid = tagContent(block, 'guid');
    const rawLink = tagContent(block, 'link');
    const rawPubDate = tagContent(block, 'pubDate') ?? tagContent(block, 'published');
    const rawAuthor = tagContent(block, 'author') ?? tagContent(block, 'dc:creator');

    const title = sanitizeText(rawTitle);
    const excerpt = sanitizeText(rawDescription);
    const guid = sanitizeText(rawGuid);
    const link = sanitizeText(rawLink);
    const author = sanitizeText(rawAuthor) || undefined;

    const quarantine = (reason: string) => {
      malformedItems.push({
        malformedItemId: `mal-${opts.rawPayloadId}-${index}`,
        sourceId: opts.sourceId,
        rawPayloadId: opts.rawPayloadId,
        reason,
        rawSnippet: block.slice(0, 240),
        parserVersion,
        observedAt: opts.observedAt,
        quarantinedAt,
      });
      warnings.push({ code: reason, message: `Item ${index} quarantined: ${reason}` });
    };

    const sourceItemId = guid || link;
    if (!sourceItemId) {
      quarantine('missing_identity');
      return;
    }
    if (!title) {
      quarantine('missing_title');
      return;
    }

    if (seenIds.has(sourceItemId)) {
      warnings.push({
        code: 'duplicate_guid',
        message: `Duplicate identity dropped (kept first occurrence).`,
        sourceItemId,
      });
      return;
    }
    seenIds.add(sourceItemId);

    if (containsHtmlMarkup(rawTitle) || containsHtmlMarkup(rawDescription)) {
      warnings.push({
        code: 'html_sanitized',
        message: 'HTML markup was stripped from title/excerpt.',
        sourceItemId,
      });
    }

    const pub = interpretPubDate(rawPubDate, opts.now);
    if (pub.state === 'missing') {
      warnings.push({
        code: 'missing_pubdate',
        message: 'No pubDate; sourceEventTime is unknown (null), not observedAt.',
        sourceItemId,
      });
    } else if (pub.state === 'invalid') {
      warnings.push({
        code: 'invalid_pubdate',
        message: 'Unparseable pubDate; sourceEventTime left null.',
        sourceItemId,
      });
    } else if (pub.state === 'future') {
      warnings.push({
        code: 'future_pubdate',
        message:
          'pubDate is in the future; not treated as normal chronology (sourceEventTime null, raw preserved).',
        sourceItemId,
      });
    }

    parsedItems.push({
      sourceItemId,
      title,
      excerpt: excerpt || undefined,
      link: link || undefined,
      sourceEventTime: pub.sourceEventTime,
      pubDateState: pub.state,
      authorOrPublisher: author,
      rawGuid: guid || undefined,
      rawPubDate: rawPubDate !== undefined ? sanitizeText(rawPubDate) : undefined,
      rawPayloadId: opts.rawPayloadId,
      parserVersion,
    });
  });

  return { ...base, parsedItems, malformedItems, warnings };
};
