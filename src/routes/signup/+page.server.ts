import { createHash, timingSafeEqual } from 'node:crypto';
import { fail, redirect } from '@sveltejs/kit';
import { INVITE_CODE, REGISTRATION } from '$app/env/private';
import { parseSignupForm } from '#lib/domain/schemas.ts';
import { signupLimiter } from '#lib/server/auth/rate-limit.ts';
import { createSession, generateSessionToken, setSessionCookie } from '#lib/server/auth/session.ts';
import { db } from '#lib/server/db/index.ts';
import { domainFailure, formValues } from '#lib/server/http.ts';
import { createUser } from '#lib/server/services/users.ts';
import type { Actions, PageServerLoad } from './$types';

/** Invite mode without a configured code can't admit anyone, so it behaves as closed. */
function registrationMode(): 'open' | 'invite' | 'closed' {
	if (REGISTRATION === 'invite' && !INVITE_CODE) {
		console.warn('REGISTRATION=invite but INVITE_CODE is not set; sign-up is closed.');
		return 'closed';
	}
	return REGISTRATION;
}

/** Constant-time comparison: hashing first makes both sides the same length, so length doesn't leak either. */
function inviteCodeMatches(given: string | null, expected: string | undefined): boolean {
	if (!expected) return false;
	const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();
	return timingSafeEqual(digest(given ?? ''), digest(expected));
}

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
	return { registration: registrationMode() };
};

export const actions: Actions = {
	default: async (event) => {
		const mode = registrationMode();
		const fd = await event.request.formData();
		const values = formValues(fd);
		if (mode === 'closed') {
			return fail(403, { errors: { _form: 'Sign-up is closed.' }, values });
		}

		const parsed = parseSignupForm(fd);
		if (!parsed.ok) return fail(400, { errors: parsed.errors, values });

		// Counted only once the form is valid, so typos don't burn attempts; wrong invite codes do.
		if (!signupLimiter.attempt(event.getClientAddress())) {
			return fail(429, {
				errors: { _form: 'Too many sign-up attempts from this network. Please try again later.' },
				values
			});
		}
		if (mode === 'invite' && !inviteCodeMatches(parsed.data.inviteCode, INVITE_CODE)) {
			return fail(400, { errors: { inviteCode: 'That invite code is not valid' }, values });
		}

		let userId: string;
		try {
			const user = await createUser(db, parsed.data);
			userId = user.id;
		} catch (e) {
			return domainFailure(e, values);
		}

		const token = generateSessionToken();
		const session = await createSession(db, token, userId);
		setSessionCookie(event.cookies, token, session.expiresAt);
		redirect(303, '/');
	}
};
