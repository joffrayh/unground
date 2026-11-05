import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { BeanInput } from '../../domain/schemas';
import type { Process, RoastLevel } from '../../domain/vocab';
import { beanRoasterNotes, beans, brews, roasters } from '../db/schema';
import { col } from '../db/sql';
import type { Db, Queryable } from '../db/types';
import { ConflictError, NotFoundError, assertId, isReferencedError } from '../errors';
import { findOrCreateRoaster, reactivateRoaster } from './roasters';

export interface BeanSummary {
	id: string;
	name: string;
	roasterId: string;
	roasterName: string;
	country: string | null;
	process: Process | null;
	roastLevel: RoastLevel | null;
	roastDate: string | null;
	archivedAt: Date | null;
	brewCount: number;
	lastBrewedAt: Date | null;
	bagWeightG: number | null;
	bagPrice: number | null;
	/** Sum of the doses of every brew with this bean (D28). */
	usedG: number;
	/** Dose of the bean's latest brew, for "brews left". */
	lastDoseG: number | null;
}

export interface Bean extends BeanSummary {
	farm: string | null;
	altitudeMinM: number | null;
	altitudeMaxM: number | null;
	decaf: boolean;
	storedFrozen: boolean;
	roasterNotesRaw: string | null;
	roasterNotes: string[];
}

const summaryColumns = {
	id: beans.id,
	name: beans.name,
	roasterId: beans.roasterId,
	roasterName: roasters.name,
	country: beans.country,
	process: sql<Process | null>`${beans.process}`,
	roastLevel: sql<RoastLevel | null>`${beans.roastLevel}`,
	roastDate: beans.roastDate,
	archivedAt: beans.archivedAt,
	brewCount: sql<number>`(select count(*)::int from ${brews} where ${col(brews.beanId)} = ${col(beans.id)})`,
	lastBrewedAt:
		sql<Date | null>`(select max(${col(brews.brewedAt)}) from ${brews} where ${col(brews.beanId)} = ${col(beans.id)})`.mapWith(
			(v: string | Date | null) => (v == null ? null : new Date(v))
		),
	bagWeightG: beans.bagWeightG,
	bagPrice: beans.bagPrice,
	usedG:
		sql<number>`(select coalesce(sum(${col(brews.doseG)}), 0) from ${brews} where ${col(brews.beanId)} = ${col(beans.id)})`.mapWith(
			Number
		),
	lastDoseG: sql<
		number | null
	>`(select ${col(brews.doseG)} from ${brews} where ${col(brews.beanId)} = ${col(beans.id)} order by ${col(brews.brewedAt)} desc, ${col(brews.id)} desc limit 1)`.mapWith(
		(v: string | number | null) => (v == null ? null : Number(v))
	)
};

/** Active beans first by most recently brewed, so the bean you're on is at the top of the picker. */
export async function listBeans(
	db: Db,
	userId: string,
	opts: { includeArchived?: boolean } = {}
): Promise<BeanSummary[]> {
	return db
		.select(summaryColumns)
		.from(beans)
		.innerJoin(roasters, eq(beans.roasterId, roasters.id))
		.where(
			and(eq(beans.userId, userId), opts.includeArchived ? undefined : isNull(beans.archivedAt))
		)
		.orderBy(
			sql`${beans.archivedAt} IS NOT NULL`,
			sql`(select max(${col(brews.brewedAt)}) from ${brews} where ${col(brews.beanId)} = ${col(beans.id)}) DESC NULLS LAST`,
			desc(beans.createdAt)
		);
}

export async function getBean(db: Db, userId: string, id: string): Promise<Bean> {
	assertId(id, 'Bean');
	const [row] = await db
		.select({
			...summaryColumns,
			farm: beans.farm,
			altitudeMinM: beans.altitudeMinM,
			altitudeMaxM: beans.altitudeMaxM,
			decaf: beans.decaf,
			storedFrozen: beans.storedFrozen,
			roasterNotesRaw: beans.roasterNotesRaw
		})
		.from(beans)
		.innerJoin(roasters, eq(beans.roasterId, roasters.id))
		.where(and(eq(beans.id, id), eq(beans.userId, userId)));
	if (!row) throw new NotFoundError('Bean');
	const notes = await db
		.select({ flavorId: beanRoasterNotes.flavorId })
		.from(beanRoasterNotes)
		.where(eq(beanRoasterNotes.beanId, id))
		.orderBy(asc(beanRoasterNotes.flavorId));
	return { ...row, roasterNotes: notes.map((n) => n.flavorId) };
}

