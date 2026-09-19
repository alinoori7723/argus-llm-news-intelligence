import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RECORDING_TOOL_VERSION = 'record-fed-rss-feed-v1';
const SOURCE_READINESS_RULE_VERSION = 'source-readiness-rule-v1';
const FETCH_CONTRACT_VERSION = 'fetch-contract-v1';
const PARSER_VERSION = 'rss-parser-v1';
const ACQUISITION_MODE = 'manual_recording_only';
const RUNTIME_MODE = 'recorded_fixture_only';
const MAX_PAYLOAD_BYTES = 5_000_000;
const ACCEPTED_CONTENT_TYPES = ['application/rss+xml', 'application/xml', 'text/xml'];

interface FeedSpec {
  sourceId: string;
  url: string;
  xmlFile: string;
  metaFile: string;
  legalEvidenceNote: string;
}

const FEEDS: Record<string, FeedSpec> = {
  fed_monetary_policy: {
    sourceId: 'fed_monetary_policy',
    url: 'https://www.federalreserve.gov/feeds/press_monetary.xml',
    xmlFile: 'monetary_policy.rss.xml',
    metaFile: 'monetary_policy.meta.json',
    legalEvidenceNote:
      'Official Federal Reserve Board RSS feed page lists "Monetary Policy" under ' +
      'Press Releases and describes RSS reader/subscription usage. Recorded once for ' +
      'offline development; no automatic polling. https://www.federalreserve.gov/feeds/feeds.htm',
  },
  fed_all_speeches: {
    sourceId: 'fed_all_speeches',
    url: 'https://www.federalreserve.gov/feeds/speeches.xml',
    xmlFile: 'all_speeches.rss.xml',
    metaFile: 'all_speeches.meta.json',
    legalEvidenceNote:
      'Official Federal Reserve Board RSS feed page lists "All Speeches" under ' +
      'Speeches & Testimony and describes RSS reader/subscription usage. Recorded once ' +
      'for offline development; no automatic polling. https://www.federalreserve.gov/feeds/feeds.htm',
  },
  fed_all_testimony: {
    sourceId: 'fed_all_testimony',
    url: 'https://www.federalreserve.gov/feeds/testimony.xml',
    xmlFile: 'all_testimony.rss.xml',
    metaFile: 'all_testimony.meta.json',
    legalEvidenceNote:
      'Official Federal Reserve Board RSS feed page lists "All Testimony" under ' +
      'Speeches & Testimony and describes RSS reader/subscription usage. Recorded once ' +
      'for offline development; no automatic polling. https://www.federalreserve.gov/feeds/feeds.htm',
  },
};

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outDir = resolve(repoRoot, 'src/fixtures/recordedSources/fed');

const main = async (): Promise<void> => {
  const feedKey = process.argv[2];
  if (!feedKey) {
    throw new Error(`Missing feed key. Allowed: ${Object.keys(FEEDS).join(', ')}`);
  }
  const spec = FEEDS[feedKey];
  if (!spec) {
    throw new Error(`Unknown feed key "${feedKey}". Allowed: ${Object.keys(FEEDS).join(', ')}`);
  }

  const xmlPath = resolve(outDir, spec.xmlFile);
  const metaPath = resolve(outDir, spec.metaFile);

  const observedAt = new Date().toISOString();
  console.log(`[record-fed-rss-feed] ${spec.sourceId} GET ${spec.url}`);

  const res = await fetch(spec.url, {
    method: 'GET',
    headers: { accept: ACCEPTED_CONTENT_TYPES.join(', ') },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`Non-200 response: HTTP ${res.status} ${res.statusText}`);
  }

  const rawContentType = res.headers.get('content-type') ?? '';
  const contentType = rawContentType.split(';')[0].trim();
  if (contentType && !ACCEPTED_CONTENT_TYPES.includes(contentType)) {
    throw new Error(`Unexpected content-type: ${contentType}`);
  }

  const payloadText = await res.text();
  const byteLength = Buffer.byteLength(payloadText, 'utf8');
  if (byteLength === 0) throw new Error('Empty payload');
  if (byteLength > MAX_PAYLOAD_BYTES) {
    throw new Error(`Payload too large: ${byteLength} > ${MAX_PAYLOAD_BYTES}`);
  }
  if (!/<rss|<feed|<channel/i.test(payloadText)) {
    throw new Error('Payload does not look like RSS/XML');
  }

  const sha256 = createHash('sha256').update(payloadText, 'utf8').digest('hex');

  const recordedAt = new Date().toISOString();

  const meta = {
    sourceId: spec.sourceId,
    sourceUrl: spec.url,
    observedAt,
    recordedAt,
    contentType: contentType || 'text/xml',
    byteLength,
    sha256,
    recordingToolVersion: RECORDING_TOOL_VERSION,
    sourceReadinessRuleVersion: SOURCE_READINESS_RULE_VERSION,
    fetchContractVersion: FETCH_CONTRACT_VERSION,
    parserVersion: PARSER_VERSION,
    legalEvidenceNote: spec.legalEvidenceNote,
    acquisitionMode: ACQUISITION_MODE,
    runtimeMode: RUNTIME_MODE,
    sourceAuthority: 'official_primary_source',
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(xmlPath, payloadText, 'utf8');
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');

  console.log(`[record-fed-rss-feed] wrote ${xmlPath} (${byteLength} bytes)`);
  console.log(`[record-fed-rss-feed] sha256 ${sha256}`);
  console.log(`[record-fed-rss-feed] wrote ${metaPath}`);
};

main().catch((err) => {
  console.error(`[record-fed-rss-feed] FAILED: ${(err as Error).message}`);
  process.exitCode = 1;
});
