import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { makeResult } from '../frontend/src/search/testFixtures';
import {
  detailFixture,
  issueFixture,
} from '../frontend/src/details/testFixtures';

for (const width of [360, 390, 768, 1280]) {
  test(`built single-origin application, navigation, reduced motion and accessibility at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/repositories**', (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/repositories')
        return route.fulfill({ json: makeResult() });
      if (url.pathname.endsWith('/issues'))
        return route.fulfill({
          json:
            url.searchParams.get('label') === 'help-wanted'
              ? { ...issueFixture('help-wanted'), issues: [] }
              : issueFixture(),
        });
      return route.fulfill({ json: { repository: detailFixture } });
    });
    const response = await page.goto('/');
    expect(response?.headers()['content-security-policy']).toContain(
      "script-src 'self'",
    );
    await expect(page.getByText('Backend connected')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('link', { name: 'Skip to content' }),
    ).toBeFocused();
    await page.getByLabel('Repository or topic').fill('react');
    await page.getByLabel('Repository or topic').press('Enter');
    const detail = page.getByRole('link', {
      name: 'View details for octocat/project-0',
    });
    await expect(detail).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `test-results/phase-5-search-${width}.png`,
      fullPage: true,
    });
    await detail.click();
    await expect(page.getByRole('link', { name: /Issue #42:/ })).toBeVisible();
    const deepLink = page.url();
    await page.reload();
    await expect(page.getByText('Owner: octocat')).toBeVisible();
    expect(page.url()).toBe(deepLink);
    await page.getByLabel('Contribution label').selectOption('help-wanted');
    await expect(page.getByText(/No open “help wanted”/)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() => getComputedStyle(document.body).scrollBehavior),
    ).toBe('auto');
    await page.screenshot({
      path: `test-results/phase-5-details-${width}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}
test('production API/static boundaries and CSP enforce the served release', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = "document.body.dataset.inlineExecuted='yes'";
    document.body.append(script);
  });
  expect(
    await page.locator('body').getAttribute('data-inline-executed'),
  ).toBeNull();
  const ready = await request.get('/api/ready');
  expect(ready.status()).toBe(200);
  expect((await ready.json()).status).toBe('ready');
  const health = await request.get('/api/health');
  expect((await health.json()).status).toBe('ok');
  const invalid = await request.get('/api/unknown', {
    headers: { Accept: 'text/html' },
  });
  expect(invalid.status()).toBe(404);
  expect(invalid.headers()['content-type']).toContain('application/json');
  const missing = await request.get('/assets/missing.js');
  expect(missing.status()).toBe(404);
  const shell = await request.get('/repositories/octocat/project-0');
  expect(shell.status()).toBe(200);
  expect(await shell.text()).toContain('id="root"');
  const html = await (await request.get('/')).text();
  const src = html.match(/src="([^"]+\.js)"/)?.[1];
  expect(src).toBeTruthy();
  const asset = await request.get(src!);
  expect(asset.status()).toBe(200);
  expect(asset.headers()['cache-control']).toContain('immutable');
});
