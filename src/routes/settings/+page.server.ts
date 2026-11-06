import { fail, redirect } from '@sveltejs/kit';
import { loginLimiter } from '#lib/server/auth/rate-limit.ts';
import {
	createSession,
	deleteSessionCookie,
	generateSessionToken,
	invalidateUserSessions,
	setSessionCookie
} from '#lib/server/auth/session.ts';
import { db } from '#lib/server/db/index.ts';
import { domainFailure, formValues, requireUser } from '#lib/server/http.ts';
import { changePassword, updateTimezone } from '#lib/server/services/users.ts';
import { parseTheme, saveTheme } from '#lib/ui/theme.ts';
import type { Actions, PageServerLoad } from './$types';

const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;

/** Every zone the server knows, plus the current one and UTC in case they're aliases it doesn't list. */
function timeZoneOptions(current: string): string[] {
	const zones = new Set(Intl.supportedValuesOf('timeZone'));
	zones.add('UTC');
	zones.add(current);
	return [...zones].sort();
}

export const load: PageServerLoad = (event) => {
	const user = requireUser(event);
	return {
		email: user.email,
		timezone: user.timezone,
		timeZones: timeZoneOptions(user.timezone)
	};
};

/** Several forms share this page; tagging each result with its action lets the page show it in place. */
function failureFor<A extends string>(action: A, failure: ReturnType<typeof domainFailure>) {
	return fail(failure.status, { ...failure.data, action });
}

export const actions: Actions = {
	theme: async (event) => {
		requireUser(event);
		const fd = await event.request.formData();
		const theme = parseTheme(fd.get('theme'));
		saveTheme(event.cookies, theme);
		// The hook read the old cookie before this action ran; keep the no-JS re-render current.
		event.locals.theme = theme;
		return { action: 'theme' as const, success: true };
	},

	timezone: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const values = formValues(fd);
		const timezone = String(fd.get('timezone') ?? '').trim();
		if (!timezone) {
			return fail(400, {
				action: 'timezone' as const,
				errors: { timezone: 'Choose a time zone' },
				values
			});
		}
		try {
			await updateTimezone(db, user.id, timezone);
		} catch (e) {
			return failureFor('timezone', domainFailure(e, values));
		}
		// The hook loaded the user before this action ran; keep the rest of this request (the no-JS re-render) current.
		event.locals.user = { ...user, timezone };
		return { action: 'timezone' as const, success: true };
	},

	password: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const values = formValues(fd);
		const current = String(fd.get('currentPassword') ?? '');
		const next = String(fd.get('newPassword') ?? '');
		const confirm = String(fd.get('confirmPassword') ?? '');

		const errors: Record<string, string> = {};
		if (!current) errors.currentPassword = 'Required';
		if (next.length < PASSWORD_MIN) errors.newPassword = `At least ${PASSWORD_MIN} characters`;
		else if (next.length > PASSWORD_MAX) errors.newPassword = `At most ${PASSWORD_MAX} characters`;
		if (!confirm) errors.confirmPassword = 'Required';
		else if (confirm !== next) errors.confirmPassword = "Doesn't match the new password";
		if (Object.keys(errors).length > 0)
			return fail(400, { action: 'password' as const, errors, values });

		// Checking the current password is a guessing oracle for anyone holding a stolen session.
		if (!loginLimiter.attempt(`${event.getClientAddress()}|${user.email}`)) {
			return fail(429, {
				action: 'password' as const,
				errors: { _form: 'Too many attempts. Please wait 15 minutes and try again.' },
				values
			});
		}
		try {
			await changePassword(db, user.id, current, next);
		} catch (e) {
			return failureFor('password', domainFailure(e, values));
		}

		// changePassword revoked every session, this one included; sign this device straight back in.
		const token = generateSessionToken();
		const session = await createSession(db, token, user.id);
		setSessionCookie(event.cookies, token, session.expiresAt);
		event.locals.session = session;
		return { action: 'password' as const, success: true };
	},

	signOutEverywhere: async (event) => {
		const user = requireUser(event);
		await invalidateUserSessions(db, user.id);
		deleteSessionCookie(event.cookies);
		redirect(303, '/login');
	}
};
