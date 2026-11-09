import { describe, expect, it } from 'vitest';
import {
	applyMeasuredPours,
	effectiveScale,
	measuredTotalS,
	errorRowIndex,
	isBlank,
	parseGrams,
	pourTargets,
	placeholderRowsFromEntries,
	rowsFromEntries,
	rowsFromValues,
	summarizePours,
	trimSpareRows,
	withSpareRows,
	type PourRow
} from './pour-rows.ts';

describe('applyMeasuredPours', () => {
	const planned = (time: string, scale: string): PourRow => ({
		time: '',
		scale: '',
		bloom: false,
		defaultTime: time,
		defaultScale: scale
	});
	const measured = (startMs: number, endMs: number | null, weight: number | null) => ({
		startMs,
		endMs,
		weight
	});

	it('fills in what was measured, keeping the plan', () => {
		const rows = [planned('', '45'), planned('0:45', '150')];
		expect(
			applyMeasuredPours(rows, [measured(0, 3500, 46.24), measured(46_400, 49_900, 153.5)])
		).toEqual([
			{ ...rows[0], scale: '46.2', plannedG: '45', plannedStart: '0', duration: '3.5' },
			{
				...rows[1],
				time: '0:46',
				scale: '153.5',
				plannedG: '150',
				plannedStart: '45',
				duration: '3.5'
			}
		]);
	});

	it('takes the plan from typed values too', () => {
		const rows = [
			{ ...planned('', ''), scale: '50' },
			{ ...planned('', ''), time: '1:00', scale: '120' }
		];
		const [, second] = applyMeasuredPours(rows, [
			measured(0, 1000, 50),
			measured(61_000, 64_000, 121)
		]);
		expect(second).toMatchObject({ plannedG: '120', plannedStart: '60', scale: '121' });
	});

	it('leaves a pour it did not measure to be typed', () => {
		const rows = [planned('', '45'), planned('0:45', '150')];
		const out = applyMeasuredPours(rows, [measured(0, 3000, 45)]);
		expect(out[1]).toEqual(rows[1]);
	});

	it('skips blank rows, as the targets do', () => {
		const rows = [planned('', '45'), planned('', ''), planned('1:30', '200')];
		const out = applyMeasuredPours(rows, [measured(0, 3000, 45), measured(90_000, 93_000, 201)]);
		expect(out[1]).toEqual(rows[1]);
		expect(out[2]).toMatchObject({ scale: '201', plannedG: '200' });
	});

	it('keeps pours in order when they round to the same second', () => {
		const rows = [planned('', '45'), planned('0:01', '90'), planned('0:02', '150')];
		const out = applyMeasuredPours(rows, [
			measured(0, 300, 45),
			measured(400, 900, 90),
			measured(1200, 1800, 150)
		]);
		expect(out.map((r) => r.time)).toEqual(['', '0:01', '0:02']);
	});

	it('keeps the original plan when measuring a second time', () => {
		const first = applyMeasuredPours([planned('', '45')], [measured(0, 3000, 46)]);
		const second = applyMeasuredPours(first, [measured(0, 3500, 47)]);
		expect(second[0]).toMatchObject({ scale: '47', plannedG: '45', duration: '3.5' });
	});

	it('leaves the duration blank for a pour that never ended', () => {
		const [row] = applyMeasuredPours([planned('', '45')], [measured(0, null, 30)]);
		expect(row.duration).toBe('');
	});

	it('leaves a pour alone if it has no weight', () => {
		const rows = [planned('', '45')];
		expect(applyMeasuredPours(rows, [measured(0, null, null)])[0]).toEqual(rows[0]);
	});

	it('keeps extra row fields, such as the key', () => {
		const rows = [{ ...planned('', '45'), key: 7 }];
		expect(applyMeasuredPours(rows, [measured(0, 3000, 45)])[0].key).toBe(7);
	});
});

describe('measuredTotalS', () => {
	const pour = (startMs: number) => ({ startMs, endMs: startMs + 1000, weight: 50 });

	it('rounds the elapsed time', () => {
		expect(measuredTotalS([pour(0)], 180_400)).toBe(180);
	});

	it('is always after the last pour starts', () => {
		expect(measuredTotalS([pour(0), pour(45_000)], 45_100)).toBe(46);
	});

	it('copes with no pours', () => {
		expect(measuredTotalS([], 0)).toBe(1);
	});
});

