import type { Cookies } from '@sveltejs/kit';

export const THEMES = { system: 'System', light: 'Light', dark: 'Dark' } as const;
export type Theme = keyof typeof THEMES;

const THEME_COOKIE = 'theme';
const MAX_AGE_S = 60 * 60 * 24 * 365;

export function parseTheme(value: unknown): Theme {
	return typeof value === 'string' && Object.hasOwn(THEMES, value) ? (value as Theme) : 'system';
}

export function readTheme(cookies: Cookies): Theme {
	return parseTheme(cookies.get(THEME_COOKIE));
}

/** The choice belongs to this device, not the account. System is the absence of a choice. */
export function saveTheme(cookies: Cookies, theme: Theme): void {
	if (theme === 'system') {
		cookies.delete(THEME_COOKIE, { path: '/' });
		return;
	}
	cookies.set(THEME_COOKIE, theme, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: MAX_AGE_S
	});
}
