import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { ConflictError, NotFoundError } from '../errors';
import { brewInput, createTestDb, createTestUser, setupBrewer } from '../testing';
import { createBrew } from './brews';
import { createScale, deleteScale, listScales, setScaleArchived, updateScale } from './scales';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close());

describe('scales', () => {
	it('lists by name, leaving out archived ones unless asked', async () => {
		const userId = await createTestUser(db);
		await createScale(db, userId, { name: 'Zed' });
		const { id } = await createScale(db, userId, { name: 'alpha' });
		expect((await listScales(db, userId)).map((s) => s.name)).toEqual(['alpha', 'Zed']);

		await setScaleArchived(db, userId, id, true);
		expect((await listScales(db, userId)).map((s) => s.name)).toEqual(['Zed']);
		expect(await listScales(db, userId, { includeArchived: true })).toHaveLength(2);

		await setScaleArchived(db, userId, id, false);
		expect(await listScales(db, userId)).toHaveLength(2);
	});

	it('renames and deletes', async () => {
		const userId = await createTestUser(db);
		const { id } = await createScale(db, userId, { name: 'Old' });
		await updateScale(db, userId, id, { name: 'New' });
		expect((await listScales(db, userId))[0].name).toBe('New');
		await deleteScale(db, userId, id);
		expect(await listScales(db, userId)).toEqual([]);
	});

	it('refuses a duplicate name, ignoring case', async () => {
		const userId = await createTestUser(db);
		await createScale(db, userId, { name: 'Ultra' });
		await expect(createScale(db, userId, { name: 'ULTRA' })).rejects.toBeInstanceOf(ConflictError);
	});

	it('lets two users use the same name', async () => {
		await createScale(db, await createTestUser(db), { name: 'Shared' });
		await expect(
			createScale(db, await createTestUser(db), { name: 'Shared' })
		).resolves.toHaveProperty('id');
	});

	it('counts its brews, and can only be archived once it has any', async () => {
		const refs = await setupBrewer(db);
		const { id } = await createScale(db, refs.userId, { name: 'Used' });
		await createBrew(db, refs.userId, brewInput(refs, { scaleId: id }));
		expect((await listScales(db, refs.userId))[0].brewCount).toBe(1);
		await expect(deleteScale(db, refs.userId, id)).rejects.toBeInstanceOf(ConflictError);
		await setScaleArchived(db, refs.userId, id, true);
		expect(await listScales(db, refs.userId)).toEqual([]);
	});

	it("won't record a brew on another user's scale", async () => {
		const refs = await setupBrewer(db);
		const { id } = await createScale(db, await createTestUser(db), { name: 'Theirs' });
		await expect(
			createBrew(db, refs.userId, brewInput(refs, { scaleId: id }))
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it("can't touch another user's scale", async () => {
		const owner = await createTestUser(db);
		const other = await createTestUser(db);
		const { id } = await createScale(db, owner, { name: 'Mine' });
		await expect(updateScale(db, other, id, { name: 'Taken' })).rejects.toBeInstanceOf(
			NotFoundError
		);
		await expect(setScaleArchived(db, other, id, true)).rejects.toBeInstanceOf(NotFoundError);
		await expect(deleteScale(db, other, id)).rejects.toBeInstanceOf(NotFoundError);
		expect((await listScales(db, owner))[0].name).toBe('Mine');
	});
});
