import { redirect } from '@sveltejs/kit';
import { deleteSessionCookie, invalidateSession } from '#lib/server/auth/session.ts';
import { db } from '#lib/server/db/index.ts';
import type { Actions, PageServerLoad } from './$types';

/** Signing out changes state, so it's POST-only (a GET could be triggered by a link or prefetch). */
export const load: PageServerLoad = () => redirect(303, '/');

export const actions: Actions = {
	default: async ({ locals, cookies }) => {
		if (locals.session) await invalidateSession(db, locals.session.id);
		deleteSessionCookie(cookies);
		redirect(303, '/login');
	}
};
