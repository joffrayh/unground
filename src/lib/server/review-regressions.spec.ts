/** Regression tests for issues found in the independent review of the data layer. */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RateLimiter } from './auth/rate-limit';
import { createSession, generateSessionToken, validateSessionToken } from './auth/session';
import { brews, pours } from './db/schema';
import type { Db } from './db/types';
import { NotFoundError, pgErrorCode } from './errors';
import { createBean, getBean, updateBean } from './services/beans';
import { createBrew, getBrew, listBrews } from './services/brews';
import { brewsCsv } from './services/export';
import { listRoasters, setRoasterArchived } from './services/roasters';
import { changePassword, createUser, updateTimezone } from './services/users';
import { beanInput, brewInput, createTestDb, createTestUser, setupBrewer } from './testing';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close());

describe('review regressions', () => {
	it('keeps historic local dates when the user changes time zone', async () => {
		const refs = await setupBrewer(db, 'Europe/London');
		await createBrew(
			db,
			refs.userId,
			brewInput(refs, { brewedAt: new Date('2026-11-02T20:30:00Z') })
		);
		const before = await brewsCsv(db, refs.userId);
		await updateTimezone(db, refs.userId, 'Asia/Tokyo');
		expect(await brewsCsv(db, refs.userId)).toBe(before);
		expect(before).toContain(',2026-11-02,Europe/London,');
	});

	it('returns 404-style errors for malformed ids instead of SQL errors', async () => {
		const userId = await createTestUser(db);
		await expect(getBrew(db, userId, 'abc')).rejects.toBeInstanceOf(NotFoundError);
		await expect(getBean(db, userId, '../etc')).rejects.toBeInstanceOf(NotFoundError);
		await expect(listBrews(db, userId, { beanId: 'abc' })).rejects.toBeInstanceOf(NotFoundError);
	});

	it('does not un-archive a roaster when editing one of its old beans', async () => {
		const userId = await createTestUser(db);
		const { id } = await createBean(db, userId, beanInput());
		const [roaster] = await listRoasters(db, userId);
		await setRoasterArchived(db, userId, roaster.id, true);
		await updateBean(db, userId, id, beanInput({ farm: 'Fixed typo' }));
		expect(await listRoasters(db, userId)).toHaveLength(0);
		// …but buying a new bag from it does.
		await createBean(db, userId, beanInput({ name: 'New bag' }));
		expect(await listRoasters(db, userId)).toHaveLength(1);
	});

	it('revokes every session when the password changes', async () => {
		const user = await createUser(db, {
			email: 'revoke@example.com',
			password: 'old password',
			timezone: 'UTC'
		});
		const token = generateSessionToken();
		await createSession(db, token, user.id);
		await changePassword(db, user.id, 'old password', 'new password');
		expect(await validateSessionToken(db, token)).toBeNull();
	});

	it('bounds the rate limiter’s memory', () => {
		const limiter = new RateLimiter(5, 60_000, 100);
		for (let i = 0; i < 1000; i++) limiter.attempt(`key${i}`, 0);
		expect(limiter.size).toBeLessThanOrEqual(100);
	});
});

describe('V60 invariants enforced by the database at commit', () => {
	it('rejects a brew whose water differs from its pours', async () => {
		const refs = await setupBrewer(db);
		const { id } = await createBrew(db, refs.userId, brewInput(refs));
		await expect(db.update(brews).set({ waterG: 300 }).where(eq(brews.id, id))).rejects.toSatisfy(
			(e) => pgErrorCode(e) === '23514'
		);
	});

	it('rejects gaps in pour numbering and brews with no pours', async () => {
		const refs = await setupBrewer(db);
		const { id } = await createBrew(db, refs.userId, brewInput(refs));
		await expect(
			db.transaction(async (tx) => {
				await tx.delete(pours).where(sql`${pours.brewId} = ${id} AND ${pours.idx} = 2`);
				await tx.update(brews).set({ waterG: 150 }).where(eq(brews.id, id));
			})
		).rejects.toSatisfy((e) => pgErrorCode(e) === '23514');
		await expect(db.delete(pours).where(eq(pours.brewId, id))).rejects.toSatisfy(
			(e) => pgErrorCode(e) === '23514'
		);
	});

	it('still allows deleting a whole brew', async () => {
		const refs = await setupBrewer(db);
		const { id } = await createBrew(db, refs.userId, brewInput(refs));
		await db.delete(brews).where(eq(brews.id, id));
		await expect(getBrew(db, refs.userId, id)).rejects.toBeInstanceOf(NotFoundError);
	});
});
