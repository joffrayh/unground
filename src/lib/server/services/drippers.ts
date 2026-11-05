import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { DripperInput } from '../../domain/schemas';
import type { DripperMaterial } from '../../domain/vocab';
import { brews, drippers } from '../db/schema';
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

export interface Dripper {
	id: string;
	name: string;
	material: DripperMaterial | null;
	archivedAt: Date | null;
	brewCount: number;
}

function translate(e: unknown): never {
	if (pgErrorCode(e) === PG_UNIQUE_VIOLATION) {
		throw new ConflictError('You already have a dripper with this name', 'name');
	}
	throw e;
}

export async function listDrippers(
	db: Db,
	userId: string,
	opts: { includeArchived?: boolean } = {}
): Promise<Dripper[]> {
	return db
		.select({
			id: drippers.id,
			name: drippers.name,
			material: sql<DripperMaterial | null>`${drippers.material}`,
			archivedAt: drippers.archivedAt,
			brewCount: sql<number>`(select count(*)::int from ${brews} where ${col(brews.dripperId)} = ${col(drippers.id)})`
		})
		.from(drippers)
		.where(
			and(
				eq(drippers.userId, userId),
				opts.includeArchived ? undefined : isNull(drippers.archivedAt)
			)
		)
		.orderBy(asc(sql`lower(${drippers.name})`));
}

export async function getDripper(db: Db, userId: string, id: string): Promise<Dripper> {
	assertId(id, 'Dripper');
	const [row] = (await listDrippers(db, userId, { includeArchived: true })).filter(
		(g) => g.id === id
	);
	if (!row) throw new NotFoundError('Dripper');
	return row;
}

export async function createDripper(
	db: Db,
	userId: string,
	input: DripperInput
): Promise<{ id: string }> {
	try {
		const [row] = await db
			.insert(drippers)
			.values({ userId, ...input })
			.returning({ id: drippers.id });
		return row;
	} catch (e) {
		translate(e);
	}
}

export async function updateDripper(
	db: Db,
	userId: string,
	id: string,
	input: DripperInput
): Promise<void> {
	assertId(id, 'Dripper');
	try {
		const rows = await db
			.update(drippers)
			.set(input)
			.where(and(eq(drippers.id, id), eq(drippers.userId, userId)))
			.returning({ id: drippers.id });
		if (rows.length === 0) throw new NotFoundError('Dripper');
	} catch (e) {
		translate(e);
	}
}

export async function setDripperArchived(
	db: Db,
	userId: string,
	id: string,
	archived: boolean
): Promise<void> {
	assertId(id, 'Dripper');
	const rows = await db
		.update(drippers)
		.set({ archivedAt: archived ? new Date() : null })
		.where(and(eq(drippers.id, id), eq(drippers.userId, userId)))
		.returning({ id: drippers.id });
	if (rows.length === 0) throw new NotFoundError('Dripper');
}

/** Deletes an unused dripper. Drippers with brews can only be archived (their history must stay intact). */
export async function deleteDripper(db: Db, userId: string, id: string): Promise<void> {
	assertId(id, 'Dripper');
	try {
		const rows = await db
			.delete(drippers)
			.where(and(eq(drippers.id, id), eq(drippers.userId, userId)))
			.returning({ id: drippers.id });
		if (rows.length === 0) throw new NotFoundError('Dripper');
	} catch (e) {
		if (isReferencedError(e)) {
			throw new ConflictError('This dripper has brews logged with it. Archive it instead.');
		}
		throw e;
	}
}
