// Offline (D55): with the network gone, the app still opens from the device, shows what it had,
// and takes the day-to-day changes (capture, complete, habit check-in); they reach the server,
// in order, when the network is back.

import { expect, test } from '@playwright/test';

const offlineChip = (page: import('@playwright/test').Page) =>
  page.getByRole('status', { name: /^Offline/ });

test('capture, complete and check in offline; they sync when back', async ({ page, context }) => {
  // A habit to check in, made while online.
  const habit = await page.request.post('/api/habits', {
    data: { title: 'Stretch', schedule: { type: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] } },
  });
  expect(habit.ok()).toBe(true);

  // Open the pages once online: the app and their data are kept on the device.
  await page.goto('/habits');
  await expect(page.getByRole('checkbox', { name: 'Check in “Stretch”' })).toBeVisible();
  await page.goto('/inbox');
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.waitForTimeout(1500); // the saved cache catches up

  await context.setOffline(true);

  // Capture: it shows at once and waits on the device.
  await page.keyboard.press('c');
  const palette = page.getByRole('dialog');
  await palette.getByRole('combobox').fill('Read offline notes');
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  const complete = page.getByRole('checkbox', { name: 'Complete “Read offline notes”' });
  await expect(complete).toBeVisible();
  await expect(offlineChip(page)).toHaveAccessibleName(/1 change saved on this device/);

  // Complete it: it goes to the inbox's Done section.
  await complete.click();
  await expect(complete).toBeHidden();
  await expect(page.getByRole('button', { name: 'Done 1' })).toBeVisible();
  await expect(offlineChip(page)).toHaveAccessibleName(/2 changes saved/);

  // A reload with no network: the app comes from the device, with what was done.
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Done 1' })).toBeVisible();
  await expect(complete).toBeHidden();
  await expect(offlineChip(page)).toHaveAccessibleName(/2 changes saved/);

  // A habit check-in, on another saved page.
  await page.goto('/habits');
  await page.getByRole('checkbox', { name: 'Check in “Stretch”' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Undo today’s check-in of “Stretch”' }),
  ).toBeVisible();
  await expect(offlineChip(page)).toHaveAccessibleName(/3 changes saved/);

  // Back online: everything goes, in order, and the chip leaves.
  await context.setOffline(false);
  await expect(page.getByText('Synced 3 changes made offline')).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole('status', { name: /Offline|waiting|Syncing/ })).toHaveCount(0);

  const done = await (await page.request.get('/api/tasks?project=inbox&status=done')).json();
  expect(done.tasks.map((t: { title: string }) => t.title)).toContain('Read offline notes');
  const habits = await (await page.request.get('/api/habits')).json();
  expect(habits.habits.find((h: { title: string }) => h.title === 'Stretch').checkedToday).toBe(
    true,
  );
});

test('a page never opened on this device says so offline', async ({ page, context }) => {
  await page.goto('/today');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.goto('/review');
  await expect(page.getByText('Not saved for offline use')).toBeVisible({ timeout: 15_000 });
  await context.setOffline(false);
});
