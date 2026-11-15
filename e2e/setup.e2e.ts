// First run of a fresh install: the sign-in page offers to create the owner account, and that
// leads to Today. The signed-in state is saved for the other tests.

import { expect, test } from '@playwright/test';
import { OWNER_STATE } from './playwright.config';
import { OWNER } from './owner';

test('set up the owner account, then sign out and back in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText('Set up Strekatron')).toBeVisible();

  await page.getByLabel('Name').fill(OWNER.name);
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: /create|set up/i }).click();

  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByRole('heading', { name: `Hi, ${OWNER.name}.` })).toBeVisible();

  // Sign out from the account menu; signing in again comes back to Today.
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText('Welcome back')).toBeVisible();
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('heading', { name: `Hi, ${OWNER.name}.` })).toBeVisible();

  await page.context().storageState({ path: OWNER_STATE });
});
