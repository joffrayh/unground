import { redirect } from '@sveltejs/kit';
import { building } from '$app/env';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import {
	SESSION_COOKIE,
	deleteSessionCookie,
	setSessionCookie,
	validateSessionToken
} from '#lib/server/auth/session.ts';
import { db, prepareDatabase } from '#lib/server/db/index.ts';
import { readTheme } from '#lib/ui/theme.ts';

export const init: ServerInit = async () => {
	if (!building) await prepareDatabase();
};

/** Routes reachable without an account. Everything else — pages and endpoints — requires a session. */
const PUBLIC_PATHS = ['/login', '/signup'];

const SECURITY_HEADERS = {
	'x-frame-options': 'DENY',
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'same-origin',
	'permissions-policy': 'camera=(), microphone=(), geolocation=()'
};

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = null;
	event.locals.session = null;
	event.locals.theme = readTheme(event.cookies);
	if (token) {
		const result = await validateSessionToken(db, token);
		if (result) {
			event.locals.user = result.user;
			event.locals.session = result.session;
			setSessionCookie(event.cookies, token, result.session.expiresAt);
		} else {
			deleteSessionCookie(event.cookies);
		}
	}

	const path = event.url.pathname;
	const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));
	if (!event.locals.user && !isPublic) {
		const next = path === '/' ? '' : `?next=${encodeURIComponent(path + event.url.search)}`;
		redirect(303, `/login${next}`);
	}

	const response = await resolve(event, {
		// Read at render time: the settings action changes it on the no-JS re-render.
		transformPageChunk: ({ html }) =>
			html.replace('data-theme="%theme%"', `data-theme="${event.locals.theme}"`)
	});
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
	return response;
};
