/** The database is the last line of defence (D18): these bypass the services on purpose. */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pgErrorCode } from '../errors';
import { brewInput, createTestDb, setupBrewer } from '../testing';
import { createBrew } from '../services/brews';
import { beans, brewPlans, brews, drippers, pours, ratings } from './schema';
import type { Db } from './types';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close());

const CHECK_VIOLATION = '23514';
const violates = (code: string) => (e: unknown) => pgErrorCode(e) === code;

describe('database constraints', () => {
	it('enforces controlled vocabularies', async () => {
		const { userId, beanId } = await setupBrewer(db);
		await expect(
			db
				.update(beans)
				.set({ process: 'magic' })
				.where(sql`${beans.id} = ${beanId}`)
		).rejects.toSatisfy(violates(CHECK_VIOLATION));
		await expect(
			db
				.update(beans)
				.set({ country: 'XX' })
				.where(sql`${beans.id} = ${beanId}`)
		).rejects.toSatisfy(violates(CHECK_VIOLATION));
		await expect(
			db
				.update(brews)
				.set({ changed: ['vibes'] })
				.where(sql`${brews.userId} = ${userId}`)
		).resolves.toBeDefined(); // no brews yet: nothing to violate
	});

	it('enforces altitude ranges', async () => {
		const { beanId } = await setupBrewer(db);
		await expect(
			db
				.update(beans)
				.set({ altitudeMinM: 2000, altitudeMaxM: 1000 })
				.where(sql`${beans.id} = ${beanId}`)
		).rejects.toSatisfy(violates(CHECK_VIOLATION));
	});

	it('enforces the pour interval rule and score ranges', async () => {
		const refs = await setupBrewer(db);
		const { id } = await createBrew(db, refs.userId, brewInput(refs));
		await expect(
			db.insert(pours).values({ brewId: id, idx: 9, volumeG: 10, intervalS: 0 })
		).rejects.toSatisfy(violates(CHECK_VIOLATION));
		await expect(db.insert(ratings).values({ brewId: id, overall: 5.25 })).rejects.toSatisfy(
			violates(CHECK_VIOLATION)
		);
		// 0 is never a score: blank means "not rated" (D55).
		await expect(db.insert(ratings).values({ brewId: id, overall: 0 })).rejects.toSatisfy(
			violates(CHECK_VIOLATION)
		);
		await expect(
			db.insert(ratings).values({ brewId: id, overall: 3.5, body: 0 })
		).rejects.toSatisfy(violates(CHECK_VIOLATION));
		// Only on a step.
		await expect(db.insert(ratings).values({ brewId: id, overall: 3.3 })).rejects.toSatisfy(
			violates(CHECK_VIOLATION)
		);
		// Overall in quarters, the profile only in halves.
		await expect(
			db.insert(ratings).values({ brewId: id, overall: 3.75, body: 2.25 })
		).rejects.toSatisfy(violates(CHECK_VIOLATION));
		await db.insert(ratings).values({ brewId: id, overall: 3.75, body: 0.5 });
		const [stored] = await db
			.select()
			.from(ratings)
			.where(sql`${ratings.brewId} = ${id}`);
		expect(stored).toMatchObject({ overall: 3.75, body: 0.5 });
		await expect(
			db
				.update(brews)
				.set({ changed: ['vibes'] })
				.where(sql`${brews.id} = ${id}`)
		).rejects.toSatisfy(violates(CHECK_VIOLATION));
	});
});

describe('constraints added for the next-time plan, drippers and bags', () => {
	it('enforces the agitation range, bag limits, new scores and dripper materials', async () => {
		const refs = await setupBrewer(db);
		const { id } = await createBrew(db, refs.userId, brewInput(refs));
		await expect(
			db
				.update(brews)
				.set({ agitation: 6 })
				.where(sql`${brews.id} = ${id}`)
		).rejects.toSatisfy(violates(CHECK_VIOLATION));
		await expect(
			db
				.update(beans)
				.set({ bagWeightG: 0 })
				.where(sql`${beans.id} = ${refs.beanId}`)
		).rejects.toSatisfy(violates(CHECK_VIOLATION));
		await expect(
			db
				.update(beans)
				.set({ bagPrice: -1 })
				.where(sql`${beans.id} = ${refs.beanId}`)
		).rejects.toSatisfy(violates(CHECK_VIOLATION));
		await expect(
			db.insert(ratings).values({ brewId: id, overall: 3.5, astringency: 5.5 })
		).rejects.toSatisfy(violates(CHECK_VIOLATION));
		await expect(
			db
				.update(drippers)
				.set({ material: 'wood' })
				.where(sql`${drippers.id} = ${refs.dripperId}`)
		).rejects.toSatisfy(violates(CHECK_VIOLATION));
	});

	it('never stores an empty plan or an out-of-range one', async () => {
		const refs = await setupBrewer(db);
		const { id } = await createBrew(db, refs.userId, brewInput(refs));
		await expect(db.insert(brewPlans).values({ brewId: id })).rejects.toSatisfy(
			violates(CHECK_VIOLATION)
		);
		await expect(db.insert(brewPlans).values({ brewId: id, pourCount: 0 })).rejects.toSatisfy(
			violates(CHECK_VIOLATION)
		);
		await expect(db.insert(brewPlans).values({ brewId: id, notes: 'ok' })).resolves.toBeDefined();
	});
});
