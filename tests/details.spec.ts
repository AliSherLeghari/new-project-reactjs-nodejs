import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { makeResult } from '../frontend/src/search/testFixtures';
import {
  detailFixture,
  issueFixture,
} from '../frontend/src/details/testFixtures';

async function mockRepositoryApi(page: Page) {
  const calls: string[] = [];
  await page.route('**/api/repositories**', async (route) => {
    const url = new URL(route.request().url());
    calls.push(url.pathname + url.search);
    if (url.pathname === '/api/repositories')
      return route.fulfill({ json: makeResult() });
    if (url.pathname.endsWith('/issues')) {
      const label = url.searchParams.get('label') as
        'good-first-issue' | 'help-wanted';
      return route.fulfill({
        json:
          label === 'help-wanted'
            ? { ...issueFixture(label), issues: [] }
            : issueFixture(label),
      });
    }
    return route.fulfill({ json: { repository: detailFixture } });
  });
  return calls;
}
for (const width of [390, 1280]) {
  test(`search-first layout, details, empty issues, navigation and axe at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await mockRepositoryApi(page);
    await page.goto('/');
    await expect(page.getByLabel('Repository or topic')).toBeInViewport();
    await page.getByLabel('Repository or topic').fill('react');
    await page.getByLabel('Repository or topic').press('Enter');
    const link = page.getByRole('link', {
      name: 'View details for octocat/project-0',
    });
    await expect(link).toBeVisible();
    expect(calls).toHaveLength(1); // Opening search cards must not prefetch issues.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `test-results/phase-4-search-${width}.png`,
      fullPage: true,
    });
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/repositories\/octocat\/project-0$/);
    await expect(page.getByRole('link', { name: /Issue #42:/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(
      page
        .getByRole('region', { name: 'Repository information' })
        .getByText('Open issues & PRs'),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Issue #42:/ }),
    ).toHaveAttribute('rel', 'noopener noreferrer');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `test-results/phase-4-details-${width}.png`,
      fullPage: true,
    });
    const detailCalls = calls.filter(
      (url) => url === '/api/repositories/octocat/project-0',
    ).length;
    await page.getByLabel('Contribution label').selectOption('help-wanted');
    await expect(page.getByText(/No open “help wanted”/)).toBeVisible();
    expect(
      calls.filter((url) => url === '/api/repositories/octocat/project-0'),
    ).toHaveLength(detailCalls);
    await expect(
      page.getByRole('link', { name: /Browse all matching/ }),
    ).toHaveAttribute('href', issueFixture('help-wanted').browse_url);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `test-results/phase-4-empty-${width}.png`,
      fullPage: true,
    });
    await page.goBack();
    await expect(page.getByLabel('Repository or topic')).toHaveValue('react');
    await expect(
      page.getByRole('link', { name: 'View details for octocat/project-0' }),
    ).toBeVisible();
    await page.goForward();
    await expect(page.getByText('Owner: octocat')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: /Issue #42:/ })).toBeVisible();
    await expect(page).toHaveTitle('octocat/project-0 · OpenSource Explorer');
  });
}

test('direct not-found route and backend repository 404 are readable and accessible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/repositories/bad_owner/repo');
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  // Invalid owner travels through real Vite/Express and cannot reach GitHub.
  const invalid = await page.request.get(
    '/api/repositories/bad_owner/repo/issues',
  );
  expect(invalid.status()).toBe(400);
  await page.route('**/api/repositories/octocat/missing', (route) =>
    route.fulfill({
      status: 404,
      json: { error: { code: 'REPOSITORY_NOT_FOUND' } },
    }),
  );
  await page.goto('/repositories/octocat/missing');
  await expect(page.getByText(/Public repository not found/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: 'test-results/phase-4-not-found-390.png',
    fullPage: true,
  });
});

test('issue API failure recovers manually while repository information remains visible', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/repositories/octocat/project-0', (route) =>
    route.fulfill({ json: { repository: detailFixture } }),
  );
  await page.route(
    '**/api/repositories/octocat/project-0/issues?**',
    (route) => {
      calls++;
      return route.fulfill(
        calls === 1
          ? { status: 502, json: { error: { code: 'GITHUB_ERROR' } } }
          : { json: issueFixture() },
      );
    },
  );
  await page.goto('/repositories/octocat/project-0');
  await expect(page.getByText('Owner: octocat')).toBeVisible();
  await expect(
    page.getByText(/Repository data is temporarily unavailable/),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Retry request' }).click();
  await expect(page.getByRole('link', { name: /Issue #42:/ })).toBeVisible();
  expect(calls).toBe(2);
});

test('rate-limited details wait for manual retry and do not fetch issues prematurely', async ({
  page,
}) => {
  await page.clock.install();
  let details = 0;
  let issues = 0;
  await page.route('**/api/repositories/octocat/project-0', (route) => {
    details++;
    return route.fulfill(
      details === 1
        ? { status: 429, headers: { 'Retry-After': '2' }, json: {} }
        : { json: { repository: detailFixture } },
    );
  });
  await page.route(
    '**/api/repositories/octocat/project-0/issues?**',
    (route) => {
      issues++;
      return route.fulfill({ json: issueFixture() });
    },
  );
  await page.goto('/repositories/octocat/project-0');
  await expect(page.getByText(/Requests paused until/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retry request' }),
  ).toBeDisabled();
  expect(issues).toBe(0);
  await page.clock.fastForward(2000);
  await expect(
    page.getByRole('button', { name: 'Retry request' }),
  ).toBeEnabled();
  expect(details).toBe(1);
  await page.getByRole('button', { name: 'Retry request' }).click();
  await expect(page.getByRole('link', { name: /Issue #42:/ })).toBeVisible();
  expect(details).toBe(2);
  expect(issues).toBe(1);
});
