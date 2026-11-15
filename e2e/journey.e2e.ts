// The daily loop, end to end (plan.md Phase 6): Streaky's tour walks a new account through an area,
// a project, a task on its board and completing it; each step is a quest that pays XP and a box; the
// box opens in the Collection. Then capture from anywhere, and the keyboard on the board.

import { expect, test, type Page } from '@playwright/test';

const streaky = (page: Page) => page.getByRole('region', { name: 'Streaky' });
const xpBar = (page: Page) => page.getByRole('progressbar', { name: 'XP to the next level' });
// The chip in the top bar (the sidebar's Collection link counts them too).
const boxes = (page: Page) => page.getByTitle('Open your loot boxes');

test.describe.configure({ mode: 'serial' });

test('Streaky’s tour: area, project, task, complete; XP, quests and boxes', async ({ page }) => {
  await page.goto('/today');
  await expect(xpBar(page)).toHaveAttribute('aria-valuenow', '0');
  await expect(boxes(page)).toHaveCount(0);

  await streaky(page).getByRole('button', { name: 'Show me around' }).click();
  await streaky(page).getByRole('button', { name: 'I’m not sure, skip this' }).click();
  await expect(streaky(page).getByText('Step 1 of 5')).toBeVisible();

  // 1. An area, from Streaky's button. The step is a quest: XP and a box right away.
  await streaky(page)
    .getByRole('button', { name: /Create an area/ })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill('University');
  await dialog.getByRole('button', { name: 'Create area' }).click();
  await expect(streaky(page).getByText('Step 2 of 5')).toBeVisible();
  await expect(xpBar(page)).not.toHaveAttribute('aria-valuenow', '0');
  await expect(boxes(page)).toHaveAccessibleName('1 unopened loot box');

  // 2. A project, from the Course template: it opens on its board.
  await streaky(page)
    .getByRole('button', { name: /Start a project/ })
    .click();
  await dialog.getByLabel('Title').fill('Calculus');
  await dialog.getByRole('radio', { name: /Course/ }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/prj_/);
  // It went into the area made in step 1.
  await expect(page.locator('main')).toContainText('University');
  for (const column of ['To study', 'Studying', 'To review', 'Done']) {
    await expect(page.getByRole('region', { name: column, exact: true })).toBeVisible();
  }

  // 3. A task of my own on the board (the template's first tasks don't count as made by me).
  const toStudy = page.getByRole('region', { name: 'To study', exact: true });
  await toStudy.getByPlaceholder('Add a card').fill('Chapter 1 exercises');
  await toStudy.getByPlaceholder('Add a card').press('Enter');
  const card = page.getByRole('button', { name: 'Chapter 1 exercises' });
  await expect(toStudy.getByRole('button', { name: 'Chapter 1 exercises' })).toBeVisible();

  // The keyboard moves it: Space picks it up, an arrow moves it, Space drops it.
  // (dnd-kit measures between steps, so each key waits a frame or two.)
  await card.focus();
  for (const key of ['Space', 'ArrowRight', 'Space']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
  const studying = page.getByRole('region', { name: 'Studying', exact: true });
  await expect(studying.getByRole('button', { name: 'Chapter 1 exercises' })).toBeVisible();

  // 4. Complete it.
  await page.getByRole('checkbox', { name: 'Complete “Chapter 1 exercises”' }).click();
  await expect(page.getByRole('checkbox', { name: 'Reopen “Chapter 1 exercises”' })).toBeVisible();

  // Back on Today: the last step (focus) is open, and every step so far left a box.
  await page.getByRole('link', { name: 'Today' }).first().click();
  await expect(streaky(page).getByText('Step 5 of 5')).toBeVisible();
  await expect(boxes(page)).toHaveAccessibleName(/^[4-9] unopened loot boxes$/);
  await expect(page.getByText(/\+\d+ XP today/)).toBeVisible();
});

test('a box opens in the Collection and the item is kept', async ({ page }) => {
  await page.goto('/today');
  const before = Number((await boxes(page).textContent())?.trim());
  await boxes(page).click();
  await expect(page).toHaveURL(/\/collection/);

  await page.getByRole('button', { name: 'Open', exact: true }).click();
  const reveal = page.getByRole('dialog');
  await reveal.getByRole('button', { name: 'Skip' }).click();
  await reveal.getByRole('button', { name: 'Done' }).click();
  await expect(reveal).toBeHidden();

  await expect(boxes(page)).toHaveAccessibleName(
    before - 1 === 1 ? '1 unopened loot box' : `${before - 1} unopened loot boxes`,
  );
  // The item is in the album now.
  await expect(page.getByText(/^1 \/ \d+ found/)).toBeVisible();
});

test('capture from anywhere lands in the Inbox', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await page.keyboard.press('c');
  const palette = page.getByRole('dialog');
  await palette.getByRole('combobox').fill('Buy printer paper');
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();

  await page.keyboard.press('g');
  await page.keyboard.press('i');
  await expect(page).toHaveURL(/\/inbox/);
  await expect(page.getByRole('checkbox', { name: 'Complete “Buy printer paper”' })).toBeVisible();
});
