import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'e2e-password-123';

export function uniqueEmail(tag: string): string {
	return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export async function signUp(page: Page, email: string): Promise<void> {
	await page.goto('/signup');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL('/');
}

export async function logIn(page: Page, email: string): Promise<void> {
	await page.goto('/login');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: /sign in/i }).click();
	await expect(page).toHaveURL('/');
}

/** YYYY-MM-DD, `daysAgo` days before today (UTC). */
export function isoDate(daysAgo: number): string {
	return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

/** Fills the pour rows: [timer reading, scale reading] per pour, adding rows as needed. */
export async function fillPours(page: Page, pours: [string, string][]): Promise<void> {
	const times = page.locator('[name="pourTime"]');
	const scales = page.locator('[name="pourScale"]');
	for (const [i, [time, scale]] of pours.entries()) {
		if ((await scales.count()) <= i) await page.getByRole('button', { name: /add pour/i }).click();
		if (i > 0) await times.nth(i).fill(time);
		await scales.nth(i).fill(scale);
	}
}
