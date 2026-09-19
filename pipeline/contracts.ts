import { z } from 'zod';

export const sourceSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(64),
    name: z.string().min(1).max(120),
    tier: z.enum(['primary', 'reputable', 'curated', 'unknown']),
    legalStatus: z.enum(['allowed', 'needs_review', 'disabled']),
    enabled: z.boolean(),
  })
  .strict();

export const articleSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(80),
    sourceId: z.string().min(1).max(64),
    title: z.string().min(1).max(240),
    text: z.string().min(1).max(6000),
    url: z
      .string()
      .url()
      .refine((value) => new URL(value).protocol === 'https:', 'HTTPS required'),
    publishedAt: z.string().datetime().nullable(),
    category: z.string().min(1).max(40),
  })
  .strict();

export const datasetSchema = z
  .object({
    schemaVersion: z.literal('dataset-v1'),
    id: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(80),
    description: z.string().max(600),
    license: z.string().min(1).max(80),
    synthetic: z.boolean(),
    observedAt: z.string().datetime(),
    sources: z.array(sourceSchema).min(1).max(32),
    articles: z.array(articleSchema).min(1).max(128),
  })
  .strict()
  .superRefine((dataset, ctx) => {
    const ids = dataset.sources.map((source) => source.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate source id' });
    const articleIds = dataset.articles.map((article) => `${article.sourceId}::${article.id}`);
    if (new Set(articleIds).size !== articleIds.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate article identity' });
    for (const article of dataset.articles) {
      if (!ids.includes(article.sourceId))
        ctx.addIssue({ code: 'custom', message: `Unknown source: ${article.sourceId}` });
    }
  });

export const summarySchema = z
  .object({
    schemaVersion: z.literal('summary-v1'),
    headline: z.string().min(1).max(160),
    claims: z
      .array(
        z
          .object({
            text: z.string().min(1).max(500),
            evidence: z
              .array(
                z
                  .object({
                    itemId: z.string().min(1).max(160),
                    quote: z.string().min(12).max(1200),
                  })
                  .strict(),
              )
              .min(1)
              .max(4),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    uncertainty: z.array(z.string().min(1).max(300)).max(4),
  })
  .strict();

export type Dataset = z.infer<typeof datasetSchema>;
export type Article = z.infer<typeof articleSchema>;
export type Summary = z.infer<typeof summarySchema>;
export type EvidenceItem = Article & {
  itemId: string;
  canonicalUrl: string;
  rawPayloadId: string;
  rawPayloadHash: string;
  contentHash: string;
  parserVersion: string;
  processingVersion: string;
  observedAt: string;
  sourceEventTime: string | null;
  verificationTier: string;
};

export type Cluster = {
  id: string;
  title: string;
  category: string;
  itemIds: string[];
  sourceIds: string[];
  eligible: boolean;
  ruleVersion: string;
};

export type Snapshot = {
  id: string;
  dataset: Dataset;
  datasetHash: string;
  items: EvidenceItem[];
  clusters: Cluster[];
  decisions: Array<{ itemA: string; itemB: string; rule: string; evidence: string }>;
  quarantined: Array<{ itemId: string; reason: string }>;
  rawPayloads: Array<{ id: string; sourceId: string; sha256: string; text: string }>;
  counts: {
    input: number;
    ingested: number;
    quarantined: number;
    duplicates: number;
    clusters: number;
  };
};

export type TokenUsage = { input: number; cachedInput: number; output: number };
export type Attempt = {
  number: number;
  status:
    | 'completed'
    | 'refused'
    | 'incomplete'
    | 'http_error'
    | 'timeout'
    | 'network_error'
    | 'invalid_response';
  latencyMs: number;
  httpStatus: number | null;
  requestId: string | null;
  usage: TokenUsage | null;
};

export type ProviderResult = {
  output: unknown;
  model: string;
  responseId: string | null;
  attempts: Attempt[];
  failure: string | null;
};

export interface SummaryProvider {
  readonly name: 'fixture' | 'openai';
  readonly model: string;
  generate(input: GenerationInput): Promise<ProviderResult>;
}

export type GenerationInput = {
  snapshotId: string;
  cluster: Cluster;
  items: EvidenceItem[];
  instructions: string;
  schema: Record<string, unknown>;
  maxOutputTokens: number;
};

export type ValidationIssue = { code: string; path: string; message: string };
export type Generation = {
  id: string;
  clusterId: string;
  status: 'accepted' | 'rejected' | 'skipped';
  provider: 'fixture' | 'openai';
  model: { requested: string; returned: string };
  prompt: { version: string; sha256: string; text: string };
  schema: { version: string; sha256: string };
  inputHash: string;
  sourceItemIds: string[];
  responseId: string | null;
  output: Summary | null;
  rawOutput: unknown;
  validation: { version: string; issues: ValidationIssue[]; checks: string[] };
  telemetry: {
    attempts: Attempt[];
    providerLatencyMs: number | null;
    usage: TokenUsage | null;
    estimatedCostUsd: number | null;
    costStatus: 'not_applicable' | 'estimated' | 'unknown';
    pricingVersion: string | null;
  };
};

export type RunArtifact = {
  schemaVersion: 'run-v1';
  runId: string;
  semanticHash: string;
  createdAt: string;
  mode: 'fixture' | 'openai';
  datasetKind: 'synthetic' | 'provided';
  versions: {
    pipeline: string;
    ingestion: string;
    dedupe: string;
    prompt: string;
    validation: string;
  };
  snapshot: Snapshot;
  generations: Generation[];
  telemetry: {
    timingKind: 'measured_local';
    stages: Array<{ name: string; durationMs: number }>;
    totalMs: number;
    providerCalls: number;
    accepted: number;
    rejected: number;
    skipped: number;
    estimatedCostUsd: number | null;
  };
};