function beanColumns(input: BeanInput, roasterId: string) {
	return {
		roasterId,
		name: input.name,
		country: input.country,
		farm: input.farm,
		altitudeMinM: input.altitudeMinM,
		altitudeMaxM: input.altitudeMaxM,
		process: input.process,
		roastLevel: input.roastLevel,
		roastDate: input.roastDate,
		decaf: input.decaf,
		storedFrozen: input.storedFrozen,
		roasterNotesRaw: input.roasterNotesRaw,
		bagWeightG: input.bagWeightG,
		bagPrice: input.bagPrice
	};
}

async function replaceNotes(q: Queryable, beanId: string, flavorIds: string[]): Promise<void> {
	await q.delete(beanRoasterNotes).where(eq(beanRoasterNotes.beanId, beanId));
	if (flavorIds.length) {
		await q.insert(beanRoasterNotes).values(flavorIds.map((flavorId) => ({ beanId, flavorId })));
	}
}

export async function createBean(
	db: Db,
	userId: string,
	input: BeanInput
): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		const roasterId = await findOrCreateRoaster(tx, userId, input.roasterName);
		await reactivateRoaster(tx, userId, roasterId);
		const [bean] = await tx
			.insert(beans)
			.values({ userId, ...beanColumns(input, roasterId) })
			.returning({ id: beans.id });
		await replaceNotes(tx, bean.id, input.roasterNotes);
		return bean;
	});
}

export async function updateBean(
	db: Db,
	userId: string,
	id: string,
	input: BeanInput
): Promise<void> {
	assertId(id, 'Bean');
	await db.transaction(async (tx) => {
		const [current] = await tx
			.select({ roasterId: beans.roasterId })
			.from(beans)
			.where(and(eq(beans.id, id), eq(beans.userId, userId)));
		if (!current) throw new NotFoundError('Bean');
		const roasterId = await findOrCreateRoaster(tx, userId, input.roasterName);
		// Editing an old bean of an archived roaster must not resurface the roaster; moving a bean to it does.
		if (roasterId !== current.roasterId) await reactivateRoaster(tx, userId, roasterId);
		await tx
			.update(beans)
			.set(beanColumns(input, roasterId))
			.where(and(eq(beans.id, id), eq(beans.userId, userId)));
		await replaceNotes(tx, id, input.roasterNotes);
	});
}

export async function setBeanArchived(
	db: Db,
	userId: string,
	id: string,
	archived: boolean
): Promise<void> {
	assertId(id, 'Bean');
	const rows = await db
		.update(beans)
		.set({ archivedAt: archived ? new Date() : null })
		.where(and(eq(beans.id, id), eq(beans.userId, userId)))
		.returning({ id: beans.id });
	if (rows.length === 0) throw new NotFoundError('Bean');
}

export async function deleteBean(db: Db, userId: string, id: string): Promise<void> {
	assertId(id, 'Bean');
	try {
		const rows = await db
			.delete(beans)
			.where(and(eq(beans.id, id), eq(beans.userId, userId)))
			.returning({ id: beans.id });
		if (rows.length === 0) throw new NotFoundError('Bean');
	} catch (e) {
		if (isReferencedError(e)) {
			throw new ConflictError('This bean has brews logged. Archive it instead.');
		}
		throw e;
	}
}

/** Roaster notes for many beans at once (for export). */
export async function roasterNotesFor(
	q: Queryable,
	beanIds: string[]
): Promise<Map<string, string[]>> {
	const map = new Map<string, string[]>();
	if (beanIds.length === 0) return map;
	const rows = await q
		.select()
		.from(beanRoasterNotes)
		.where(inArray(beanRoasterNotes.beanId, beanIds))
		.orderBy(asc(beanRoasterNotes.flavorId));
	for (const r of rows) map.set(r.beanId, [...(map.get(r.beanId) ?? []), r.flavorId]);
	return map;
}
