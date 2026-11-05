/** Helpers shared by route handlers. */
import { error, fail, type RequestEvent } from '@sveltejs/kit';
import type { SessionUser } from './auth/session';
import { ConflictError, NotFoundError, PG_CHECK_VIOLATION, pgErrorCode } from './errors';

/** The signed-in user. The handle hook already guarantees one on non-public routes. */
export function requireUser(event: Pick<RequestEvent, 'locals'>): SessionUser {
	const user = event.locals.user;
	if (!user) error(401, 'Sign in required');
	return user;
}

export type FormFailure = { errors: Record<string, string>; values?: Record<string, unknown> };

/**
 * For use in an action's catch block: NotFoundError → 404 page; ConflictError → a form failure carrying
 * the message (on its field, if any); anything else is re-thrown.
 */
export function domainFailure(e: unknown, values?: Record<string, unknown>) {
	if (e instanceof NotFoundError) error(404, e.message);
	if (e instanceof ConflictError) {
		return fail(409, { errors: { [e.field ?? '_form']: e.message }, values } satisfies FormFailure);
	}
	// A database CHECK caught something validation missed: still the user's input, not a server fault.
	if (pgErrorCode(e) === PG_CHECK_VIOLATION) {
		console.warn('Check constraint rejected validated input', e);
		return fail(400, {
			errors: { _form: 'Some values are out of range. Please check the form.' },
			values
		} satisfies FormFailure);
	}
	throw e;
}

/** For load functions: NotFoundError → 404 page; anything else is re-thrown. */
export function notFound(e: unknown): never {
	if (e instanceof NotFoundError) error(404, e.message);
	throw e;
}

/** Same-origin relative path to return to after a form, or the fallback. Blocks open redirects. */
export function safeReturnPath(value: string | null | undefined, fallback: string): string {
	if (!value || !value.startsWith('/')) return fallback;
	// Resolve the way a browser would (it strips tabs/newlines and treats "\\" like "/"); keep it only
	// if it stays on our origin.
	const base = 'http://same-origin.invalid';
	try {
		const url = new URL(value, base);
		if (url.origin !== base) return fallback;
		return url.pathname + url.search + url.hash;
	} catch {
		return fallback;
	}
}

/** The submitted form as plain values, for re-populating fields after a validation failure. */
export function formValues(
	fd: FormData,
	multi: readonly string[] = []
): Record<string, string | string[]> {
	const out: Record<string, string | string[]> = {};
	for (const key of new Set(fd.keys())) {
		if (key === 'password' || key.toLowerCase().includes('password')) continue;
		const all = fd.getAll(key).filter((v): v is string => typeof v === 'string');
		out[key] = multi.includes(key) ? all : (all[0] ?? '');
	}
	return out;
}
