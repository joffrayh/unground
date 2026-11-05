import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { brews, ratings } from '../db/schema';
import type { Db } from '../db/types';
import { NotFoundError, pgErrorCode } from '../errors';
import { brewInput, createTestDb, createTestUser, ratingInput, setupBrewer } from '../testing';
import {
	createBrew,
	deleteBrew,
	getBrew,
	getLatestBrew,
	listBrews,
	savePlan,
	saveRating,
	updateBrew
} from './brews';
import { deleteDripper } from './drippers';
import { createGrinder, deleteGrinder } from './grinders';
import { ConflictError } from '../errors';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close());

describe('brews', () => {
	it('stores a V60 brew with ordered pours and derives total water from them', async () => {
		const refs = await setupBrewer(db);
		const { id } = await createBrew(db, refs.userId, brewInput(refs));
		const brew = await getBrew(db, refs.userId, id);
		expect(brew).toMatchObject({
			method: 'v60',
			beanName: 'Gesha Village',
			roasterName: 'Square Mile',
			grinderName: 'Comandante C40',
			grinderSettingUnit: 'clicks',
			grindSetting: 24,
			doseG: 15,
			waterG: 250,
			waterTempC: 94,
			totalTimeS: 195,
			agitation: 3,
			rating: null,
			plan: null,
			changed: [],
			details: {
				filterType: 'hario_tabbed',
				pours: [
					{ volumeG: 50, intervalS: 0, bloom: true },
					{ volumeG: 100, intervalS: 45, bloom: false },
					{ volumeG: 100, intervalS: 30, bloom: false }
				]
			}
		});
	});

	it('records the dripper (optional) and joins its name and material', async () => {
		const refs = await setupBrewer(db);
		const { id } = await createBrew(db, refs.userId, brewInput(refs));
		expect(await getBrew(db, refs.userId, id)).toMatchObject({
			dripperId: refs.dripperId,
			dripperName: 'Hario V60 02',
			dripperMaterial: 'plastic'
		});
		const { id: without } = await createBrew(
			db,
			refs.userId,
			brewInput({ ...refs, dripperId: null })
		);
		expect(await getBrew(db, refs.userId, without)).toMatchObject({
			dripperId: null,
			dripperName: null,
			dripperMaterial: null
		});
		await expect(deleteDripper(db, refs.userId, refs.dripperId)).rejects.toBeInstanceOf(
			ConflictError
		);
	});

	it('saves a rating with the brew and lets it be changed or removed later', async () => {
		const refs = await setupBrewer(db);
		const { id } = await createBrew(db, refs.userId, brewInput(refs), ratingInput());
		let brew = await getBrew(db, refs.userId, id);
		expect(brew.rating).toMatchObject({
			overall: 8,
			acidity: 7,
			perceivedNotes: ['fruity.berry.blueberry']
		});
		expect(brew.overall).toBe(8);

		await saveRating(
			db,
			refs.userId,
			id,
			ratingInput({ overall: 5, acidity: null, perceivedNotes: [] })
		);
		brew = await getBrew(db, refs.userId, id);
		expect(brew.rating).toMatchObject({ overall: 5, acidity: null, perceivedNotes: [] });

		await saveRating(db, refs.userId, id, null);
		expect((await getBrew(db, refs.userId, id)).rating).toBeNull();
	});

	it('replaces pours and rating on update', async () => {
		const refs = await setupBrewer(db);
		const { id } = await createBrew(db, refs.userId, brewInput(refs), ratingInput());
		await updateBrew(
			db,
			refs.userId,
			id,
			brewInput(refs, {
				details: {
					filterType: null,
					pours: [
						{ volumeG: 60, intervalS: 0, bloom: false },
						{ volumeG: 240, intervalS: 40, bloom: false }
					]
				}
			}),
			null,
			null
		);
		const brew = await getBrew(db, refs.userId, id);
		expect(brew.waterG).toBe(300);
		expect(brew.details.pours).toHaveLength(2);
		expect(brew.details.pours.every((p) => !p.bloom)).toBe(true);
		expect(brew.rating).toBeNull();
	});

	it('keeps the legacy "what changed" of an old brew when it is edited', async () => {
		const refs = await setupBrewer(db);
		const { id } = await createBrew(db, refs.userId, brewInput(refs));
		await db
			.update(brews)
			.set({ changed: ['grind'] })
			.where(eq(brews.id, id));
		await updateBrew(db, refs.userId, id, brewInput(refs, { grindSetting: 22 }), null, null);
		expect((await getBrew(db, refs.userId, id)).changed).toEqual(['grind']);
	});

	it('never overwrites a legacy aftertaste score when a rating is saved', async () => {
		const refs = await setupBrewer(db);
		const { id } = await createBrew(db, refs.userId, brewInput(refs), ratingInput());
		await db.update(ratings).set({ aftertaste: 6 }).where(eq(ratings.brewId, id));
		await saveRating(db, refs.userId, id, ratingInput({ overall: 9, clarity: 9 }));
		expect((await getBrew(db, refs.userId, id)).rating).toMatchObject({
			overall: 9,
			clarity: 9,
			astringency: 3,
			aftertaste: 6
		});
	});

	it('stores only the deliberate changes of a plan, and replaces or removes it', async () => {
		const refs = await setupBrewer(db);
		const plan = {
			waterTempC: 94, // same as the brew: dropped
			ratio: 17,
			grindSetting: 26,
			pourCount: 3, // same: dropped
			agitation: 3, // same: dropped
			notes: null
		};
		const { id } = await createBrew(db, refs.userId, brewInput(refs), null, plan);
		expect((await getBrew(db, refs.userId, id)).plan).toEqual({
			waterTempC: null,
			ratio: 17,
			grindSetting: 26,
			pourCount: null,
			agitation: null,
			notes: null
		});

		await savePlan(db, refs.userId, id, {
			...plan,
			ratio: null,
			grindSetting: null,
			notes: 'Swirl less'
		});
		expect((await getBrew(db, refs.userId, id)).plan).toMatchObject({
			ratio: null,
			grindSetting: null,
			notes: 'Swirl less'
		});

		// A plan of nothing but the brew's own values is no plan at all.
		await savePlan(db, refs.userId, id, { ...plan, ratio: 16.7, grindSetting: 24 });
		expect((await getBrew(db, refs.userId, id)).plan).toBeNull();

		await updateBrew(db, refs.userId, id, brewInput(refs), null, { ...plan, pourCount: 4 });
		expect((await getBrew(db, refs.userId, id)).plan).toMatchObject({ pourCount: 4 });
		const only = { ...plan, ratio: null, grindSetting: null };
		// Compared with the brew as edited: a plan of 2 pours is no change for an edited 2-pour brew.
		const twoPours = brewInput(refs, {
			details: {
				filterType: null,
				pours: [
					{ volumeG: 50, intervalS: 0, bloom: true },
					{ volumeG: 200, intervalS: 45, bloom: false }
				]
			}
		});
		await updateBrew(db, refs.userId, id, twoPours, null, { ...only, pourCount: 2 });
		expect((await getBrew(db, refs.userId, id)).plan).toBeNull();
		// savePlan compares against the stored pour count (2 now).
		await savePlan(db, refs.userId, id, { ...only, pourCount: 2 });
		expect((await getBrew(db, refs.userId, id)).plan).toBeNull();
		await savePlan(db, refs.userId, id, { ...only, pourCount: 3 });
		expect((await getBrew(db, refs.userId, id)).plan).toMatchObject({ pourCount: 3 });
		await updateBrew(db, refs.userId, id, brewInput(refs), null, null);
		expect((await getBrew(db, refs.userId, id)).plan).toBeNull();
	});

	it('pages newest-first with a stable cursor', async () => {
		const refs = await setupBrewer(db);
		const ids: string[] = [];
		for (let day = 1; day <= 5; day++) {
			const { id } = await createBrew(
				db,
				refs.userId,
				brewInput(refs, { brewedAt: new Date(`2026-10-0${day}T08:00:00Z`) })
			);
			ids.push(id);
		}
		const first = await listBrews(db, refs.userId, { limit: 2 });
		expect(first.brews.map((b) => b.id)).toEqual([ids[4], ids[3]]);
		const second = await listBrews(db, refs.userId, { limit: 2, before: first.nextCursor });
		expect(second.brews.map((b) => b.id)).toEqual([ids[2], ids[1]]);
		const third = await listBrews(db, refs.userId, { limit: 2, before: second.nextCursor });
		expect(third.brews.map((b) => b.id)).toEqual([ids[0]]);
		expect(third.nextCursor).toBeNull();
		expect((await getLatestBrew(db, refs.userId))?.id).toBe(ids[4]);
	});

	it('has no latest brew for a new user', async () => {
		expect(await getLatestBrew(db, await createTestUser(db))).toBeNull();
	});

	it("rejects another user's dripper, in the service and in the database", async () => {
		const owner = await setupBrewer(db);
		const intruder = await setupBrewer(db);
		await expect(
			createBrew(db, intruder.userId, brewInput({ ...intruder, dripperId: owner.dripperId }))
		).rejects.toBeInstanceOf(NotFoundError);
		const { id } = await createBrew(db, intruder.userId, brewInput(intruder));
		await expect(
			db.update(brews).set({ dripperId: owner.dripperId }).where(eq(brews.id, id))
		).rejects.toSatisfy((e) => pgErrorCode(e) === '23503');
	});

	it("rejects another user's bean or grinder", async () => {
		const owner = await setupBrewer(db);
		const intruder = await setupBrewer(db);
		await expect(
			createBrew(
				db,
				intruder.userId,
				brewInput({ beanId: owner.beanId, grinderId: intruder.grinderId })
			)
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			createBrew(
				db,
				intruder.userId,
				brewInput({ beanId: intruder.beanId, grinderId: owner.grinderId })
			)
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('enforces isolation in the database even if the service check is bypassed', async () => {
		const owner = await setupBrewer(db);
		const intruder = await setupBrewer(db);
		const insert = db.insert(brews).values({
			userId: intruder.userId,
			beanId: owner.beanId,
			grinderId: intruder.grinderId,
			method: 'v60',
			brewedAt: new Date(),
			timezone: 'UTC',
			grindSetting: 20,
			doseG: 15,
			waterG: 250,
			waterTempC: 94,
			totalTimeS: 180
		});
		await expect(insert).rejects.toSatisfy((e) => pgErrorCode(e) === '23503');
	});

	it("can't read, change or delete another user's brew", async () => {
		const owner = await setupBrewer(db);
		const intruder = await setupBrewer(db);
		const { id } = await createBrew(db, owner.userId, brewInput(owner));
		await expect(getBrew(db, intruder.userId, id)).rejects.toBeInstanceOf(NotFoundError);
		await expect(saveRating(db, intruder.userId, id, ratingInput())).rejects.toBeInstanceOf(
			NotFoundError
		);
		await expect(
			updateBrew(db, intruder.userId, id, brewInput(intruder), null, null)
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			savePlan(db, intruder.userId, id, {
				waterTempC: 90,
				ratio: null,
				grindSetting: null,
				pourCount: null,
				agitation: null,
				notes: null
			})
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(deleteBrew(db, intruder.userId, id)).rejects.toBeInstanceOf(NotFoundError);
		expect((await listBrews(db, intruder.userId)).brews).toHaveLength(0);
	});

	it('deletes a brew with its pours and rating', async () => {
		const refs = await setupBrewer(db);
		const { id } = await createBrew(db, refs.userId, brewInput(refs), ratingInput());
		await deleteBrew(db, refs.userId, id);
		await expect(getBrew(db, refs.userId, id)).rejects.toBeInstanceOf(NotFoundError);
	});

	it('keeps grinders with brews (archive instead of delete)', async () => {
		const refs = await setupBrewer(db);
		await createBrew(db, refs.userId, brewInput(refs));
		await expect(deleteGrinder(db, refs.userId, refs.grinderId)).rejects.toBeInstanceOf(
			ConflictError
		);
		const { id: unused } = await createGrinder(db, refs.userId, {
			name: 'Spare',
			settingUnit: null
		});
		await deleteGrinder(db, refs.userId, unused);
	});

	it('rejects duplicate grinder names regardless of case', async () => {
		const refs = await setupBrewer(db);
		await expect(
			createGrinder(db, refs.userId, { name: 'comandante c40', settingUnit: null })
		).rejects.toBeInstanceOf(ConflictError);
	});
});
