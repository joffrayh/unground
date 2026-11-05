import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { GrinderInput } from '../../domain/schemas';
import { brews, grinders } from '../db/schema';
import { col } from '../db/sql';
import type { Db } from '../db/types';
import {
	ConflictError,
	NotFoundError,
	isReferencedError,
	PG_UNIQUE_VIOLATION,
	pgErrorCode,
	assertId
} from '../errors';

export interface Grinder {
	id: string;
	name: string;
	settingUnit: string | null;
	archivedAt: Date | null;
	brewCount: number;
}

function translate(e: unknown): never {
	if (pgErrorCode(e) === PG_UNIQUE_VIOLATION) {
		throw new ConflictError('You already have a grinder with this name', 'name');
	}
	throw e;
}

export async function listGrinders(
	db: Db,
	userId: string,
	opts: { includeArchived?: boolean } = {}
): Promise<Grinder[]> {
	return db
		.select({
			id: grinders.id,
			name: grinders.name,
			settingUnit: grinders.settingUnit,
			archivedAt: grinders.archivedAt,
			brewCount: sql<number>`(select count(*)::int from ${brews} where ${col(brews.grinderId)} = ${col(grinders.id)})`
		})
		.from(grinders)
		.where(
			and(
				eq(grinders.userId, userId),
				opts.includeArchived ? undefined : isNull(grinders.archivedAt)
			)
		)
		.orderBy(asc(sql`lower(${grinders.name})`));
}

export async function getGrinder(db: Db, userId: string, id: string): Promise<Grinder> {
	assertId(id, 'Grinder');
	const [row] = (await listGrinders(db, userId, { includeArchived: true })).filter(
		(g) => g.id === id
	);
	if (!row) throw new NotFoundError('Grinder');
	return row;
}

export async function createGrinder(
	db: Db,
	userId: string,
	input: GrinderInput
): Promise<{ id: string }> {
	try {
		const [row] = await db
			.insert(grinders)
			.values({ userId, ...input })
			.returning({ id: grinders.id });
		return row;
	} catch (e) {
		translate(e);
	}
}

export async function updateGrinder(
	db: Db,
	userId: string,
	id: string,
	input: GrinderInput
): Promise<void> {
	assertId(id, 'Grinder');
	try {
		const rows = await db
			.update(grinders)
			.set(input)
			.where(and(eq(grinders.id, id), eq(grinders.userId, userId)))
			.returning({ id: grinders.id });
		if (rows.length === 0) throw new NotFoundError('Grinder');
	} catch (e) {
		translate(e);
	}
}

export async function setGrinderArchived(
	db: Db,
	userId: string,
	id: string,
	archived: boolean
): Promise<void> {
	assertId(id, 'Grinder');
	const rows = await db
		.update(grinders)
		.set({ archivedAt: archived ? new Date() : null })
		.where(and(eq(grinders.id, id), eq(grinders.userId, userId)))
		.returning({ id: grinders.id });
	if (rows.length === 0) throw new NotFoundError('Grinder');
}

/** Deletes an unused grinder. Grinders with brews can only be archived (their history must stay intact). */
export async function deleteGrinder(db: Db, userId: string, id: string): Promise<void> {
	assertId(id, 'Grinder');
	try {
		const rows = await db
			.delete(grinders)
			.where(and(eq(grinders.id, id), eq(grinders.userId, userId)))
			.returning({ id: grinders.id });
		if (rows.length === 0) throw new NotFoundError('Grinder');
	} catch (e) {
		if (isReferencedError(e)) {
			throw new ConflictError('This grinder has brews logged with it. Archive it instead.');
		}
		throw e;
	}
}
