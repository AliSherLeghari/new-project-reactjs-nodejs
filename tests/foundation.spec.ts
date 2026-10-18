import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test(`real connectivity and accessible layout at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText('Backend connected');
    await expect(page).toHaveTitle('OpenSource Explorer');
    await expect(page.getByRole('button', { name: /Search/ })).toBeDisabled();
    await page.getByLabel('Repository or topic').fill('react');
    await page.getByLabel('Language').selectOption('TypeScript');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `test-results/home-${viewport.width}.png`,
      fullPage: true,
    });
  });
}
test('keyboard navigation and recovery from a real HTTP failure', async ({
  page,
}) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ status: 503, body: '{}' }),
  );
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused();
  await expect(page.getByRole('status')).toContainText('Backend unavailable');
  await page.unroute('**/api/health');
  await page.getByRole('button', { name: 'Retry connection' }).click();
  await expect(page.getByRole('status')).toHaveText('Backend connected');
});
