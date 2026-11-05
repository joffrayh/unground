/** Errors raised by the service layer; routes translate them into HTTP responses. */

export class NotFoundError extends Error {
	constructor(what: string) {
		super(`${what} not found`);
		this.name = 'NotFoundError';
	}
}

/** A request that is well-formed but conflicts with existing data (duplicate name, item in use, …). */
export class ConflictError extends Error {
	constructor(
		message: string,
		readonly field?: string
	) {
		super(message);
		this.name = 'ConflictError';
	}
}

/** Postgres SQLSTATE of an error from postgres-js or PGlite, including when wrapped by Drizzle. */
export function pgErrorCode(e: unknown): string | undefined {
	for (let cur: unknown = e, depth = 0; cur && depth < 5; depth++) {
		const code = (cur as { code?: unknown }).code;
		if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
		cur = (cur as { cause?: unknown }).cause;
	}
	return undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids arrive from URLs; a non-UUID can't exist, so it's a 404 rather than a Postgres cast error. */
export function assertId(id: string, what: string): void {
	if (!UUID.test(id)) throw new NotFoundError(what);
}

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_CHECK_VIOLATION = '23514';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_RESTRICT_VIOLATION = '23001';

/** True when a delete was blocked because other rows still reference the target. */
export function isReferencedError(e: unknown): boolean {
	const code = pgErrorCode(e);
	return code === PG_FOREIGN_KEY_VIOLATION || code === PG_RESTRICT_VIOLATION;
}
