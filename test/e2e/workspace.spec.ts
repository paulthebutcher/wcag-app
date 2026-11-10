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
    if (
      ['components', 'templates', 'pages', 'errors', 'scans'].some(
        (kind) => route === base + '/' + kind,
      )
    ) {
      await expect(page.getByText('SITE WORKSPACE', { exact: true })).toHaveCount(0);
    }
    if (route === base + '/components') {
      await expect(page.locator('tbody .element-label').first()).not.toHaveText(
        'Element not recorded',
      );
    }
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

test('finding evidence crops its matching screenshot and highlights the element', async ({
  page,
  request,
}) => {
  const [site] = await (await request.get('/api/sites')).json();
  const endpoint = '/api/sites/' + site.id + '/workspace';
  const workspace = await (await request.get(endpoint)).json();
  const error = workspace.errors.find((entry: any) => entry.snapshot?.screenshot_dimensions);
  expect(error).toBeDefined();
  error.snapshot.screenshot_capture = 'after_scroll';
  error.finding.evidence.bbox = { x: 100, y: 200, width: 50, height: 30 };
  await page.route('**' + endpoint, (route) => route.fulfill({ json: workspace }));
  await page.goto('/sites/' + site.id + '/errors/' + error.id);
  const screenshot = page.getByRole('img', { name: /Highlighted element in the capture/ });
  await expect(screenshot).toBeVisible();
  await expect(screenshot).toHaveAttribute('viewBox', '4 136 242 158');
  await expect(screenshot.locator('rect').first()).toHaveAttribute('x', '100');
  await expect(page.getByText('Element in context · Captured after scrolling')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open full capture' })).toHaveAttribute(
    'href',
    error.snapshot.screenshot_url,
  );

  const historical = error.observations.find(
    (observation: any) => observation.snapshot?.screenshot_url,
  );
  expect(historical).toBeDefined();
  await page.goto('/sites/' + site.id + '/errors/' + error.id + '?observation=' + historical.id);
  await expect(page.getByRole('img', { name: /Captured page evidence for/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /Highlighted element in the capture/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole('link', { name: 'Open full capture' })).toHaveAttribute(
    'href',
    historical.snapshot.screenshot_url,
  );
});

test('a fix brief receipt previews exact rows and verifies only the confirmed selection', async ({
  page,
  request,
}) => {
  const { readFileSync } = await import('node:fs');
  const fixture = JSON.parse(
    readFileSync('contract/fixtures/popfly-sample/scan-verify.json', 'utf8'),
  );
  const absentKeys = new Set(
    fixture.verify
      .filter((row: any) => row.outcome === 'not_detected')
      .map((row: any) => row.error_key),
  );
  const [site] = await (await request.get('/api/sites')).json();
  const base = '/sites/' + site.id;
  const workspace = () =>
    request.get('/api' + base + '/workspace').then((response) => response.json());
  const current = await workspace();
  const first = current.errors.find(
    (error: any) => error.status === 'has_error' && absentKeys.has(error.error_key),
  );
  expect(first).toBeDefined();
  const other = current.errors.find(
    (error: any) =>
      error.status === 'has_error' && error.page_id === first.page_id && error.id !== first.id,
  );
  expect(other).toBeDefined();

  await page.goto(
    base + '/errors?status=has_error&criterion=' + first.criterion + ',' + other.criterion,
  );
  await page.getByRole('button', { name: 'Create fix brief', exact: true }).click();
  for (const error of [first, other]) {
    const row = page.getByRole('row').filter({ has: page.locator('#row-' + error.id) });
    await row.getByRole('checkbox').check();
  }
  await page.getByRole('button', { name: 'Create brief from 2 selected' }).click();
  const download = page.getByRole('link', { name: 'Download fix brief' });
  const downloaded = page.waitForEvent('download');
  await download.click();
  const brief = readFileSync((await (await downloaded).path())!, 'utf8');
  const briefId = brief.match(/"brief_id": "([^"]+)"/)?.[1];
  expect(briefId).toBeTruthy();
  expect(brief).toContain('## F-002');
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await page.getByRole('button', { name: 'Paste fix receipt' }).click();
  const receipt = {
    brief_id: briefId,
    addressed: [{ id: 'F-001', note: 'Updated the markup' }, { id: 'F-002' }, { id: 'F-999' }],
  };
  await page.getByLabel('Receipt JSON').fill(JSON.stringify(receipt));
  await page.getByRole('button', { name: 'Preview findings' }).click();
  await expect(page.getByText('Unknown ID in this brief')).toBeVisible();
  const dialog = page.getByRole('dialog', { name: 'Fix receipt' });
  await expect(dialog.locator('a[href="' + base + '/errors/' + first.id + '"]')).toBeVisible();
  await expect(dialog.locator('a[href="' + base + '/errors/' + other.id + '"]')).toBeVisible();
  expect((await workspace()).errors.find((error: any) => error.id === first.id).status).toBe(
    'has_error',
  );
  await dialog.getByRole('checkbox', { name: /Select F-002/ }).uncheck();
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations.map((violation) => violation.id)).toEqual([]);
  await page.getByRole('button', { name: 'Mark 1 In progress' }).click();
  await expect(page.getByText('1 finding marked In progress')).toBeVisible();
  const after = await workspace();
  expect(after.errors.find((error: any) => error.id === first.id).status).toBe('in_progress');
  expect(after.errors.find((error: any) => error.id === other.id).status).toBe('has_error');
  await page.getByRole('link', { name: 'Open Scans' }).click();
  await page.getByRole('button', { name: 'Scan declared fixes' }).click();
  await expect
    .poll(async () => (await workspace()).errors.find((error: any) => error.id === first.id).status)
    .toBe('fixed');
});
