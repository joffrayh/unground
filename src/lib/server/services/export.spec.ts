import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { brews, ratings } from '../db/schema';
import type { Db } from '../db/types';
import { brewInput, createTestDb, ratingInput, setupBrewer } from '../testing';
import { createBrew } from './brews';
import { BREW_COLUMNS, brewsCsv, csvCell, poursCsv } from './export';
import { createScale } from './scales';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close());

/** Minimal RFC 4180 parser for assertions. */
function parseCsv(text: string): Record<string, string>[] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"' && text[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (ch === '"') {
				quoted = false;
			} else {
				cell += ch;
			}
		} else if (ch === '"') {
			quoted = true;
		} else if (ch === ',') {
			row.push(cell);
			cell = '';
		} else if (ch === '\r' && text[i + 1] === '\n') {
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
			i++;
		} else {
			cell += ch;
		}
	}
	const [header, ...body] = rows;
	return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

describe('csv export', () => {
	it('escapes cells per RFC 4180', () => {
		expect(csvCell('plain')).toBe('plain');
		expect(csvCell('a, b')).toBe('"a, b"');
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
		expect(csvCell('two\nlines')).toBe('"two\nlines"');
		expect(csvCell(null)).toBe('');
		expect(csvCell(false)).toBe('false');
	});

	it('writes one denormalised row per brew with derived values', async () => {
		const refs = await setupBrewer(db, 'Europe/London');
		const { id } = await createBrew(
			db,
			refs.userId,
			brewInput(refs, {
				dripperId: refs.dripperId,
				slowFed: true,
				notes: 'Fast drawdown, "choked" a bit'
			}),
			ratingInput({ perceivedNotes: ['fruity.berry.blueberry', 'sweet.brown_sugar.honey'] }),
			{
				waterTempC: 92,
				ratio: null,
				grindSetting: null,
				pourCount: 4,
				agitation: null,
				notes: 'Finer next time'
			}
		);
		// Legacy column, no longer written by the form (D25).
		await db
			.update(brews)
			.set({ changed: ['grind', 'dose'] })
			.where(eq(brews.id, id));
		const csv = await brewsCsv(db, refs.userId);
		expect(csv.split('\r\n')[0]).toBe(BREW_COLUMNS.join(','));
		const [row] = parseCsv(csv);
		expect(row).toMatchObject({
			brew_id: id,
			brewed_at_utc: '2026-11-03T08:00:00.000Z',
			brewed_local_date: '2026-11-03',
			timezone: 'Europe/London',
			method: 'v60',
			bean_name: 'Gesha Village',
			roaster_name: 'Square Mile',
			country: 'ET',
			process: 'washed',
			roast_age_days: '14',
			stored_frozen: 'false',
			bag_weight_g: '250',
			bag_price: '14.5',
			grind_setting: '24',
			slow_fed: 'true',
			dripper_id: refs.dripperId,
			dripper_name: 'Hario V60 02',
			dripper_material: 'plastic',
			dose_g: '15',
			water_g: '250',
			ratio: '16.7',
			water_temp_c: '94',
			agitation: '3',
			pour_count: '3',
			bloom_pours: '1',
			bloom_g: '50',
			bloom_time_s: '45',
			last_pour_start_s: '75',
			filter_type: 'hario_tabbed',
			changed: 'grind;dose',
			brew_notes: 'Fast drawdown, "choked" a bit',
			rating_overall: '4',
			rating_acidity: '3.5',
			rating_astringency: '1.5',
			rating_clarity: '3.5',
			rating_aftertaste: '',
			perceived_notes: 'fruity.berry.blueberry;sweet.brown_sugar.honey',
			roaster_notes: 'floral.floral.jasmine;fruity.other_fruit.peach',
			next_water_temp_c: '92',
			next_ratio: '',
			next_grind_setting: '',
			next_pour_count: '4',
			next_agitation: '',
			next_notes: 'Finer next time'
		});
	});

	it('leaves dripper and bloom columns blank when they were not recorded', async () => {
		const refs = await setupBrewer(db);
		const input = brewInput({ ...refs, dripperId: null });
		input.details.pours = input.details.pours.map((p) => ({ ...p, bloom: false }));
		await createBrew(db, refs.userId, input);
		const [row] = parseCsv(await brewsCsv(db, refs.userId));
		expect(row).toMatchObject({
			dripper_id: '',
			dripper_name: '',
			bloom_pours: '0',
			bloom_g: '',
			bloom_time_s: '',
			changed: ''
		});
	});

	it('times the bloom up to the first pour that is not a bloom', async () => {
		const refs = await setupBrewer(db);
		const input = brewInput(refs);
		input.details.pours = [
			{ volumeG: 30, intervalS: 0, bloom: true },
			{ volumeG: 30, intervalS: 20, bloom: true },
			{ volumeG: 190, intervalS: 25, bloom: false }
		];
		await createBrew(db, refs.userId, input);
		const [row] = parseCsv(await brewsCsv(db, refs.userId));
		expect(row).toMatchObject({ bloom_pours: '2', bloom_g: '60', bloom_time_s: '45' });
	});

	it('still exports a legacy aftertaste score', async () => {
		const refs = await setupBrewer(db);
		const { id } = await createBrew(db, refs.userId, brewInput(refs), ratingInput());
		await db.update(ratings).set({ aftertaste: 3 }).where(eq(ratings.brewId, id));
		const [row] = parseCsv(await brewsCsv(db, refs.userId));
		expect(row.rating_aftertaste).toBe('3');
	});

	it('leaves unrated brews blank, not zero', async () => {
		const refs = await setupBrewer(db);
		await createBrew(db, refs.userId, brewInput(refs));
		const [row] = parseCsv(await brewsCsv(db, refs.userId));
		expect(row.rating_overall).toBe('');
		expect(row.rating_acidity).toBe('');
	});

	it('writes pours with derived start times and running totals', async () => {
		const refs = await setupBrewer(db);
		const { id } = await createBrew(db, refs.userId, brewInput(refs));
		const rows = parseCsv(await poursCsv(db, refs.userId));
		expect(rows).toEqual([
			{
				brew_id: id,
				idx: '1',
				pour_number: '0',
				volume_g: '50',
				interval_s: '0',
				bloom: 'true',
				start_s: '0',
				cumulative_g: '50',
				planned_start_s: '',
				planned_cumulative_g: '',
				duration_s: ''
			},
			{
				brew_id: id,
				idx: '2',
				pour_number: '1',
				volume_g: '100',
				interval_s: '45',
				bloom: 'false',
				start_s: '45',
				cumulative_g: '150',
				planned_start_s: '',
				planned_cumulative_g: '',
				duration_s: ''
			},
			{
				brew_id: id,
				idx: '3',
				pour_number: '2',
				volume_g: '100',
				interval_s: '30',
				bloom: 'false',
				start_s: '75',
				cumulative_g: '250',
				planned_start_s: '',
				planned_cumulative_g: '',
				duration_s: ''
			}
		]);
	});

	it('exports what a scale measured alongside the plan (D51)', async () => {
		const refs = await setupBrewer(db);
		const { id: scaleId } = await createScale(db, refs.userId, { name: 'Ultra' });
		await createBrew(
			db,
			refs.userId,
			brewInput(refs, {
				scaleId,
				details: {
					filterType: null,
					pours: [
						{
							volumeG: 46.2,
							intervalS: 0,
							bloom: true,
							plannedCumulativeG: 45,
							plannedStartS: 0,
							durationS: 3.5
						}
					]
				}
			})
		);
		expect(parseCsv(await poursCsv(db, refs.userId))[0]).toMatchObject({
			cumulative_g: '46.2',
			planned_start_s: '0',
			planned_cumulative_g: '45',
			duration_s: '3.5'
		});
		expect(parseCsv(await brewsCsv(db, refs.userId))[0]).toMatchObject({
			scale_id: scaleId,
			scale_name: 'Ultra'
		});
	});

	it('only exports the requesting user’s data', async () => {
		const a = await setupBrewer(db);
		const b = await setupBrewer(db);
		await createBrew(db, a.userId, brewInput(a));
		expect(parseCsv(await brewsCsv(db, b.userId))).toHaveLength(0);
		expect(parseCsv(await poursCsv(db, b.userId))).toHaveLength(0);
	});
});
