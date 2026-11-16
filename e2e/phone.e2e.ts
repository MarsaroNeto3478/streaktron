// Every page at phone size (Pixel 7), light and dark, after the journey filled the account: each
// one shows its content, logs no errors and never scrolls sideways (the page itself; boards and
// heatmaps scroll inside their own boxes).

import { expect, test, type Page } from '@playwright/test';

const PAGES: [string, RegExp | string][] = [
  ['/today', /^Hi, /],
  ['/inbox', 'Inbox'],
  ['/projects', 'Projects'],
  ['/tasks', 'All tasks'],
  ['/habits', 'Habits'],
  ['/calendar', /\w/],
  ['/review', /\w/],
  ['/stats', 'Stats'],
  ['/collection', 'Collection'],
  ['/medals', 'Medals & prizes'],
  ['/settings', 'Settings'],
];

/** Errors the page logs or throws while the test runs. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function expectNoSidewaysScroll(page: Page, path: string) {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(scroll, `${path} is ${scroll}px wide on a ${width}px screen`).toBeLessThanOrEqual(width);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`every page fits a phone (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const errors = watchErrors(page);

    // A project page too: the first one in the list.
    await page.goto('/projects');
    const project = await page
      .locator('main a[href^="/projects/prj_"]')
      .first()
      .getAttribute('href');
    const pages: [string, RegExp | string][] = [...PAGES, [project!, /\w/]];

    for (const [path, heading] of pages) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first(), path).toHaveText(heading);
      await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0);
      await expect(page.locator('html'), path).toHaveClass(
        scheme === 'dark' ? /dark/ : /^(?!.*dark)/,
      );
      await expectNoSidewaysScroll(page, path);
    }
    expect(errors).toEqual([]);
  });
}

test('the theme chosen in Settings wins over the system’s, and stays after a reload', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('radio', { name: 'System' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('the bottom bar has the day-to-day pages, and More has the rest', async ({ page }) => {
  await page.goto('/today');
  const bar = page.getByRole('navigation', { name: 'Main' }).last();
  for (const name of ['Today', 'Inbox', 'Projects', 'Habits']) {
    await expect(bar.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await page.screenshot({ path: 'data/e2e-results/phone-bar.png' });

  await bar.getByRole('button', { name: 'More' }).click();
  const sheet = page.getByRole('dialog', { name: 'More' });
  const pages = sheet.getByRole('navigation', { name: 'More pages' });
  for (const name of [
    'Tasks',
    'Calendar',
    'Weekly review',
    'Stats',
    'Collection',
    'Medals',
    'Settings',
  ]) {
    await expect(pages.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  // The areas and projects, as in the sidebar.
  await expect(sheet.getByRole('link', { name: 'University' })).toBeVisible();
  // Once the sheet has slid up.
  await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await page.screenshot({ path: 'data/e2e-results/phone-more.png' });

  await pages.getByRole('link', { name: 'Stats' }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/stats/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Stats');
});
