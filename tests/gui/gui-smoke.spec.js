const { test, expect } = require('@playwright/test');
const { makeId, login, authRequest } = require('../helpers/api');

test.describe.configure({ mode: 'serial' });

async function loginViaUi(page, kuerzel = 'admin', password = 'admin') {
  await page.goto('/login.html');
  await page.locator('input[autocomplete="username"]').fill(kuerzel);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page).toHaveURL(/\/app/);
}

async function openOrgContext(page) {
  await page.locator('main').getByRole('button', { name: /Organisations-Admin/i }).first().click();
  await expect(page.getByText(/Willkommen,/i)).toBeVisible();
}

test('org admin can change sync strategy in GUI', async ({ page }) => {
  await loginViaUi(page);
  await openOrgContext(page);

  await page.locator('main').getByRole('button', { name: /Sync-Strategie/i }).first().click();
  await expect(page.locator('main h1').first()).toBeVisible();

  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await page.locator('select.ctrl').first().selectOption('manual-only');
  await page.getByRole('button', { name: 'Speichern' }).click();

  await expect(page.getByText(/Manual-only/i)).toBeVisible();

  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await page.locator('select.ctrl').first().selectOption('action-based');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText(/Action-based/i)).toBeVisible();
});

test('sync button is usable and org admin cannot mutate chapter membership', async ({ page, request }) => {
  const adminAuth = await login(request, 'admin', 'admin');

  const chapterId = makeId('c');
  const memberUser = makeId('m');

  const createChapter = await authRequest(request, 'POST', '/api/chapters', adminAuth.token, {
    id: chapterId,
    name: `GUI ${chapterId}`,
    sparten: [{ id: 'tt', name: 'Tischtennis', admins: [] }],
  });
  expect(createChapter.status()).toBe(201);

  const createMember = await authRequest(request, 'POST', '/api/admin/users', adminAuth.token, {
    kuerzel: memberUser,
    vorname: 'Gui',
    name: 'Member',
    orgeinheit: 'TEST',
    kontakte: [],
  });
  expect(createMember.status()).toBe(201);

  await loginViaUi(page);
  await openOrgContext(page);

  const syncButton = page.locator('header button:has-text("Sync")').first();
  await expect(syncButton).toBeVisible();
  await syncButton.click();
  await expect(syncButton).toContainText('Sync');

  const blockedStatus = await page.evaluate(async ({ chapterId: cid, memberUser: ku }) => {
    const active = localStorage.getItem('mcm.active');
    const token = active ? localStorage.getItem(`mcm.${active}.token`) : null;
    const response = await fetch(`/api/admin/users/${ku}/chapter`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ chapterId: cid, sparte: 'tt', status: 'aktiv' }),
    });
    return response.status;
  }, { chapterId, memberUser });

  expect(blockedStatus).toBe(403);
});

test('layout stays usable on HD and mobile widths', async ({ page }) => {
  await loginViaUi(page);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.locator('header')).toBeVisible();
  const overflowHd = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflowHd).toBeLessThanOrEqual(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('header')).toBeVisible();
  const overflowMobile = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflowMobile).toBeLessThanOrEqual(2);
});
