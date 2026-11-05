import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessions } from '../db/schema';
import type { Db } from '../db/types';
import { ConflictError } from '../errors';
import { changePassword, createUser, verifyCredentials } from '../services/users';
import { createTestDb } from '../testing';
import { RateLimiter } from './rate-limit';
import {
	createSession,
	generateSessionToken,
	invalidateSession,
	invalidateUserSessions,
	validateSessionToken
} from './session';
import { eq } from 'drizzle-orm';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close());

describe('accounts', () => {
	it('creates a user with a normalised email and verifies credentials', async () => {
		const user = await createUser(db, {
			email: 'Ada@Example.com',
			password: 'correct horse',
			timezone: 'Europe/London'
		});
		expect(user).toMatchObject({ email: 'ada@example.com', timezone: 'Europe/London' });
		expect(await verifyCredentials(db, 'ADA@example.com', 'correct horse')).toMatchObject({
			id: user.id
		});
		expect(await verifyCredentials(db, 'ada@example.com', 'wrong')).toBeNull();
		expect(await verifyCredentials(db, 'nobody@example.com', 'correct horse')).toBeNull();
	});

	it('rejects duplicate emails and falls back to UTC for unknown zones', async () => {
		await createUser(db, {
			email: 'dup@example.com',
			password: 'password123',
			timezone: 'Not/AZone'
		}).then((u) => expect(u.timezone).toBe('UTC'));
		await expect(
			createUser(db, { email: 'DUP@example.com', password: 'password123', timezone: 'UTC' })
		).rejects.toBeInstanceOf(ConflictError);
	});

	it('changes the password only with the current one', async () => {
		const user = await createUser(db, {
			email: 'pw@example.com',
			password: 'old password',
			timezone: 'UTC'
		});
		await expect(changePassword(db, user.id, 'nope', 'new password')).rejects.toBeInstanceOf(
			ConflictError
		);
		await changePassword(db, user.id, 'old password', 'new password');
		expect(await verifyCredentials(db, 'pw@example.com', 'new password')).not.toBeNull();
	});
});

describe('sessions', () => {
	it('stores only a hash of the token and validates it', async () => {
		const user = await createUser(db, {
			email: 's1@example.com',
			password: 'password123',
			timezone: 'UTC'
		});
		const token = generateSessionToken();
		const session = await createSession(db, token, user.id);
		expect(session.id).not.toContain(token);
		expect((await validateSessionToken(db, token))?.user.id).toBe(user.id);
		expect(await validateSessionToken(db, generateSessionToken())).toBeNull();
	});

	it('rejects and removes expired sessions', async () => {
		const user = await createUser(db, {
			email: 's2@example.com',
			password: 'password123',
			timezone: 'UTC'
		});
		const token = generateSessionToken();
		const session = await createSession(db, token, user.id);
		await db
			.update(sessions)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(sessions.id, session.id));
		expect(await validateSessionToken(db, token)).toBeNull();
		expect(await db.select().from(sessions).where(eq(sessions.id, session.id))).toHaveLength(0);
	});

	it('extends a session used in the second half of its life', async () => {
		const user = await createUser(db, {
			email: 's3@example.com',
			password: 'password123',
			timezone: 'UTC'
		});
		const token = generateSessionToken();
		const session = await createSession(db, token, user.id);
		const soon = new Date(Date.now() + 86_400_000);
		await db.update(sessions).set({ expiresAt: soon }).where(eq(sessions.id, session.id));
		const validated = await validateSessionToken(db, token);
		expect(validated!.session.expiresAt.getTime()).toBeGreaterThan(
			soon.getTime() + 20 * 86_400_000
		);
	});

	it('invalidates one or all sessions', async () => {
		const user = await createUser(db, {
			email: 's4@example.com',
			password: 'password123',
			timezone: 'UTC'
		});
		const t1 = generateSessionToken();
		const t2 = generateSessionToken();
		const s1 = await createSession(db, t1, user.id);
		await createSession(db, t2, user.id);
		await invalidateSession(db, s1.id);
		expect(await validateSessionToken(db, t1)).toBeNull();
		expect(await validateSessionToken(db, t2)).not.toBeNull();
		await invalidateUserSessions(db, user.id);
		expect(await validateSessionToken(db, t2)).toBeNull();
	});
});

describe('rate limiter', () => {
	it('blocks after the limit within a window and resets after it', () => {
		const limiter = new RateLimiter(2, 1000);
		expect(limiter.attempt('k', 0)).toBe(true);
		expect(limiter.attempt('k', 10)).toBe(true);
		expect(limiter.attempt('k', 20)).toBe(false);
		expect(limiter.attempt('other', 20)).toBe(true);
		expect(limiter.attempt('k', 1000)).toBe(true);
	});
});
