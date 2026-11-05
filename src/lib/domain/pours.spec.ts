import { describe, expect, it } from 'vitest';
import { entriesToPours, formatDuration, parseDuration, poursToEntries, totalWater } from './pours';

describe('parseDuration', () => {
	it.each([
		['0:00', 0],
		['0:45', 45],
		['1:30', 90],
		['12:05', 725],
		['90', 90],
		[' 2:00 ', 120]
	])('parses %j as %i s', (input, expected) => {
		expect(parseDuration(input)).toBe(expected);
	});

	it.each(['', '1:60', '1:5', 'abc', '-5', '1.5', '1:30:00'])('rejects %j', (input) => {
		expect(parseDuration(input)).toBeNull();
	});

	it('round-trips with formatDuration', () => {
		for (const s of [0, 5, 59, 60, 61, 195, 3599]) expect(parseDuration(formatDuration(s))).toBe(s);
	});
});

describe('entriesToPours', () => {
	it('converts timer + running scale readings to per-pour volume and interval', () => {
		const result = entriesToPours([
			{ startS: 0, cumulativeG: 50, bloom: false },
			{ startS: 45, cumulativeG: 150, bloom: false },
			{ startS: 75, cumulativeG: 250, bloom: false }
		]);
		expect(result).toEqual({
			ok: true,
			pours: [
				{ volumeG: 50, intervalS: 0, bloom: false },
				{ volumeG: 100, intervalS: 45, bloom: false },
				{ volumeG: 100, intervalS: 30, bloom: false }
			]
		});
	});

	it('avoids float noise in volumes', () => {
		const result = entriesToPours([
			{ startS: 0, cumulativeG: 40.1, bloom: false },
			{ startS: 30, cumulativeG: 100.3, bloom: false }
		]);
		expect(result.ok && result.pours[1].volumeG).toBe(60.2);
	});

	it('requires pour 0 to start at 0:00', () => {
		expect(entriesToPours([{ startS: 10, cumulativeG: 50, bloom: false }])).toEqual({
			ok: false,
			error: 'Pour 0 starts the brew, so it must start at 0:00.'
		});
	});

	it('keeps each pour’s bloom flag and names pours from 0 in errors', () => {
		const result = entriesToPours([
			{ startS: 0, cumulativeG: 40, bloom: true },
			{ startS: 30, cumulativeG: 80, bloom: true },
			{ startS: 75, cumulativeG: 250, bloom: false }
		]);
		expect(result.ok && result.pours.map((p) => p.bloom)).toEqual([true, true, false]);
		expect(
			entriesToPours([
				{ startS: 0, cumulativeG: 50, bloom: true },
				{ startS: 30, cumulativeG: 40, bloom: false }
			])
		).toEqual({ ok: false, error: 'Pour 1: scale reading must be higher than pour 0 (50 g).' });
	});

	it('rejects an empty pour list', () => {
		expect(entriesToPours([]).ok).toBe(false);
	});

	it('rejects non-increasing times and scale readings', () => {
		expect(
			entriesToPours([
				{ startS: 0, cumulativeG: 50, bloom: false },
				{ startS: 0, cumulativeG: 100, bloom: false }
			]).ok
		).toBe(false);
		expect(
			entriesToPours([
				{ startS: 0, cumulativeG: 50, bloom: false },
				{ startS: 30, cumulativeG: 50, bloom: false }
			]).ok
		).toBe(false);
	});

	it('is the inverse of poursToEntries', () => {
		const entries = [
			{ startS: 0, cumulativeG: 45, bloom: true },
			{ startS: 40, cumulativeG: 120.5, bloom: false },
			{ startS: 70, cumulativeG: 250, bloom: false }
		];
		const result = entriesToPours(entries);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(poursToEntries(result.pours)).toEqual(entries);
			expect(totalWater(result.pours)).toBe(250);
		}
	});
});
