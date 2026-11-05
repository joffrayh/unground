import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { ConflictError, NotFoundError } from '../errors';
import { beanInput, brewInput, createTestDb, createTestUser, setupBrewer } from '../testing';
import { createBean, deleteBean, getBean, listBeans, setBeanArchived, updateBean } from './beans';
import { createBrew } from './brews';
import { deleteRoaster, listRoasters } from './roasters';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close());

describe('beans', () => {
	it('sums the doses used per bag and reads the latest dose (D28)', async () => {
		const refs = await setupBrewer(db);
		const { id: other } = await createBean(db, refs.userId, beanInput({ name: 'Other' }));
		const at = (day: number) => new Date(`2026-10-${10 + day}T08:00:00Z`);
		await createBrew(db, refs.userId, brewInput(refs, { doseG: 15, brewedAt: at(1) }));
		await createBrew(db, refs.userId, brewInput(refs, { doseG: 18.5, brewedAt: at(3) }));
		await createBrew(db, refs.userId, brewInput(refs, { doseG: 16, brewedAt: at(2) }));
		await createBrew(db, refs.userId, brewInput({ ...refs, beanId: other }, { doseG: 30 }));
		const bean = await getBean(db, refs.userId, refs.beanId);
		expect(bean).toMatchObject({ bagWeightG: 250, bagPrice: 14.5, usedG: 49.5, lastDoseG: 18.5 });
		const [listed] = (await listBeans(db, refs.userId)).filter((b) => b.id === other);
		expect(listed).toMatchObject({ usedG: 30, lastDoseG: 30 });
		const { id: unused } = await createBean(db, refs.userId, beanInput({ name: 'Fresh' }));
		expect(await getBean(db, refs.userId, unused)).toMatchObject({ usedG: 0, lastDoseG: null });
	});

	it('creates a bean, its roaster and its roaster notes', async () => {
		const userId = await createTestUser(db);
		const { id } = await createBean(db, userId, beanInput());
		const bean = await getBean(db, userId, id);
		expect(bean).toMatchObject({
			name: 'Gesha Village',
			roasterName: 'Square Mile',
			country: 'ET',
			altitudeMinM: 1900,
			altitudeMaxM: 2100,
			process: 'washed',
			roastDate: '2026-10-20',
			brewCount: 0,
			roasterNotes: ['floral.floral.jasmine', 'fruity.other_fruit.peach']
		});
	});

	it('reuses an existing roaster regardless of case', async () => {
		const userId = await createTestUser(db);
		await createBean(db, userId, beanInput({ roasterName: 'Square Mile' }));
		await createBean(db, userId, beanInput({ name: 'Red Brick', roasterName: '  square mile ' }));
		const roasters = await listRoasters(db, userId);
		expect(roasters).toHaveLength(1);
		expect(roasters[0]).toMatchObject({ name: 'Square Mile', beanCount: 2 });
	});

	it('keeps roasters private per user', async () => {
		const a = await createTestUser(db);
		const b = await createTestUser(db);
		await createBean(db, a, beanInput());
		await createBean(db, b, beanInput());
		expect(await listRoasters(db, a)).toHaveLength(1);
		expect(await listRoasters(db, b)).toHaveLength(1);
	});

	it('replaces notes and roaster on update', async () => {
		const userId = await createTestUser(db);
		const { id } = await createBean(db, userId, beanInput());
		await updateBean(
			db,
			userId,
			id,
			beanInput({
				roasterName: 'Origin',
				roasterNotes: ['nutty_cocoa.cocoa.chocolate'],
				process: null
			})
		);
		const bean = await getBean(db, userId, id);
		expect(bean).toMatchObject({
			roasterName: 'Origin',
			process: null,
			roasterNotes: ['nutty_cocoa.cocoa.chocolate']
		});
	});

	it('hides archived beans from the default list', async () => {
		const userId = await createTestUser(db);
		const { id } = await createBean(db, userId, beanInput());
		await setBeanArchived(db, userId, id, true);
		expect(await listBeans(db, userId)).toHaveLength(0);
		expect(await listBeans(db, userId, { includeArchived: true })).toHaveLength(1);
	});

	it('lists the most recently brewed bean first', async () => {
		const { userId, beanId, grinderId } = await setupBrewer(db);
		const { id: newer } = await createBean(db, userId, beanInput({ name: 'Never brewed' }));
		await createBrew(db, userId, brewInput({ beanId, grinderId }));
		const list = await listBeans(db, userId);
		expect(list.map((b) => b.id)).toEqual([beanId, newer]);
		expect(list[0].brewCount).toBe(1);
		expect(list[0].lastBrewedAt).toBeInstanceOf(Date);
	});

	it('refuses to delete a bean or roaster that is in use', async () => {
		const { userId, beanId, grinderId } = await setupBrewer(db);
		await createBrew(db, userId, brewInput({ beanId, grinderId }));
		await expect(deleteBean(db, userId, beanId)).rejects.toBeInstanceOf(ConflictError);
		const [roaster] = await listRoasters(db, userId);
		await expect(deleteRoaster(db, userId, roaster.id)).rejects.toBeInstanceOf(ConflictError);
	});

	it('deletes an unused bean', async () => {
		const userId = await createTestUser(db);
		const { id } = await createBean(db, userId, beanInput());
		await deleteBean(db, userId, id);
		await expect(getBean(db, userId, id)).rejects.toBeInstanceOf(NotFoundError);
	});

	it("never exposes or modifies another user's bean", async () => {
		const owner = await createTestUser(db);
		const intruder = await createTestUser(db);
		const { id } = await createBean(db, owner, beanInput());
		await expect(getBean(db, intruder, id)).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			updateBean(db, intruder, id, beanInput({ name: 'Hacked' }))
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(setBeanArchived(db, intruder, id, true)).rejects.toBeInstanceOf(NotFoundError);
		await expect(deleteBean(db, intruder, id)).rejects.toBeInstanceOf(NotFoundError);
		expect((await getBean(db, owner, id)).name).toBe('Gesha Village');
	});
});
