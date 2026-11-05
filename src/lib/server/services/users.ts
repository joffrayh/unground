import { eq } from 'drizzle-orm';
import { isValidTimeZone } from '../../domain/derive';
import { getDummyHash, hashPassword, verifyPassword } from '../auth/password';
import { invalidateUserSessions } from '../auth/session';
import { users } from '../db/schema';
import type { Db } from '../db/types';
import { ConflictError, PG_UNIQUE_VIOLATION, pgErrorCode } from '../errors';

export interface User {
	id: string;
	email: string;
	timezone: string;
}

const columns = { id: users.id, email: users.email, timezone: users.timezone };

export async function createUser(
	db: Db,
	input: { email: string; password: string; timezone: string }
): Promise<User> {
	const timezone = isValidTimeZone(input.timezone) ? input.timezone : 'UTC';
	const passwordHash = await hashPassword(input.password);
	try {
		const [user] = await db
			.insert(users)
			.values({ email: input.email.toLowerCase(), passwordHash, timezone })
			.returning(columns);
		return user;
	} catch (e) {
		if (pgErrorCode(e) === PG_UNIQUE_VIOLATION) {
			throw new ConflictError('An account with this email already exists', 'email');
		}
		throw e;
	}
}

/** Returns the user when the credentials match. Takes the same time whether or not the email exists. */
export async function verifyCredentials(
	db: Db,
	email: string,
	password: string
): Promise<User | null> {
	const [row] = await db
		.select({ ...columns, passwordHash: users.passwordHash })
		.from(users)
		.where(eq(users.email, email.toLowerCase()));
	if (!row) {
		await verifyPassword(await getDummyHash(), password);
		return null;
	}
	if (!(await verifyPassword(row.passwordHash, password))) return null;
	return { id: row.id, email: row.email, timezone: row.timezone };
}

export async function updateTimezone(db: Db, userId: string, timezone: string): Promise<void> {
	if (!isValidTimeZone(timezone)) throw new ConflictError('Unknown time zone', 'timezone');
	await db.update(users).set({ timezone }).where(eq(users.id, userId));
}

export async function changePassword(
	db: Db,
	userId: string,
	currentPassword: string,
	newPassword: string
): Promise<void> {
	const [row] = await db
		.select({ passwordHash: users.passwordHash })
		.from(users)
		.where(eq(users.id, userId));
	if (!row || !(await verifyPassword(row.passwordHash, currentPassword))) {
		throw new ConflictError('Current password is incorrect', 'currentPassword');
	}
	await db
		.update(users)
		.set({ passwordHash: await hashPassword(newPassword) })
		.where(eq(users.id, userId));
	// A password change revokes every session, including stolen ones; the caller signs the current device back in.
	await invalidateUserSessions(db, userId);
}