describe('measured brews as templates (D51)', () => {
	const entry = {
		startS: 47,
		cumulativeG: 153.5,
		bloom: false,
		plannedCumulativeG: 150,
		plannedStartS: 45,
		durationS: 3.5
	};

	it('offers the plan as placeholders, not what was measured', () => {
		expect(placeholderRowsFromEntries([entry])[0]).toMatchObject({
			defaultTime: '0:45',
			defaultScale: '150'
		});
	});

	it('offers the logged values for a pour with no plan', () => {
		const logged = { startS: 47, cumulativeG: 153.5, bloom: false };
		expect(placeholderRowsFromEntries([logged])[0]).toMatchObject({
			defaultTime: '0:47',
			defaultScale: '153.5'
		});
	});

	it('keeps the measurement when editing the brew', () => {
		expect(rowsFromEntries([entry])[0]).toMatchObject({
			time: '0:47',
			scale: '153.5',
			plannedG: '150',
			plannedStart: '45',
			duration: '3.5'
		});
	});

	it('survives a failed submit', () => {
		const [row] = rowsFromValues({
			times: ['0:47'],
			scales: ['153.5'],
			plannedGs: ['150'],
			plannedStarts: ['45'],
			durations: ['3.5']
		});
		expect(row).toMatchObject({ plannedG: '150', plannedStart: '45', duration: '3.5' });
	});
});

describe('pourTargets', () => {
	const row = (time: string, scale: string): PourRow => ({
		time,
		scale,
		bloom: false,
		defaultTime: '',
		defaultScale: ''
	});

	it('uses the typed readings, in order', () => {
		const summary = summarizePours([row('', '45'), row('0:45', '150')], '15');
		expect(pourTargets(summary)).toEqual([
			{ startS: 0, cumulativeG: 45 },
			{ startS: 45, cumulativeG: 150 }
		]);
	});

	it('uses a placeholder when nothing is typed', () => {
		const summary = summarizePours(
			[
				{ ...row('', ''), defaultScale: '50' },
				{ ...row('', ''), defaultTime: '1:00', defaultScale: '120' }
			],
			'15'
		);
		expect(pourTargets(summary)).toEqual([
			{ startS: 0, cumulativeG: 50 },
			{ startS: 60, cumulativeG: 120 }
		]);
	});

	it('leaves out rows with no reading', () => {
		const summary = summarizePours([row('', '45'), row('', ''), row('', '')], '15');
		expect(pourTargets(summary)).toEqual([{ startS: 0, cumulativeG: 45 }]);
	});

	it('is empty when pour 0 has no reading yet', () => {
		expect(pourTargets(summarizePours([row('', '')], '15'))).toEqual([]);
	});
});

/** A typed row. */
const r = (time: string, scale: string, bloom = false): PourRow => ({
	time,
	scale,
	bloom,
	defaultTime: '',
	defaultScale: ''
});
/** A blank row showing placeholders. */
const p = (defaultTime: string, defaultScale: string, bloom = false): PourRow => ({
	time: '',
	scale: '',
	bloom,
	defaultTime,
	defaultScale
});

describe('rows ⇄ entries / values', () => {
	it('formats stored entries as timer + scale readings, keeping blooms', () => {
		expect(
			rowsFromEntries([
				{ startS: 0, cumulativeG: 50, bloom: true },
				{ startS: 45, cumulativeG: 150.5, bloom: false }
			])
		).toEqual([r('0:00', '50', true), r('0:45', '150.5')]);
	});

	it('turns another brew’s entries into placeholders', () => {
		expect(
			placeholderRowsFromEntries([
				{ startS: 0, cumulativeG: 50, bloom: true },
				{ startS: 45, cumulativeG: 150, bloom: false }
			])
		).toEqual([p('0:00', '50', true), p('0:45', '150')]);
	});

	it('zips submitted arrays, padding the shorter one, and reads blooms by row id', () => {
		expect(rowsFromValues({ times: ['0:00', '0:45'], scales: ['50'] })).toEqual([
			r('0:00', '50'),
			r('0:45', '')
		]);
		expect(
			rowsFromValues({
				times: ['0:00', '', ''],
				scales: ['', '', '200'],
				timeDefaults: ['', '0:40', '1:20'],
				scaleDefaults: ['45', '150', ''],
				rowIds: ['r0', 'r1', 'r7'],
				bloom: ['r0'],
				drop: ['r1']
			})
		).toEqual([
			{ time: '0:00', scale: '', bloom: true, defaultTime: '', defaultScale: '45' },
			{ time: '', scale: '200', bloom: false, defaultTime: '1:20', defaultScale: '' }
		]);
	});
});

