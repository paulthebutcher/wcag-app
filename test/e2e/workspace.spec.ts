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

  await page.getByRole('button', { name: 'Full page', exact: true }).click();
  const full = page.getByRole('img', { name: /Highlighted finding locations/ });
  await expect(full).toHaveAttribute(
    'viewBox',
    `0 0 ${error.snapshot.screenshot_dimensions.width} ${error.snapshot.screenshot_dimensions.height}`,
  );
  await page.getByRole('button', { name: 'Element', exact: true }).click();
  await expect(screenshot).toHaveAttribute('viewBox', '4 136 242 158');

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

test('site setup preserves invalid input and isolates newly saved sites', async ({
  page,
  request,
}) => {
  const [sample] = await (await request.get('/api/sites')).json();
  await page.goto('/sites/new');
  await page.getByLabel('Site name', { exact: true }).fill('Client review');
  await page.getByLabel('Website URL').fill(sample.url);
  await page.getByRole('button', { name: 'Add site', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('This site is already added');
  await expect(page.getByLabel('Site name', { exact: true })).toHaveValue('Client review');
  await page.getByLabel('Website URL').fill('https://client-review.example');
  await page.getByRole('button', { name: 'Add site', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Client review');
  await expect(page.getByRole('button', { name: 'Run first scan' })).toBeEnabled();
  await page.getByRole('button', { name: 'Run first scan' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Sample mode only scans the bundled Popfly site',
  );
  await page.getByLabel('Current site', { exact: true }).selectOption(sample.id);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(sample.name);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  for (const name of ['Components & Global', 'Templates', 'Pages', 'Errors', 'Scans', 'Overview']) {
    await nav.getByRole('link', { name: new RegExp('^' + name.replace('&', '\\&')) }).click();
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('.active')).toHaveCount(1);
  }
});

test('filters dismiss with Escape, empty states clear, and brief selection spans pages', async ({
  page,
}) => {
  await page.goto('/sites/popfly/errors');
  const status = page.locator('.filter-multi').filter({ hasText: 'Status' });
  await status.locator('summary').click();
  await status.getByLabel('Not an issue', { exact: true }).click();
  await expect(status.getByLabel('Not an issue', { exact: true })).toBeChecked();
  await expect(page).toHaveURL(/status=not_an_issue/);
  await page.keyboard.press('Escape');
  await expect(status).not.toHaveAttribute('open', '');
  await expect(status.locator('summary')).toBeFocused();
  await page.getByLabel('Reviewed filter').selectOption('not_reviewed');
  await expect(page.getByRole('heading', { name: 'No matching results' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('heading', { name: 'No matching results' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Create fix brief', exact: true }).click();
  const selectPage = page.getByRole('checkbox', { name: 'Select eligible rows on this page' });
  await selectPage.check();
  const count = await page.locator('tbody input:checked').count();
  expect(count).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(
    page.getByText(`${count} selected across all pages and filters.`, { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(selectPage).toBeChecked();
  await selectPage.uncheck();
  await expect(page.getByRole('button', { name: 'Create brief from 0 selected' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel selection' }).click();
  await expect(selectPage).toHaveCount(0);
});

test('notes, inherited feedback, human review, and group removal remain inspectable', async ({
  page,
  request,
}) => {
  const w = await (await request.get('/api/sites/popfly/workspace')).json();
  const error = w.errors.find((entry: any) => entry.component_id && entry.status === 'has_error');
  const base = '/sites/popfly';
  await page.goto(`${base}/components/${error.component_id}`);
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Save note' })).toBeDisabled();
  await dialog.getByLabel('Note type').selectOption('wrong_remediation');
  await dialog
    .getByRole('textbox')
    .fill('Check the shared footer styles before changing each page.');
  await dialog.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByRole('status')).toContainText('Note added');
  await page.getByRole('tab', { name: /^Notes/ }).click();
  await expect(
    page.getByText('Check the shared footer styles before changing each page.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reviewed', exact: true }).click();
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.locator('.detail-meta .reviewed')).toContainText('Reviewed');
  await page.goto(`${base}/errors/${error.id}?tab=notes`);
  await expect(
    page.getByText('Check the shared footer styles before changing each page.'),
  ).toBeVisible();
  await expect(page.getByText('Inherited from Component:', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Remove from group' }).click();
  await expect(page.getByRole('button', { name: 'Remove from group' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByText('Removed from group', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Removed from group', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download feedback JSON' }).click();
  const { readFileSync } = await import('node:fs');
  const feedback = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  expect(feedback.site_id).toBe('popfly');
  expect(feedback.records.some((r: any) => r.type === 'wrong_remediation')).toBe(true);
  expect(
    feedback.records.some((r: any) => r.record_type === 'group_removal' && r.error_id === error.id),
  ).toBe(true);
});

test('group declaration, full rescan, frozen changes and read state work together', async ({
  page,
  request,
}) => {
  const workspace = () =>
    request.get('/api/sites/popfly/workspace').then((response) => response.json());
  const before = await workspace();
  const group = before.components.find((entry: any) =>
    before.errors.some((e: any) => e.component_id === entry.id && e.status === 'has_error'),
  );
  const members = before.errors.filter(
    (entry: any) => entry.component_id === group.id && entry.status === 'has_error',
  );
  await page.goto(`/sites/popfly/components/${group.id}`);
  await page.getByRole('button', { name: 'Declare fixed', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Declare fixed', exact: true })).toBeDisabled();
  const declared = await workspace();
  for (const entry of members)
    expect(declared.errors.find((e: any) => e.id === entry.id).status).toBe('in_progress');
  await page
    .getByRole('navigation')
    .getByRole('link', { name: /^Scans/ })
    .click();
  await page.getByRole('button', { name: 'Rescan previous pages' }).click();
  await expect.poll(async () => (await workspace()).scans.length).toBe(before.scans.length + 1);
  await expect.poll(async () => (await workspace()).scans[0].state).toBe('completed');
  await page.reload();
  await page.locator('tbody .name-cell a').first().click();
  await expect(page.getByRole('heading', { name: 'Scan summary' })).toBeVisible();
  await page.getByRole('tab', { name: 'Changes', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Frozen scan changes' })).toBeVisible();
  await page.getByRole('tab', { name: 'Coverage', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Coverage', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Back to Scans/ }).click();
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect
    .poll(
      async () =>
        (await workspace()).scans.filter(
          (entry: any) => entry.state === 'completed' && !entry.read_at,
        ).length,
    )
    .toBe(0);
});

test('invalid and stale receipts preserve user input and require another preview', async ({
  page,
  request,
}) => {
  const w = await (await request.get('/api/sites/popfly/workspace')).json();
  const error = w.errors.find((e: any) => e.status === 'has_error');
  const { token } = await (await request.get('/api/session')).json();
  const headers = { 'x-session-token': token };
  const brief = await (
    await request.post('/api/sites/popfly/fix-briefs', { headers, data: { error_ids: [error.id] } })
  ).json();
  await page.goto('/sites/popfly/errors');
  await page.getByRole('button', { name: 'Paste fix receipt' }).click();
  await page.getByLabel('Receipt JSON').fill('not JSON');
  await page.getByRole('button', { name: 'Preview findings' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Paste the JSON receipt');
  await expect(page.getByLabel('Receipt JSON')).toHaveValue('not JSON');
  const receipt = JSON.stringify({ brief_id: brief.id, addressed: [{ id: 'F-001' }] });
  await page.getByLabel('Receipt JSON').fill('```json\n' + receipt + '\n```');
  await page.getByRole('button', { name: 'Preview findings' }).click();
  await expect(page.getByRole('button', { name: 'Mark 1 In progress' })).toBeEnabled();
  const changed = await request.post(`/api/sites/popfly/errors/${error.id}/status`, {
    headers,
    data: { status: 'not_an_issue', status_revision: error.status_revision },
  });
  expect(changed.ok()).toBe(true);
  await page.getByRole('button', { name: 'Mark 1 In progress' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Preview the receipt again',
  );
  await page.getByRole('button', { name: 'Back to receipt' }).click();
  await expect(page.getByLabel('Receipt JSON')).toHaveValue('```json\n' + receipt + '\n```');
  await page.getByRole('button', { name: 'Preview findings' }).click();
  await expect(page.getByText('Finding is closed', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark 0 In progress' })).toBeDisabled();
});

test('PDF failures stay in the app and successful responses download a PDF', async ({
  page,
  request,
}) => {
  const endpoint = '/api/sites/popfly/workspace';
  const w = await (await request.get(endpoint)).json();
  const scan = w.scans.find((entry: any) => entry.state === 'completed');
  scan.provenance = { kind: 'engine' };
  await page.route('**' + endpoint, (route) => route.fulfill({ json: w }));
  const report = `**/api/sites/popfly/scans/${scan.id}/report.pdf`;
  await page.route(report, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { message: 'Report service unavailable. Try again.' } },
    }),
  );
  await page.goto(`/sites/popfly/scans/${scan.id}`);
  await page.getByRole('button', { name: 'Download scan PDF' }).click();
  await expect(page.getByRole('alert')).toContainText('Report service unavailable');
  await expect(page.getByRole('heading', { name: 'Scan summary' })).toBeVisible();
  await page.unroute(report);
  await page.route(report, (route) =>
    route.fulfill({ contentType: 'application/json', body: '{}' }),
  );
  await page.getByRole('button', { name: 'Download scan PDF' }).click();
  await expect(page.getByRole('alert')).toContainText('The engine did not return a PDF');
  await page.unroute(report);
  // A minimal PDF response exercises transport only. It is not a scan evidence fixture.
  await page.route(report, (route) =>
    route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' }),
  );
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download scan PDF' }).click();
  expect((await downloaded).suggestedFilename()).toBe(`scan-${scan.id}.pdf`);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('mobile navigation, dialogs, and reduced motion remain accessible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/sites/popfly/errors');
  const open = page.getByRole('button', { name: 'Open navigation' });
  await open.click();
  const navigation = page.getByRole('dialog', { name: 'Workspace navigation' });
  await expect(navigation.getByLabel('Current site')).toBeVisible();
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  );
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
  await open.click();
  await navigation.getByRole('link', { name: 'Components & Global', exact: true }).click();
  await expect(navigation).toHaveCount(0);
  await expect(page.locator('main h1')).toHaveText('Components & Global');
  await page.getByRole('button', { name: 'Paste fix receipt' }).click();
  await expect(page.getByRole('dialog', { name: 'Fix receipt' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  expect(
    await page.getByRole('dialog').evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  const receiptAudit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(receiptAudit.violations.map((v) => v.id)).toEqual([]);
});

test('initial connection failure recovers through Reconnect', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/sites', (route) =>
    unavailable
      ? route.fulfill({
          status: 503,
          json: { error: { message: 'Workspace temporarily unavailable' } },
        })
      : route.continue(),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Workspace unavailable' })).toBeVisible();
  unavailable = false;
  await page.getByRole('button', { name: 'Reconnect' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Popfly');
  await expect(page.getByLabel('Current site')).toHaveValue('popfly');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a failed capture explains the problem and can be retried', async ({ page, request }) => {
  const w = await (await request.get('/api/sites/popfly/workspace')).json();
  const error = w.errors.find((entry: any) => entry.snapshot?.screenshot_url);
  let fail = true;
  await page.route('**' + error.snapshot.screenshot_url, (route) =>
    fail ? route.abort() : route.continue(),
  );
  await page.goto(`/sites/popfly/errors/${error.id}`);
  await expect(page.getByText('The saved capture could not be loaded.')).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Retry capture' }).click();
  await expect(page.getByRole('img', { name: /Captured page evidence/ })).toBeVisible();
  await expect(page.getByText('The saved capture could not be loaded.')).toHaveCount(0);
});

test('all screen types reflow at 320px and support 200 percent text size', async ({
  page,
  request,
}) => {
  const w = await (await request.get('/api/sites/popfly/workspace')).json();
  const kinds = ['components', 'templates', 'pages', 'errors', 'scans'];
  const routes = [
    '/sites/popfly',
    '/sites/new',
    ...kinds.map((kind) => '/sites/popfly/' + kind),
    ...kinds.map((kind) => `/sites/popfly/${kind}/${w[kind][0].id}`),
  ];
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('main h1')).toBeVisible();
      if (width === 1440) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      expect
        .soft(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
          `${route}, width ${width}, ${width === 1440 ? '200%' : '100%'} text`,
        )
        .toBe(true);
    }
  }
});
