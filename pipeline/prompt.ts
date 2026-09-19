import { readFileSync } from 'node:fs';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { summarySchema } from './contracts';
import { contentHash, sha256 } from './hash';

export const PROMPT_VERSION = 'news-summary-v1';
export const PROMPT_TEXT = readFileSync(
  new URL('../prompts/news-summary-v1.txt', import.meta.url),
  'utf8',
)
  .replace(/\r\n/g, '\n')
  .trim();
export const PROMPT_HASH = sha256(PROMPT_TEXT);
const generatedSchema = zodToJsonSchema(summarySchema, { $refStrategy: 'none' });
export const OUTPUT_SCHEMA = Object.fromEntries(
  Object.entries(generatedSchema).filter(([key]) => key !== '$schema'),
);
export const SCHEMA_HASH = contentHash(OUTPUT_SCHEMA);