describe('effective values and blank rows', () => {
	it('uses the typed scale reading, else the placeholder', () => {
		expect(effectiveScale(p('0:40', '150'))).toBe('150');
		expect(effectiveScale({ ...p('0:40', '150'), scale: ' 160 ' })).toBe('160');
	});

	it('counts a placeholder row as filled, but not a time placeholder alone', () => {
		expect(isBlank(p('0:40', '150'), 1)).toBe(false);
		expect(isBlank(r('', ''), 1)).toBe(true);
		expect(isBlank(r('', ''), 0)).toBe(true);
		expect(isBlank(p('0:40', ''), 1)).toBe(true);
		expect(isBlank(r('0:40', ''), 1)).toBe(false);
	});
});

describe('withSpareRows / trimSpareRows', () => {
	it('gives an empty editor pour 0 plus spares', () => {
		expect(withSpareRows([], 1, 3)).toEqual([r('', ''), r('', ''), r('', '')]);
	});

	it('adds one blank row after the filled ones (placeholders count as filled)', () => {
		expect(withSpareRows([r('0:00', '50'), r('0:45', '150')], 1)).toHaveLength(3);
		expect(withSpareRows([p('0:00', '50'), p('0:45', '150')], 1)).toHaveLength(3);
	});

	it('does not add a spare when one already trails', () => {
		const rows = [r('0:00', '50'), r('', '')];
		expect(withSpareRows(rows, 1)).toEqual(rows);
	});

	it('never counts pour 0 as a spare', () => {
		expect(withSpareRows([r('0:00', '')], 1)).toEqual([r('0:00', ''), r('', '')]);
	});

	it('trims trailing blank rows, keeping at least `min`', () => {
		const rows = [p('0:00', '50'), p('0:45', '150'), r('', ''), r('', '')];
		expect(trimSpareRows(rows)).toEqual(rows.slice(0, 2));
		expect(trimSpareRows([r('', ''), r('', ''), r('', '')], 3)).toHaveLength(3);
		expect(trimSpareRows([r('', ''), r('', '')])).toHaveLength(1);
	});
});

describe('parseGrams', () => {
	it.each([
		['15', 15],
		['15,5', 15.5],
		[' 15.5 ', 15.5],
		['', null],
		['abc', null],
		[16, 16]
	])('%j → %j', (input, expected) => {
		expect(parseGrams(input)).toBe(expected);
	});
});

