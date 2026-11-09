import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { ScaleInput } from '../../domain/schemas';
import { brews, scales } from '../db/schema';
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

export interface Scale {
	id: string;
	name: string;
	archivedAt: Date | null;
	brewCount: number;
}

function translate(e: unknown): never {
	if (pgErrorCode(e) === PG_UNIQUE_VIOLATION) {
		throw new ConflictError('You already have a scale with this name', 'name');
	}
	throw e;
}

export async function listScales(
	db: Db,
	userId: string,
	opts: { includeArchived?: boolean } = {}
): Promise<Scale[]> {
	return db
		.select({
			id: scales.id,
			name: scales.name,
			archivedAt: scales.archivedAt,
			brewCount: sql<number>`(select count(*)::int from ${brews} where ${col(brews.scaleId)} = ${col(scales.id)})`
		})
		.from(scales)
		.where(
			and(eq(scales.userId, userId), opts.includeArchived ? undefined : isNull(scales.archivedAt))
		)
		.orderBy(asc(sql`lower(${scales.name})`));
}

export async function createScale(
	db: Db,
	userId: string,
	input: ScaleInput
): Promise<{ id: string }> {
	try {
		const [row] = await db
			.insert(scales)
			.values({ userId, ...input })
			.returning({ id: scales.id });
		return row;
	} catch (e) {
		translate(e);
	}
}

export async function updateScale(
	db: Db,
	userId: string,
	id: string,
	input: ScaleInput
): Promise<void> {
	assertId(id, 'Scale');
	try {
		const rows = await db
			.update(scales)
			.set(input)
			.where(and(eq(scales.id, id), eq(scales.userId, userId)))
			.returning({ id: scales.id });
		if (rows.length === 0) throw new NotFoundError('Scale');
	} catch (e) {
		translate(e);
	}
}

export async function setScaleArchived(
	db: Db,
	userId: string,
	id: string,
	archived: boolean
): Promise<void> {
	assertId(id, 'Scale');
	const rows = await db
		.update(scales)
		.set({ archivedAt: archived ? new Date() : null })
		.where(and(eq(scales.id, id), eq(scales.userId, userId)))
		.returning({ id: scales.id });
	if (rows.length === 0) throw new NotFoundError('Scale');
}

/** Deletes an unused scale. Scales with brews can only be archived. */
export async function deleteScale(db: Db, userId: string, id: string): Promise<void> {
	assertId(id, 'Scale');
	try {
		const rows = await db
			.delete(scales)
			.where(and(eq(scales.id, id), eq(scales.userId, userId)))
			.returning({ id: scales.id });
		if (rows.length === 0) throw new NotFoundError('Scale');
	} catch (e) {
		if (isReferencedError(e)) {
			throw new ConflictError('This scale has brews logged with it. Archive it instead.');
		}
		throw e;
	}
}
