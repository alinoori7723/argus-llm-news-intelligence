import { summarySchema, type EvidenceItem, type Summary, type ValidationIssue } from './contracts';

export const VALIDATOR_VERSION = 'evidence-validator-v1';
export const VALIDATION_CHECKS = [
  'strict_schema',
  'known_citations',
  'exact_evidence_spans',
  'supported_numbers',
  'no_trade_actions',
];
const forbidden =
  /\b(buy now|sell now|go long|go short|execute order|guaranteed return|price will|trade signal)\b/i;
const numbers = (value: string): string[] => value.match(/\d+(?:[.,]\d+)*(?:%|bps)?/g) ?? [];

export function validateSummary(
  value: unknown,
  items: EvidenceItem[],
): { output: Summary | null; issues: ValidationIssue[] } {
  const parsed = summarySchema.safeParse(value);
  if (!parsed.success)
    return {
      output: null,
      issues: parsed.error.issues.map((issue) => ({
        code: 'schema',
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  const summary = parsed.data;
  const issues: ValidationIssue[] = [];
  const sourceMap = new Map(items.map((item) => [item.itemId, item]));
  const supported = new Set<string>();
  summary.claims.forEach((claim, index) => {
    const claimNumbers = new Set<string>();
    claim.evidence.forEach((citation, citationIndex) => {
      const path = `claims.${index}.evidence.${citationIndex}`;
      const item = sourceMap.get(citation.itemId);
      if (!item)
        issues.push({
          code: 'unknown_citation',
          path,
          message: 'Citation does not belong to the generation input.',
        });
      else if (!item.text.includes(citation.quote))
        issues.push({
          code: 'evidence_mismatch',
          path,
          message: 'Evidence must be an exact substring of the cited source text.',
        });
      else
        for (const number of numbers(citation.quote)) {
          claimNumbers.add(number);
          supported.add(number);
        }
    });
    if (numbers(claim.text).some((number) => !claimNumbers.has(number)))
      issues.push({
        code: 'unsupported_number',
        path: `claims.${index}.text`,
        message: 'A numeric claim is absent from its supporting quotes.',
      });
  });
  if (numbers(summary.headline).some((number) => !supported.has(number)))
    issues.push({
      code: 'unsupported_number',
      path: 'headline',
      message: 'A headline number is absent from cited evidence.',
    });
  const generatedText = [
    summary.headline,
    ...summary.claims.map((claim) => claim.text),
    ...summary.uncertainty,
  ].join(' ');
  if (forbidden.test(generatedText))
    issues.push({
      code: 'trade_action',
      path: 'output',
      message: 'Output includes prohibited recommendation language.',
    });
  return { output: issues.length ? null : summary, issues };
}
