import { fail, redirect } from '@sveltejs/kit';
import { REGISTRATION } from '$app/env/private';
import { parseLoginForm } from '#lib/domain/schemas.ts';
import { loginLimiter } from '#lib/server/auth/rate-limit.ts';
import { createSession, generateSessionToken, setSessionCookie } from '#lib/server/auth/session.ts';
import { db } from '#lib/server/db/index.ts';
import { formValues, safeReturnPath } from '#lib/server/http.ts';
import { verifyCredentials } from '#lib/server/services/users.ts';
import type { Actions, PageServerLoad } from './$types';

/** One message for every credential failure, so the form never reveals which emails have accounts. */
const BAD_CREDENTIALS = 'Email or password is incorrect';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, '/');
	// Only a same-origin path survives; the form posts back to ?next=… so it persists across failed attempts.
	const next = safeReturnPath(url.searchParams.get('next'), '');
	return { next, canSignUp: REGISTRATION !== 'closed' };
};

export const actions: Actions = {
	default: async (event) => {
		const fd = await event.request.formData();
		const parsed = parseLoginForm(fd);
		const values = formValues(fd);
		if (!parsed.ok) return fail(400, { errors: parsed.errors, values });

		const { email, password } = parsed.data;
		const limitKey = `${event.getClientAddress()}|${email}`;
		if (!loginLimiter.attempt(limitKey)) {
			return fail(429, {
				errors: { _form: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
				values
			});
		}

		const user = await verifyCredentials(db, email, password);
		if (!user) return fail(400, { errors: { _form: BAD_CREDENTIALS }, values });
		loginLimiter.reset(limitKey);

		const token = generateSessionToken();
		const session = await createSession(db, token, user.id);
		setSessionCookie(event.cookies, token, session.expiresAt);
		redirect(303, safeReturnPath(event.url.searchParams.get('next'), '/'));
	}
};
