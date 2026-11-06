import type { Cookies } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { parseTheme, readTheme, saveTheme } from './theme';

function fakeCookies(value?: string) {
	return { get: vi.fn(() => value), set: vi.fn(), delete: vi.fn() } as unknown as Cookies;
}

describe('parseTheme', () => {
	it.each(['system', 'light', 'dark'])('keeps %s', (value) => {
		expect(parseTheme(value)).toBe(value);
	});

	it.each([undefined, null, '', 'sepia', 'constructor', '"><script>', 1])('rejects %j', (value) => {
		expect(parseTheme(value)).toBe('system');
	});
});

describe('readTheme', () => {
	it('falls back to system without a valid cookie', () => {
		expect(readTheme(fakeCookies())).toBe('system');
		expect(readTheme(fakeCookies('sepia'))).toBe('system');
	});

	it('reads a saved choice', () => {
		expect(readTheme(fakeCookies('dark'))).toBe('dark');
	});
});

describe('saveTheme', () => {
	it('stores light and dark', () => {
		const cookies = fakeCookies();
		saveTheme(cookies, 'dark');
		expect(cookies.set).toHaveBeenCalledWith(
			'theme',
			'dark',
			expect.objectContaining({ path: '/' })
		);
		expect(cookies.delete).not.toHaveBeenCalled();
	});

	it('clears the cookie for system', () => {
		const cookies = fakeCookies('dark');
		saveTheme(cookies, 'system');
		expect(cookies.delete).toHaveBeenCalledWith('theme', { path: '/' });
		expect(cookies.set).not.toHaveBeenCalled();
	});
});