describe('summarizePours', () => {
	it('computes per-pour amounts, total and ratio, naming pours from 0', () => {
		const s = summarizePours(
			[r('0:00', '50'), r('0:45', '150'), r('1:15', '250'), r('', '')],
			'15'
		);
		expect(s.rows.map((x) => x.added)).toEqual([50, 100, 100, null]);
		expect(s.rows.map((x) => x.label)).toEqual(['Pour 0', 'Pour 1', 'Pour 2', 'Pour 3']);
		expect(s.totalG).toBe(250);
		expect(s.ratio).toBe(16.7);
		expect(s.count).toBe(3);
		expect(s.rows.some((x) => x.problem)).toBe(false);
	});

	it('counts placeholders as what will be saved (D26)', () => {
		const s = summarizePours(
			[p('0:00', '45'), p('0:40', '150'), { ...p('1:20', '256'), scale: '260' }],
			'16'
		);
		expect(s.rows.map((x) => x.added)).toEqual([45, 105, 110]);
		expect(s.rows.map((x) => [x.startS, x.scaleG])).toEqual([
			[0, 45],
			[40, 150],
			[80, 260]
		]);
		expect(s).toMatchObject({ count: 3, totalG: 260, ratio: 16.3 });
	});

	it('accepts a comma decimal dose and avoids float noise', () => {
		const s = summarizePours([r('', '50.1'), r('0:40', '150.3')], '15,5');
		expect(s.rows[1].added).toBe(100.2);
		expect(s.ratio).toBe(9.7);
	});

	it('has no total or ratio before anything is typed', () => {
		const s = summarizePours([r('', ''), r('', '')], '15');
		expect(s).toMatchObject({ totalG: null, ratio: null, count: 0 });
	});

	it('flags a scale reading that does not go up and a time that does not move on', () => {
		const s = summarizePours([r('0:00', '50'), r('0:45', '40'), r('0:30', '200')], '15');
		expect(s.rows.map((x) => x.problem)).toEqual([false, true, true]);
	});

	it('flags an unreadable time but not a half-typed row', () => {
		const s = summarizePours([r('0:00', '50'), r('1:5', '100'), r('2:00', '')], '15');
		expect(s.rows.map((x) => x.problem)).toEqual([false, true, false]);
	});

	it('suggests a start time: the placeholder, else one previous interval on', () => {
		const s = summarizePours([r('0:00', '50'), r('0:40', '150'), r('', ''), p('2:30', '')], '15');
		expect(s.rows.map((x) => x.timePlaceholder)).toEqual(['0:00', '0:45', '1:20', '2:30']);
	});

	it('times a pour with a blank time at its placeholder, as the server saves it', () => {
		// No previous brew: the times are extrapolated (0:45 apart at first, then the last interval).
		const s = summarizePours([r('0:00', '50'), r('', '150'), r('', '250'), r('', '')], '15');
		expect(s.rows.map((x) => x.startS)).toEqual([0, 45, 90, null]);
		expect(s.rows.map((x) => x.timePlaceholder)).toEqual(['0:00', '0:45', '1:30', '2:15']);
		expect(s.rows.map((x) => x.problem)).toEqual([false, false, false, false]);
		expect(s.count).toBe(3);
	});

	it('runs the estimates through blank rows, so spare rows don’t all start at once', () => {
		// What a first brew renders without JavaScript; these are the times it posts.
		const s = summarizePours(withSpareRows([], 1, 3), '15');
		expect(s.rows.map((x) => x.timePlaceholder)).toEqual(['0:00', '0:45', '1:30']);
		// A time typed out of order is flagged, and doesn't drag the next estimate back.
		const back = summarizePours(
			[r('0:00', '50'), r('1:00', '150'), r('0:30', '200'), r('', '')],
			'15'
		);
		expect(back.rows.map((x) => x.problem)).toEqual([false, false, true, false]);
		expect(back.rows[3].timePlaceholder).toBe('2:00');
	});
});

describe('errorRowIndex', () => {
	const rows = [r('0:00', '50'), r('', ''), r('0:45', '150'), r('1:10', '120')];

	it('maps "Pour n" (from 0) to the row the server kept, skipping blank rows', () => {
		expect(errorRowIndex(rows, 'Pour 2: scale reading must be higher than pour 1 (150 g).')).toBe(
			3
		);
		expect(errorRowIndex(rows, 'Pour 1 must start after pour 0.')).toBe(2);
		expect(errorRowIndex(rows, 'Pour 0: enter the scale reading in grams')).toBe(0);
		expect(errorRowIndex(rows, 'Pour 0 starts the brew, so it must start at 0:00.')).toBe(0);
	});

	it('counts placeholder rows the way the server does', () => {
		expect(errorRowIndex([r('0:00', '50'), p('0:40', '150'), r('', '90')], 'Pour 2: x')).toBe(2);
	});

	it('maps the empty-editor message to pour 0', () => {
		expect(errorRowIndex(rows, 'Add at least one pour.')).toBe(0);
	});

	it('returns null for messages about the whole list', () => {
		expect(errorRowIndex(rows, 'Total water can’t exceed 5000 g')).toBeNull();
		expect(errorRowIndex(rows, undefined)).toBeNull();
	});
});
