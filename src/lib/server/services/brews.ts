import { and, asc, count, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { planBaseline, planChanges, type PlanInput } from '../../domain/plan';
import type { BrewInput, RatingInput, V60Details } from '../../domain/schemas';
import {
	RATING_DIMENSIONS,
	type BrewMethod,
	type ChangedVariable,
	type DripperMaterial,
	type RatingDimension
} from '../../domain/vocab';
import {
	beans,
	brewPlans,
	brews,
	drippers,
	grinders,
	pours,
	scales,
	ratingPerceivedNotes,
	ratings,
	roasters
} from '../db/schema';
import { col } from '../db/sql';
import type { Db, Queryable, Tx } from '../db/types';
import { NotFoundError, assertId } from '../errors';
import { METHODS } from '../methods';

export interface Rating extends RatingInput {
	/** Legacy sub-score (D22): shown and exported for old ratings, never written. */
	aftertaste: number | null;
	updatedAt: Date;
}

export interface BrewSummary {
	id: string;
	method: BrewMethod;
	brewedAt: Date;
	/** Zone the brew was logged in; use it for local date and roast age. */
	timezone: string;
	beanId: string;
	beanName: string;
	roasterName: string;
	roastDate: string | null;
	grinderName: string;
	grinderSettingUnit: string | null;
	grindSetting: number;
	doseG: number;
	waterG: number;
	waterTempC: number;
	totalTimeS: number;
	overall: number | null;
}

export interface Brew extends BrewSummary {
	grinderId: string;
	dripperId: string | null;
	dripperName: string | null;
	dripperMaterial: DripperMaterial | null;
	scaleId: string | null;
	agitation: number | null;
	storedFrozen: boolean;
	/** Legacy (D25): what the user said they changed, on brews logged before the plan replaced it. */
	changed: ChangedVariable[];
	notes: string | null;
	details: V60Details;
	rating: Rating | null;
	/** What to change next time (D25); only deliberate changes are stored. */
	plan: PlanInput | null;
}

const summaryColumns = {
	id: brews.id,
	method: sql<BrewMethod>`${brews.method}`,
	brewedAt: brews.brewedAt,
	timezone: brews.timezone,
	beanId: brews.beanId,
	beanName: beans.name,
	roasterName: roasters.name,
	roastDate: beans.roastDate,
	grinderName: grinders.name,
	grinderSettingUnit: grinders.settingUnit,
	grindSetting: brews.grindSetting,
	doseG: brews.doseG,
	waterG: brews.waterG,
	waterTempC: brews.waterTempC,
	totalTimeS: brews.totalTimeS,
	overall: ratings.overall
};

function baseQuery(q: Queryable) {
	return q
		.select({
			...summaryColumns,
			grinderId: brews.grinderId,
			dripperId: brews.dripperId,
			dripperName: drippers.name,
			dripperMaterial: sql<DripperMaterial | null>`${drippers.material}`,
			scaleId: brews.scaleId,
			agitation: brews.agitation,
			storedFrozen: beans.storedFrozen,
			changed: sql<ChangedVariable[]>`${brews.changed}`,
			notes: brews.notes
		})
		.from(brews)
		.innerJoin(beans, eq(brews.beanId, beans.id))
		.innerJoin(roasters, eq(beans.roasterId, roasters.id))
		.innerJoin(grinders, eq(brews.grinderId, grinders.id))
		.leftJoin(drippers, eq(brews.dripperId, drippers.id))
		.leftJoin(ratings, eq(ratings.brewId, brews.id));
}

export interface BrewPage {
	brews: BrewSummary[];
	/** Pass back as `before` to fetch the next (older) page; null on the last page. */
	nextCursor: string | null;
}

/**
 * Newest first, keyset-paginated on (brewed_at, id) so pages stay stable while new brews are logged.
 * The cursor is "<iso timestamp>_<id>".
 */
export async function listBrews(
	db: Db,
	userId: string,
	opts: { limit?: number; before?: string | null; beanId?: string } = {}
): Promise<BrewPage> {
	if (opts.beanId) assertId(opts.beanId, 'Bean');
	const limit = Math.min(Math.max(opts.limit ?? 30, 1), 200);
	const cursor = parseCursor(opts.before);
	const rows = await baseQuery(db)
		.where(
			and(
				eq(brews.userId, userId),
				opts.beanId ? eq(brews.beanId, opts.beanId) : undefined,
				cursor
					? or(
							lt(brews.brewedAt, cursor.brewedAt),
							and(eq(brews.brewedAt, cursor.brewedAt), lt(brews.id, cursor.id))
						)
					: undefined
			)
		)
		.orderBy(desc(brews.brewedAt), desc(brews.id))
		.limit(limit + 1);
	const page = rows.slice(0, limit);
	const last = page.at(-1);
	return {
		brews: page.map(toSummary),
		nextCursor: rows.length > limit && last ? `${last.brewedAt.toISOString()}_${last.id}` : null
	};
}

function parseCursor(cursor: string | null | undefined): { brewedAt: Date; id: string } | null {
	if (!cursor) return null;
	const [iso, id] = cursor.split('_');
	const brewedAt = new Date(iso);
	if (Number.isNaN(brewedAt.getTime()) || !/^[0-9a-f-]{36}$/.test(id ?? '')) return null;
	return { brewedAt, id };
}

function toSummary(row: BrewSummary & Record<string, unknown>): BrewSummary {
	return {
		id: row.id,
		method: row.method,
		brewedAt: row.brewedAt,
		timezone: row.timezone,
		beanId: row.beanId,
		beanName: row.beanName,
		roasterName: row.roasterName,
		roastDate: row.roastDate,
		grinderName: row.grinderName,
		grinderSettingUnit: row.grinderSettingUnit,
		grindSetting: row.grindSetting,
		doseG: row.doseG,
		waterG: row.waterG,
		waterTempC: row.waterTempC,
		totalTimeS: row.totalTimeS,
		overall: row.overall
	};
}

export async function countBrews(db: Db, userId: string): Promise<number> {
	const [row] = await db.select({ n: count() }).from(brews).where(eq(brews.userId, userId));
	return row.n;
}

export async function getBrew(db: Db, userId: string, id: string): Promise<Brew> {
	assertId(id, 'Brew');
	const [row] = await baseQuery(db).where(and(eq(brews.id, id), eq(brews.userId, userId)));
	if (!row) throw new NotFoundError('Brew');
	const [details, rating, plan] = await Promise.all([
		METHODS[row.method].load(db, [id]),
		loadRatings(db, [id]),
		loadPlans(db, [id])
	]);
	return {
		...row,
		details: details.get(id) ?? { filterType: null, pours: [] },
		rating: rating.get(id) ?? null,
		plan: plan.get(id) ?? null
	};
}

/** The user's most recent brew, used to pre-fill the next one (D15). */
export async function getLatestBrew(db: Db, userId: string): Promise<Brew | null> {
	const [row] = await db
		.select({ id: brews.id })
		.from(brews)
		.where(eq(brews.userId, userId))
		.orderBy(desc(brews.brewedAt), desc(brews.id))
		.limit(1);
	return row ? getBrew(db, userId, row.id) : null;
}

/** The rating of the user's latest rated brew before `brew`, shown beside an unrated brew's rate form (D53). */
export async function getPreviousRating(
	db: Db,
	userId: string,
	brew: { id: string; brewedAt: Date }
): Promise<Rating | null> {
	const [row] = await db
		.select({ id: brews.id })
		.from(brews)
		.innerJoin(ratings, eq(ratings.brewId, brews.id))
		.where(
			and(
				eq(brews.userId, userId),
				or(
					lt(brews.brewedAt, brew.brewedAt),
					and(eq(brews.brewedAt, brew.brewedAt), lt(brews.id, brew.id))
				)
			)
		)
		.orderBy(desc(brews.brewedAt), desc(brews.id))
		.limit(1);
	if (!row) return null;
	return (await loadRatings(db, [row.id])).get(row.id) ?? null;
}

export async function loadRatings(q: Queryable, brewIds: string[]): Promise<Map<string, Rating>> {
	const result = new Map<string, Rating>();
	if (brewIds.length === 0) return result;
	const rows = await q.select().from(ratings).where(inArray(ratings.brewId, brewIds));
	for (const r of rows) {
		const rating = {
			overall: r.overall,
			comment: r.comment,
			perceivedNotes: [],
			aftertaste: r.aftertaste,
			updatedAt: r.updatedAt
		} as unknown as Rating;
		for (const d of RATING_DIMENSIONS) rating[d] = r[d];
		result.set(r.brewId, rating);
	}
	const notes = await q
		.select()
		.from(ratingPerceivedNotes)
		.where(inArray(ratingPerceivedNotes.brewId, brewIds))
		.orderBy(asc(ratingPerceivedNotes.flavorId));
	for (const n of notes) result.get(n.brewId)?.perceivedNotes.push(n.flavorId);
	return result;
}

export async function loadPlans(q: Queryable, brewIds: string[]): Promise<Map<string, PlanInput>> {
	const result = new Map<string, PlanInput>();
	if (brewIds.length === 0) return result;
	const rows = await q.select().from(brewPlans).where(inArray(brewPlans.brewId, brewIds));
	for (const r of rows) {
		result.set(r.brewId, {
			waterTempC: r.waterTempC,
			ratio: r.ratio,
			grindSetting: r.grindSetting,
			pourCount: r.pourCount,
			agitation: r.agitation,
			notes: r.notes
		});
	}
	return result;
}

/** Bean, grinder and dripper must belong to the user. The composite FKs enforce this too; this gives a clear error. */
async function assertOwnedRefs(tx: Tx, userId: string, input: BrewInput): Promise<void> {
	assertId(input.beanId, 'Bean');
	assertId(input.grinderId, 'Grinder');
	if (input.dripperId) {
		assertId(input.dripperId, 'Dripper');
		const [dripper] = await tx
			.select({ id: drippers.id })
			.from(drippers)
			.where(and(eq(drippers.id, input.dripperId), eq(drippers.userId, userId)));
		if (!dripper) throw new NotFoundError('Dripper');
	}
	if (input.scaleId) {
		assertId(input.scaleId, 'Scale');
		const [scale] = await tx
			.select({ id: scales.id })
			.from(scales)
			.where(and(eq(scales.id, input.scaleId), eq(scales.userId, userId)));
		if (!scale) throw new NotFoundError('Scale');
	}
	const [bean] = await tx
		.select({ id: beans.id })
		.from(beans)
		.where(and(eq(beans.id, input.beanId), eq(beans.userId, userId)));
	if (!bean) throw new NotFoundError('Bean');
	const [grinder] = await tx
		.select({ id: grinders.id })
		.from(grinders)
		.where(and(eq(grinders.id, input.grinderId), eq(grinders.userId, userId)));
	if (!grinder) throw new NotFoundError('Grinder');
}

function brewColumns(input: BrewInput) {
	return {
		beanId: input.beanId,
		grinderId: input.grinderId,
		dripperId: input.dripperId,
		scaleId: input.scaleId ?? null,
		method: input.method,
		brewedAt: input.brewedAt,
		timezone: input.timezone,
		grindSetting: input.grindSetting,
		doseG: input.doseG,
		// Derived from the method block so it can never disagree with the pours (D12).
		waterG: METHODS[input.method].waterG(input.details),
		waterTempC: input.waterTempC,
		agitation: input.agitation,
		totalTimeS: input.totalTimeS,
		// `changed` is legacy (D25): never written, so edits keep what old brews recorded.
		notes: input.notes
	};
}

/** The plan as stored for this brew input: only values that differ from the brew's own. */
function planFor(input: BrewInput, plan: PlanInput | null): PlanInput | null {
	return planChanges(
		plan,
		planBaseline({
			waterTempC: input.waterTempC,
			grindSetting: input.grindSetting,
			doseG: input.doseG,
			waterG: METHODS[input.method].waterG(input.details),
			agitation: input.agitation,
			pourCount: input.details.pours.length
		})
	);
}

/** Replaces the plan of a brew; null removes it. */
async function writePlan(tx: Tx, brewId: string, plan: PlanInput | null): Promise<void> {
	if (!plan) {
		await tx.delete(brewPlans).where(eq(brewPlans.brewId, brewId));
		return;
	}
	const values = { ...plan };
	await tx
		.insert(brewPlans)
		.values({ brewId, ...values })
		.onConflictDoUpdate({ target: brewPlans.brewId, set: { ...values, updatedAt: new Date() } });
}

export async function createBrew(
	db: Db,
	userId: string,
	input: BrewInput,
	rating: RatingInput | null = null,
	plan: PlanInput | null = null
): Promise<{ id: string }> {
	return db.transaction(async (tx) => {
		await assertOwnedRefs(tx, userId, input);
		const [brew] = await tx
			.insert(brews)
			.values({ userId, ...brewColumns(input) })
			.returning({ id: brews.id });
		await METHODS[input.method].save(tx, brew.id, input.details);
		if (rating) await writeRating(tx, brew.id, rating);
		await writePlan(tx, brew.id, planFor(input, plan));
		return brew;
	});
}

/** Replaces the brew, its method block, its rating and its plan with the submitted form state. */
export async function updateBrew(
	db: Db,
	userId: string,
	id: string,
	input: BrewInput,
	rating: RatingInput | null,
	plan: PlanInput | null
): Promise<void> {
	assertId(id, 'Brew');
	await db.transaction(async (tx) => {
		await assertOwnedRefs(tx, userId, input);
		const rows = await tx
			.update(brews)
			.set(brewColumns(input))
			.where(and(eq(brews.id, id), eq(brews.userId, userId)))
			.returning({ id: brews.id });
		if (rows.length === 0) throw new NotFoundError('Brew');
		await METHODS[input.method].save(tx, id, input.details);
		if (rating) await writeRating(tx, id, rating);
		else await tx.delete(ratings).where(eq(ratings.brewId, id));
		await writePlan(tx, id, planFor(input, plan));
	});
}

/** Sets (or, with null, removes) what to change next time, compared against the stored brew. */
export async function savePlan(
	db: Db,
	userId: string,
	brewId: string,
	plan: PlanInput | null
): Promise<void> {
	assertId(brewId, 'Brew');
	await db.transaction(async (tx) => {
		const [brew] = await tx
			.select({
				waterTempC: brews.waterTempC,
				grindSetting: brews.grindSetting,
				doseG: brews.doseG,
				waterG: brews.waterG,
				agitation: brews.agitation,
				pourCount: sql<number>`(select count(*)::int from ${pours} where ${col(pours.brewId)} = ${col(brews.id)})`
			})
			.from(brews)
			.where(and(eq(brews.id, brewId), eq(brews.userId, userId)));
		if (!brew) throw new NotFoundError('Brew');
		await writePlan(tx, brewId, planChanges(plan, planBaseline(brew)));
	});
}

/** Sets (or, with null, removes) the rating of a brew. */
export async function saveRating(
	db: Db,
	userId: string,
	brewId: string,
	rating: RatingInput | null
): Promise<void> {
	assertId(brewId, 'Brew');
	await db.transaction(async (tx) => {
		const [brew] = await tx
			.select({ id: brews.id })
			.from(brews)
			.where(and(eq(brews.id, brewId), eq(brews.userId, userId)));
		if (!brew) throw new NotFoundError('Brew');
		if (rating) await writeRating(tx, brewId, rating);
		else await tx.delete(ratings).where(eq(ratings.brewId, brewId));
	});
}

async function writeRating(tx: Tx, brewId: string, rating: RatingInput): Promise<void> {
	// Legacy sub-scores (aftertaste) are left as they are: the form no longer collects them (D22).
	const values: Partial<Record<RatingDimension, number | null>> & {
		overall: number;
		comment: string | null;
	} = { overall: rating.overall, comment: rating.comment };
	for (const d of RATING_DIMENSIONS) values[d] = rating[d];
	await tx
		.insert(ratings)
		.values({ brewId, ...values })
		.onConflictDoUpdate({ target: ratings.brewId, set: { ...values, updatedAt: new Date() } });
	await tx.delete(ratingPerceivedNotes).where(eq(ratingPerceivedNotes.brewId, brewId));
	if (rating.perceivedNotes.length) {
		await tx
			.insert(ratingPerceivedNotes)
			.values(rating.perceivedNotes.map((flavorId) => ({ brewId, flavorId })));
	}
}

export async function deleteBrew(db: Db, userId: string, id: string): Promise<void> {
	assertId(id, 'Brew');
	const rows = await db
		.delete(brews)
		.where(and(eq(brews.id, id), eq(brews.userId, userId)))
		.returning({ id: brews.id });
	if (rows.length === 0) throw new NotFoundError('Brew');
}
