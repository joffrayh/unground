import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { RoasterInput } from '../../domain/schemas';
import { beans, roasters } from '../db/schema';
import { col } from '../db/sql';
import type { Db, Queryable } from '../db/types';
import {
	ConflictError,
	NotFoundError,
	isReferencedError,
	PG_UNIQUE_VIOLATION,
	pgErrorCode,
	assertId
} from '../errors';

export interface Roaster {
	id: string;
	name: string;
	website: string | null;
	archivedAt: Date | null;
	beanCount: number;
}

export async function listRoasters(
	db: Db,
	userId: string,
	opts: { includeArchived?: boolean } = {}
): Promise<Roaster[]> {
	return db
		.select({
			id: roasters.id,
			name: roasters.name,
			website: roasters.website,
			archivedAt: roasters.archivedAt,
			beanCount: sql<number>`(select count(*)::int from ${beans} where ${col(beans.roasterId)} = ${col(roasters.id)})`
		})
		.from(roasters)
		.where(
			and(
				eq(roasters.userId, userId),
				opts.includeArchived ? undefined : isNull(roasters.archivedAt)
			)
		)
		.orderBy(asc(sql`lower(${roasters.name})`));
}

export async function getRoaster(db: Db, userId: string, id: string): Promise<Roaster> {
	assertId(id, 'Roaster');
	const [row] = (await listRoasters(db, userId, { includeArchived: true })).filter(
		(r) => r.id === id
	);
	if (!row) throw new NotFoundError('Roaster');
	return row;
}

/**
 * Resolves a typed roaster name to the user's existing roaster (case-insensitive) or creates it.
 * Lets the bean form take a free-typed roaster without a separate "add roaster" step (R3).
 * Safe under concurrent calls at READ COMMITTED: ON CONFLICT waits for the competing insert.
 */
export async function findOrCreateRoaster(
	q: Queryable,
	userId: string,
	name: string
): Promise<string> {
	const trimmed = name.trim();
	const [inserted] = await q
		.insert(roasters)
		.values({ userId, name: trimmed })
		.onConflictDoNothing()
		.returning({ id: roasters.id });
	if (inserted) return inserted.id;
	const [existing] = await q
		.select({ id: roasters.id })
		.from(roasters)
		.where(and(eq(roasters.userId, userId), sql`lower(${roasters.name}) = lower(${trimmed})`));
	if (!existing) throw new Error(`Roaster "${trimmed}" conflicted on insert but was not found`);
	return existing.id;
}

/** Un-archives a roaster when a bean is (re)assigned to it: the user is buying from it again. */
export async function reactivateRoaster(q: Queryable, userId: string, id: string): Promise<void> {
	await q
		.update(roasters)
		.set({ archivedAt: null })
		.where(and(eq(roasters.id, id), eq(roasters.userId, userId), isNotNull(roasters.archivedAt)));
}

export async function updateRoaster(
	db: Db,
	userId: string,
	id: string,
	input: RoasterInput
): Promise<void> {
	assertId(id, 'Roaster');
	try {
		const rows = await db
			.update(roasters)
			.set(input)
			.where(and(eq(roasters.id, id), eq(roasters.userId, userId)))
			.returning({ id: roasters.id });
		if (rows.length === 0) throw new NotFoundError('Roaster');
	} catch (e) {
		if (pgErrorCode(e) === PG_UNIQUE_VIOLATION) {
			throw new ConflictError('You already have a roaster with this name', 'name');
		}
		throw e;
	}
}

export async function setRoasterArchived(
	db: Db,
	userId: string,
	id: string,
	archived: boolean
): Promise<void> {
	assertId(id, 'Roaster');
	const rows = await db
		.update(roasters)
		.set({ archivedAt: archived ? new Date() : null })
		.where(and(eq(roasters.id, id), eq(roasters.userId, userId)))
		.returning({ id: roasters.id });
	if (rows.length === 0) throw new NotFoundError('Roaster');
}

export async function deleteRoaster(db: Db, userId: string, id: string): Promise<void> {
	assertId(id, 'Roaster');
	try {
		const rows = await db
			.delete(roasters)
			.where(and(eq(roasters.id, id), eq(roasters.userId, userId)))
			.returning({ id: roasters.id });
		if (rows.length === 0) throw new NotFoundError('Roaster');
	} catch (e) {
		if (isReferencedError(e)) {
			throw new ConflictError('This roaster has beans. Archive it instead.');
		}
		throw e;
	}
}
