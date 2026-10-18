import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  makeRepository,
  makeResult,
} from '../frontend/src/search/testFixtures';

for (const width of [390, 1280]) {
  test(`search, filters, pagination, keyboard, and accessibility at ${width}px`, async ({
    page,
  }) => {
    const calls: URL[] = [];
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/repositories?**', async (route) => {
      const url = new URL(route.request().url());
      calls.push(url);
      const pageNumber = Number(url.searchParams.get('page'));
      const result = makeResult({
        page: pageNumber,
        perPage: Number(url.searchParams.get('per_page')),
        total: 21,
      });
      if (pageNumber === 1)
        result.repositories[0] = {
          ...makeRepository(),
          name: 'a'.repeat(100),
          url: `https://github.com/octocat/${'a'.repeat(100)}`,
          description:
            '<script>alert("text only")</script>' +
            'LongDescription'.repeat(30),
          language: null,
        };
      await route.fulfill({ json: result });
    });
    await page.goto('/');
    await expect(page.getByText('Backend connected')).toBeVisible();
    expect(calls).toHaveLength(0);
    await page.getByLabel('Repository or topic').fill('react');
    await page
      .getByLabel('Language', { exact: true })
      .selectOption('typescript');
    await page.getByLabel('Sort by').selectOption('stars');
    await page.getByLabel('Order', { exact: true }).selectOption('asc');
    expect(calls).toHaveLength(0);
    await page.getByLabel('Repository or topic').press('Enter');
    await expect(
      page.getByRole('status', { name: 'Search status' }),
    ).toContainText('20 repositories');
    expect(Object.fromEntries(calls[0].searchParams)).toMatchObject({
      q: 'react',
      language: 'typescript',
      sort: 'stars',
      order: 'asc',
      page: '1',
    });
    await expect(
      page.getByRole('link', { name: /View octocat\/a+ on GitHub/ }),
    ).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.getByText('Language not specified')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `test-results/search-${width}.png`,
      fullPage: true,
    });
    const next = page.getByRole('button', { name: 'Next page' });
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('status', { name: 'Search status' }),
    ).toContainText('page 2');
    await expect(next).toBeDisabled();
    await expect(
      page.getByRole('heading', { name: 'Search results', exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: `test-results/search-page2-${width}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Previous page' }).click();
    await expect(
      page.getByRole('status', { name: 'Search status' }),
    ).toContainText('page 1');
    await page.getByLabel('Language', { exact: true }).selectOption('python');
    await expect(page.getByText(/Filters changed/)).toBeVisible();
    await expect(next).toBeDisabled();
    expect(calls).toHaveLength(3);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(
      page.getByRole('status', { name: 'Search status' }),
    ).toContainText('20 repositories');
    expect(calls[3].searchParams.get('page')).toBe('1');
    expect(calls[3].searchParams.get('language')).toBe('python');
  });
}

test('loading, error, retry, and empty results remain accessible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  let calls = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/repositories?**', async (route) => {
    calls++;
    if (calls === 1) {
      await gate;
      await route.fulfill({
        status: 502,
        json: { error: { code: 'GITHUB_ERROR' } },
      });
    } else await route.fulfill({ json: makeResult({ total: 0 }) });
  });
  await page.goto('/');
  await page.getByLabel('Repository or topic').fill('react');
  await page.getByLabel('Repository or topic').press('Enter');
  await expect(
    page.getByRole('status', { name: 'Search status' }),
  ).toContainText('Searching');
  await expect(
    page.getByRole('button', { name: 'Search', exact: true }),
  ).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  release();
  await expect(
    page.getByRole('status', { name: 'Search status' }),
  ).toContainText('valid results');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Retry search' }).click();
  await expect(
    page.getByRole('status', { name: 'Search status' }),
  ).toContainText('No repositories');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(calls).toBe(2);
});

test('rate limit enforces a local cooldown without automatic requests', async ({
  page,
}) => {
  await page.clock.install();
  let calls = 0;
  await page.route('**/api/repositories?**', async (route) => {
    calls++;
    await route.fulfill(
      calls === 1
        ? {
            status: 429,
            headers: { 'Retry-After': '3' },
            json: { error: { code: 'RATE_LIMITED', retry_after_seconds: 3 } },
          }
        : { json: makeResult() },
    );
  });
  await page.goto('/');
  await page.getByLabel('Repository or topic').fill('react');
  await page.getByLabel('Repository or topic').press('Enter');
  await expect(
    page.getByRole('status', { name: 'Retry guidance' }),
  ).toContainText('nothing will retry automatically');
  await expect(
    page.getByRole('button', { name: 'Retry search' }),
  ).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.clock.fastForward(3000);
  await expect(
    page.getByRole('button', { name: 'Retry search' }),
  ).toBeEnabled();
  expect(calls).toBe(1);
  await page.getByRole('button', { name: 'Retry search' }).click();
  await expect(
    page.getByRole('link', { name: /octocat\/project-0/ }),
  ).toBeVisible();
  expect(calls).toBe(2);
});

test('empty/oversized queries stay local and real backend validation maps to UI feedback', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/repositories?**', async (route) => {
    calls++;
    // Deliberately add an unsupported parameter. Vite and the actual Express validator handle it;
    // input rejection occurs before the backend could call GitHub.
    const url = new URL(route.request().url());
    url.searchParams.set('unsupported', '1');
    await route.continue({ url: url.href });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Enter a repository name or topic.',
  );
  await page.getByLabel('Repository or topic').fill('x'.repeat(201));
  await page.getByLabel('Repository or topic').press('Enter');
  await expect(page.getByRole('alert')).toHaveText(
    'Use 200 characters or fewer.',
  );
  expect(calls).toBe(0);
  await page.getByLabel('Repository or topic').fill('react');
  const response = page.waitForResponse(
    (res) => res.url().includes('/api/repositories') && res.status() === 400,
  );
  await page.getByLabel('Repository or topic').press('Enter');
  expect((await (await response).json()).error.code).toBe('INVALID_INPUT');
  await expect(
    page.getByRole('status', { name: 'Search status' }),
  ).toContainText('search was rejected');
  expect(calls).toBe(1);
});
