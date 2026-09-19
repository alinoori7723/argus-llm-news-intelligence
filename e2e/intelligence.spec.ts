import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test.beforeAll(() => mkdirSync('docs/screenshots', { recursive: true }));

test('overview exposes source evidence and records the actual rendered dashboard', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'News intelligence', exact: true })).toBeVisible();
  await expect(
    page.getByText('Fixture summaries · no live model call · no API key required'),
  ).toBeVisible();
  await expect(page.locator('.intel-summary-card')).toHaveCount(4);
  await page.screenshot({
    path: 'docs/screenshots/overview.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page
    .getByRole('button', { name: /^Inspect evidence/ })
    .first()
    .click();
  const evidence = page.getByRole('region', { name: 'Source evidence' });
  await expect(evidence).toBeVisible();
  await expect(evidence.getByText('Content SHA-256', { exact: true })).toBeVisible();
  await evidence.getByText('Inspect raw RSS payload').click();
  await expect(evidence.locator('pre')).toContainText('<rss version="2.0">');
  expect(errors).toEqual([]);
});

test('source explorer exposes withheld records without raw payloads', async ({ page }) => {
  await page.goto('/#/lineage');
  await expect(page.locator('tbody tr')).toHaveCount(12);
  await page.screenshot({
    path: 'docs/screenshots/lineage.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Quarantined', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByText('No raw payload', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Inspect', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ingested', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(10);
  await page.getByRole('textbox', { name: 'Search source records' }).fill('does-not-exist');
  await expect(page.getByText('No source records match this search.')).toBeVisible();
});

test('audit connects output, prompt, validation and raw generation metadata', async ({ page }) => {
  await page.goto('/#/audit');
  await expect(page.locator('.intel-audit-claim')).toHaveCount(2);
  await page.screenshot({
    path: 'docs/screenshots/audit.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Prompt & contract' }).click();
  await expect(page.locator('.intel-prompt')).toContainText('untrusted data');
  await expect(page.getByText('Prompt SHA-256', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Validation', exact: true }).click();
  await expect(page.locator('.intel-validation-row')).toHaveCount(5);
  await expect(page.getByText(/does not prove semantic entailment/)).toBeVisible();
  await page.getByRole('button', { name: 'Raw JSON', exact: true }).click();
  await expect(page.locator('.intel-json')).toContainText('extractive-fixture-v1');
  await expect(page.locator('.intel-json')).toContainText('"providerLatencyMs": null');
  await page.locator('.intel-generation-list button').filter({ hasText: 'skipped' }).click();
  await expect(page.getByRole('heading', { name: 'Generation withheld' })).toBeVisible();
});

test('runtime distinguishes measured local timing from absent provider telemetry', async ({
  page,
}) => {
  await page.goto('/#/runtime');
  await expect(page.getByText('No provider call was made.', { exact: false })).toBeVisible();
  await expect(page.getByText('$0.00', { exact: true })).toBeVisible();
  await expect(page.locator('.intel-runtime-identities dd').first()).toHaveText(/^[a-f0-9]{64}$/);
  await page.screenshot({
    path: 'docs/screenshots/runtime.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Reproduce run' }).click();
  await expect(page.getByRole('region', { name: 'Reproduce this run' })).toContainText(
    'pnpm demo:verify',
  );
});

test('mobile navigation remains usable without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'News intelligence', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: 'docs/screenshots/mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page
    .getByRole('navigation', { name: 'Intelligence workspace' })
    .getByRole('link', { name: 'Generation audit' })
    .click();
  await expect(page.getByRole('heading', { name: 'Generation audit', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
