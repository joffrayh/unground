import { asc, eq, inArray } from 'drizzle-orm';
import { pourMeasurement, roundTenth, totalWater } from '../../domain/pours';
import type { V60Details } from '../../domain/schemas';
import type { FilterType } from '../../domain/vocab';
import { brewV60, pours } from '../db/schema';
import type { MethodModule } from './types';

export const v60: MethodModule<V60Details> = {
	id: 'v60',

	waterG: (details) => totalWater(details.pours),

	exportColumns: [
		'pour_count',
		'bloom_pours',
		'bloom_g',
		'bloom_time_s',
		'last_pour_start_s',
		'filter_type'
	],

	exportRow(details) {
		const blooms = details.pours.filter((p) => p.bloom);
		// The bloom wait: from the brew start (a bloom) to the first pour that isn't one (D27).
		let bloomTimeS: number | null = null;
		if (details.pours[0]?.bloom) {
			let start = 0;
			for (const p of details.pours.slice(1)) {
				start += p.intervalS;
				if (!p.bloom) {
					bloomTimeS = start;
					break;
				}
			}
		}
		return {
			pour_count: details.pours.length,
			bloom_pours: blooms.length,
			bloom_g: blooms.length ? roundTenth(blooms.reduce((s, p) => s + p.volumeG, 0)) : null,
			bloom_time_s: bloomTimeS,
			last_pour_start_s: details.pours.reduce((s, p) => s + p.intervalS, 0),
			filter_type: details.filterType
		};
	},

	async save(tx, brewId, details) {
		await tx
			.insert(brewV60)
			.values({ brewId, filterType: details.filterType })
			.onConflictDoUpdate({ target: brewV60.brewId, set: { filterType: details.filterType } });
		await tx.delete(pours).where(eq(pours.brewId, brewId));
		await tx.insert(pours).values(
			details.pours.map((p, i) => ({
				brewId,
				idx: i + 1,
				volumeG: p.volumeG,
				intervalS: p.intervalS,
				bloom: p.bloom,
				plannedCumulativeG: p.plannedCumulativeG ?? null,
				plannedStartS: p.plannedStartS ?? null,
				durationS: p.durationS ?? null
			}))
		);
	},

	async load(q, brewIds) {
		const result = new Map<string, V60Details>();
		if (brewIds.length === 0) return result;
		const blocks = await q.select().from(brewV60).where(inArray(brewV60.brewId, brewIds));
		for (const b of blocks) {
			result.set(b.brewId, { filterType: b.filterType as FilterType | null, pours: [] });
		}
		const rows = await q
			.select()
			.from(pours)
			.where(inArray(pours.brewId, brewIds))
			.orderBy(asc(pours.brewId), asc(pours.idx));
		for (const p of rows) {
			let details = result.get(p.brewId);
			if (!details) {
				details = { filterType: null, pours: [] };
				result.set(p.brewId, details);
			}
			details.pours.push({
				volumeG: p.volumeG,
				intervalS: p.intervalS,
				bloom: p.bloom,
				...pourMeasurement(p)
			});
		}
		return result;
	}
};
