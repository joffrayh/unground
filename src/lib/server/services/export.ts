/**
 * CSV export for Stage 2 (D14).
 *
 * brews.csv — one denormalised row per brew: bean, grinder, method block, rating and derived values.
 * pours.csv — one row per pour, keyed by brew_id.
 * Tag lists are ';'-separated flavor ids ("fruity.berry.blueberry"), so they can be rolled up by prefix.
 * Local dates and roast ages use each brew's own time zone. Each file is read from one snapshot.
 */
import { asc, eq } from 'drizzle-orm';
import { brewRatio, localDate, roastAgeDays } from '../../domain/derive';
import { poursToEntries } from '../../domain/pours';
import { LEGACY_RATING_DIMENSIONS, RATING_DIMENSIONS } from '../../domain/vocab';
import { beans, brews, drippers, grinders, pours, roasters, scales } from '../db/schema';
import type { Db, Tx } from '../db/types';
import { METHODS } from '../methods';
import type { CsvValue } from '../methods/types';
import { roasterNotesFor } from './beans';
import { loadPlans, loadRatings } from './brews';

export function csvCell(value: CsvValue): string {
	if (value == null) return '';
	const s = String(value);
	return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(columns: readonly string[], rows: Record<string, CsvValue>[]): string {
	const lines = [columns.join(',')];
	for (const row of rows) lines.push(columns.map((c) => csvCell(row[c] ?? null)).join(','));
	return lines.join('\r\n') + '\r\n';
}

const methodColumns = [...new Set(Object.values(METHODS).flatMap((m) => m.exportColumns))];

export const BREW_COLUMNS = [
	'brew_id',
	'brewed_at_utc',
	'brewed_local_date',
	'timezone',
	'method',
	'bean_id',
	'bean_name',
	'roaster_id',
	'roaster_name',
	'country',
	'farm',
	'altitude_min_m',
	'altitude_max_m',
	'process',
	'roast_level',
	'roast_date',
	'roast_age_days',
	'decaf',
	'stored_frozen',
	'bag_weight_g',
	'bag_price',
	'grinder_id',
	'grinder_name',
	'grind_setting',
	'slow_fed',
	'dripper_id',
	'dripper_name',
	'dripper_material',
	'scale_id',
	'scale_name',
	'dose_g',
	'water_g',
	'ratio',
	'water_temp_c',
	'agitation',
	'total_time_s',
	...methodColumns,
	'changed',
	'brew_notes',
	'rating_overall',
	...RATING_DIMENSIONS.map((d) => `rating_${d}` as const),
	...LEGACY_RATING_DIMENSIONS.map((d) => `rating_${d}` as const),
	'perceived_notes',
	'roaster_notes',
	'roaster_notes_raw',
	'rating_comment',
	// What the brewer meant to change next time (D25); blank = keep as it was.
	'next_water_temp_c',
	'next_ratio',
	'next_grind_setting',
	'next_pour_count',
	'next_agitation',
	'next_notes'
] as const;

const SNAPSHOT = { isolationLevel: 'repeatable read', accessMode: 'read only' } as const;

export function brewsCsv(db: Db, userId: string): Promise<string> {
	return db.transaction((tx) => buildBrewsCsv(tx, userId), SNAPSHOT);
}

async function buildBrewsCsv(db: Tx, userId: string): Promise<string> {
	const rows = await db
		.select({
			brew: brews,
			bean: beans,
			roasterName: roasters.name,
			grinderName: grinders.name,
			dripperName: drippers.name,
			dripperMaterial: drippers.material,
			scaleName: scales.name
		})
		.from(brews)
		.innerJoin(beans, eq(brews.beanId, beans.id))
		.innerJoin(roasters, eq(beans.roasterId, roasters.id))
		.innerJoin(grinders, eq(brews.grinderId, grinders.id))
		.leftJoin(drippers, eq(brews.dripperId, drippers.id))
		.leftJoin(scales, eq(brews.scaleId, scales.id))
		.where(eq(brews.userId, userId))
		.orderBy(asc(brews.brewedAt), asc(brews.id));

	const brewIds = rows.map((r) => r.brew.id);
	const [ratingMap, planMap, notesMap] = await Promise.all([
		loadRatings(db, brewIds),
		loadPlans(db, brewIds),
		roasterNotesFor(db, [...new Set(rows.map((r) => r.bean.id))])
	]);
	const detailsByMethod = new Map<string, Map<string, unknown>>();
	for (const [id, module] of Object.entries(METHODS)) {
		const ids = rows.filter((r) => r.brew.method === id).map((r) => r.brew.id);
		detailsByMethod.set(id, await module.load(db, ids));
	}

	const out = rows.map((row) => {
		const { brew, bean, roasterName, grinderName, dripperName, dripperMaterial, scaleName } = row;
		const rating = ratingMap.get(brew.id);
		const plan = planMap.get(brew.id);
		const scores: Record<string, CsvValue> = {};
		for (const d of [...RATING_DIMENSIONS, ...LEGACY_RATING_DIMENSIONS]) {
			scores[`rating_${d}`] = rating?.[d] ?? null;
		}
		const module = METHODS[brew.method as keyof typeof METHODS];
		const details = detailsByMethod.get(brew.method)?.get(brew.id);
		return {
			brew_id: brew.id,
			brewed_at_utc: brew.brewedAt.toISOString(),
			brewed_local_date: localDate(brew.brewedAt, brew.timezone),
			timezone: brew.timezone,
			method: brew.method,
			bean_id: bean.id,
			bean_name: bean.name,
			roaster_id: bean.roasterId,
			roaster_name: roasterName,
			country: bean.country,
			farm: bean.farm,
			altitude_min_m: bean.altitudeMinM,
			altitude_max_m: bean.altitudeMaxM,
			process: bean.process,
			roast_level: bean.roastLevel,
			roast_date: bean.roastDate,
			roast_age_days: roastAgeDays(bean.roastDate, brew.brewedAt, brew.timezone),
			decaf: bean.decaf,
			stored_frozen: bean.storedFrozen,
			bag_weight_g: bean.bagWeightG,
			bag_price: bean.bagPrice,
			grinder_id: brew.grinderId,
			grinder_name: grinderName,
			grind_setting: brew.grindSetting,
			slow_fed: brew.slowFed,
			dripper_id: brew.dripperId,
			dripper_name: dripperName,
			dripper_material: dripperMaterial,
			scale_id: brew.scaleId,
			scale_name: scaleName,
			dose_g: brew.doseG,
			water_g: brew.waterG,
			ratio: brewRatio(brew.doseG, brew.waterG),
			water_temp_c: brew.waterTempC,
			agitation: brew.agitation,
			total_time_s: brew.totalTimeS,
			...(module && details ? module.exportRow(details as never) : {}),
			changed: brew.changed.join(';'),
			brew_notes: brew.notes,
			rating_overall: rating?.overall ?? null,
			...scores,
			perceived_notes: rating?.perceivedNotes.join(';') ?? null,
			roaster_notes: (notesMap.get(bean.id) ?? []).join(';'),
			roaster_notes_raw: bean.roasterNotesRaw,
			rating_comment: rating?.comment ?? null,
			next_water_temp_c: plan?.waterTempC ?? null,
			next_ratio: plan?.ratio ?? null,
			next_grind_setting: plan?.grindSetting ?? null,
			next_pour_count: plan?.pourCount ?? null,
			next_agitation: plan?.agitation ?? null,
			next_notes: plan?.notes ?? null
		};
	});
	return toCsv(BREW_COLUMNS, out);
}

export const POUR_COLUMNS = [
	'brew_id',
	'idx',
	// What the app shows ("Pour 0", D27); idx stays 1-based as stored.
	'pour_number',
	'volume_g',
	'interval_s',
	'bloom',
	'start_s',
	'cumulative_g',
	// Blank unless a scale measured the pour (D51).
	'planned_start_s',
	'planned_cumulative_g',
	'duration_s'
] as const;

export function poursCsv(db: Db, userId: string): Promise<string> {
	return db.transaction((tx) => buildPoursCsv(tx, userId), SNAPSHOT);
}

async function buildPoursCsv(db: Tx, userId: string): Promise<string> {
	const rows = await db
		.select({
			brewId: pours.brewId,
			idx: pours.idx,
			volumeG: pours.volumeG,
			intervalS: pours.intervalS,
			bloom: pours.bloom,
			plannedCumulativeG: pours.plannedCumulativeG,
			plannedStartS: pours.plannedStartS,
			durationS: pours.durationS
		})
		.from(pours)
		.innerJoin(brews, eq(pours.brewId, brews.id))
		.where(eq(brews.userId, userId))
		.orderBy(asc(brews.brewedAt), asc(brews.id), asc(pours.idx));

	const out: Record<string, CsvValue>[] = [];
	for (let i = 0; i < rows.length;) {
		const brewId = rows[i].brewId;
		const group = [];
		while (i < rows.length && rows[i].brewId === brewId) group.push(rows[i++]);
		const entries = poursToEntries(group);
		group.forEach((p, j) =>
			out.push({
				brew_id: brewId,
				idx: p.idx,
				pour_number: p.idx - 1,
				volume_g: p.volumeG,
				interval_s: p.intervalS,
				bloom: p.bloom,
				start_s: entries[j].startS,
				cumulative_g: entries[j].cumulativeG,
				planned_start_s: p.plannedStartS,
				planned_cumulative_g: p.plannedCumulativeG,
				duration_s: p.durationS
			})
		);
	}
	return toCsv(POUR_COLUMNS, out);
}
