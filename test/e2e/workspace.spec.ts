import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('workspace screens are navigable, accessible, and reflow', async ({ page, request }) => {
  test.setTimeout(120_000);
  const sites = await (await request.get('/api/sites')).json();
  const base = `/sites/${sites[0].id}`;
  const w = await (await request.get(`/api/sites/${sites[0].id}/workspace`)).json();
  const routes = [
    base,
    ...['components', 'templates', 'pages', 'errors', 'scans'].map((k) => `${base}/${k}`),
    ...['components', 'templates', 'pages', 'errors', 'scans'].map(
      (k) => `${base}/${k}/${w[k][0].id}`,
    ),
    '/sites/new',
  ];
  const browserErrors: string[] = [];
  page.on('pageerror', (e) => browserErrors.push(e.message));
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect
      .soft(
        result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
        route,
      )
      .toEqual([]);
    const tabCount = await page.getByRole('tab').count();
    for (let index = 1; index < tabCount; index++) {
      const tab = page.getByRole('tab').nth(index);
      const tabName = await tab.textContent();
      await tab.click();
      const tabResult = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect
        .soft(
          tabResult.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
          `${route} ${tabName}`,
        )
        .toEqual([]);
    }
  }
  await page.goto(base);
  await page.screenshot({ path: 'test-results/overview.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`${base}/errors`);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBeTruthy();
  expect(browserErrors).toEqual([]);
});

test('dismissal persists, creates review feedback, and navigation keeps list state', async ({
  page,
  request,
}) => {
  const [site] = await (await request.get('/api/sites')).json();
  const w = await (await request.get(`/api/sites/${site.id}/workspace`)).json();
  const error = w.errors.find((e: any) => e.status === 'has_error');
  await page.goto(`/sites/${site.id}/errors/${error.id}`);
  await page.getByLabel('Error status', { exact: true }).selectOption('not_an_issue');
  await page.getByRole('button', { name: 'Mark Not an issue', exact: true }).click();
  await expect(page.getByLabel('Error status', { exact: true })).toHaveValue('not_an_issue');
  await page.reload();
  await expect(page.getByLabel('Error status', { exact: true })).toHaveValue('not_an_issue');
  const after = await (await request.get(`/api/sites/${site.id}/workspace`)).json();
  const dismissed = after.errors.find((e: any) => e.id === error.id);
  expect(dismissed.reviewed).toBeTruthy();
  expect(
    after.notes.some((n: any) => n.entity_id === error.id && n.type === 'false_positive'),
  ).toBeTruthy();
  await page.goto(`/sites/${site.id}/errors?page=2`);
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible();
  await page.locator('tbody td.name-cell a').first().click();
  await page.getByRole('link', { name: /Back to Errors/ }).click();
  await expect(page).toHaveURL(/page=2/);
});

test('declared fixes are verified through a real UI action and preserve evidence', async ({
  page,
  request,
}) => {
  const { readFileSync } = await import('node:fs');
  const fixture = JSON.parse(
    readFileSync('contract/fixtures/popfly-sample/scan-verify.json', 'utf8'),
  );
  const absentKeys = new Set(
    fixture.verify.filter((o: any) => o.outcome === 'not_detected').map((o: any) => o.error_key),
  );
  const [site] = await (await request.get('/api/sites')).json();
  const w = await (await request.get(`/api/sites/${site.id}/workspace`)).json();
  const error = w.errors.find((e: any) => e.status === 'has_error' && absentKeys.has(e.error_key));
  const capture = error.snapshot.screenshot_url;
  await page.goto(`/sites/${site.id}/errors/${error.id}`);
  await page.getByLabel('Error status', { exact: true }).selectOption('in_progress');
  await expect(page.getByLabel('Error status', { exact: true })).toHaveValue('in_progress');
  await page.goto(`/sites/${site.id}`);
  await page.getByRole('button', { name: 'Scan declared fixes', exact: true }).click();
  await expect
    .poll(
      async () => {
        const current = await (await request.get(`/api/sites/${site.id}/workspace`)).json();
        return current.errors.find((e: any) => e.id === error.id)?.status;
      },
      { timeout: 15000 },
    )
    .toBe('fixed');
  await page.goto(`/sites/${site.id}/errors/${error.id}`);
  await expect(page.getByLabel('Error status', { exact: true })).toHaveValue('fixed');
  const current = await (await request.get(`/api/sites/${site.id}/workspace`)).json();
  expect(current.errors.find((e: any) => e.id === error.id).snapshot.screenshot_url).toBe(capture);
  expect(current.scans[0].summary.fixed).toBe(1);
});

test('skip link and dialogs support keyboard focus', async ({ page, request }) => {
  const [site] = await (await request.get('/api/sites')).json();
  const w = await (await request.get(`/api/sites/${site.id}/workspace`)).json();
  await page.goto(`/sites/${site.id}/errors/${w.errors[0].id}`);
  await expect(page.locator('main h1')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  const add = page.getByRole('button', { name: 'Add note', exact: true });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(add).toBeFocused();
});
