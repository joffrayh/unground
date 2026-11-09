import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	DETECTOR_TUNING,
	createPourDetector,
	type DetectorEvent,
	type DetectorSample,
	type DetectorTuning
} from './pour-detector';
import type { ScaleRecording } from './recording';

const STEP_MS = 100;
/** Duration (ms), weight to reach by its end, and the flow to report (a number or per reading). */
type Segment = [ms: number, weight: number, flow: number | ((i: number) => number)];

/** Readings every 100 ms, the weight moving in a straight line through each segment. */
function trace(start: number, segments: Segment[]): DetectorSample[] {
	const samples: DetectorSample[] = [{ atMs: 0, weight: start, flow: 0 }];
	let weight = start;
	for (const [ms, target, flow] of segments) {
		const steps = ms / STEP_MS;
		for (let i = 1; i <= steps; i++) {
			samples.push({
				atMs: samples.at(-1)!.atMs + STEP_MS,
				weight: weight + ((target - weight) * i) / steps,
				flow: typeof flow === 'number' ? flow : flow(i)
			});
		}
		weight = target;
	}
	return samples;
}

function run(samples: DetectorSample[], tuning?: DetectorTuning): DetectorEvent[] {
	const detector = createPourDetector(tuning);
	return samples.flatMap((s) => detector.push(s));
}

const types = (events: DetectorEvent[]) => events.map((e) => e.type);

describe('createPourDetector', () => {
	it('times a pour from the first rise to the plateau', () => {
		const events = run(
			trace(0, [
				[1000, 0, 0],
				[5000, 50, 10],
				[2000, 50, 0]
			])
		);
		expect(events).toEqual([
			{ type: 'pourStart', pour: 0, atMs: 1100, weight: 1 },
			{ type: 'pourEnd', pour: 0, atMs: 6000, weight: 50, confirmedAtMs: 6800 }
		]);
	});

	it('takes the end from the weight, not the lagging flow', () => {
		const events = run(
			trace(0, [
				[1000, 0, 0],
				[3000, 30, 10],
				[500, 30, 5],
				[2000, 30, 0]
			])
		);
		expect(events[1]).toMatchObject({ type: 'pourEnd', atMs: 4000, confirmedAtMs: 5300 });
	});

	it('ends a pour on flow that jitters around zero', () => {
		const events = run(
			trace(0, [
				[1000, 0, 0],
				[3000, 30, 10],
				[2000, 30, (i) => (i % 2 ? 0.05 : -0.05)]
			])
		);
		expect(types(events)).toEqual(['pourStart', 'pourEnd']);
	});

	it('holds a pour through a pause shorter than the quiet hold', () => {
		const events = run(
			trace(0, [
				[500, 0, 0],
				[2000, 20, 10],
				[400, 20, 0.1],
				[2000, 40, 10],
				[2000, 40, 0]
			])
		);
		expect(types(events)).toEqual(['pourStart', 'pourEnd']);
		expect(events[1]).toMatchObject({ weight: 40 });
	});

	it('numbers consecutive pours', () => {
		const events = run(
			trace(0, [
				[500, 0, 0],
				[2000, 20, 10],
				[2000, 20, 0],
				[2000, 40, 10],
				[2000, 40, 0]
			])
		);
		expect(events.map((e) => (e.type === 'pourEnd' ? e.pour : null))).toEqual([null, 0, null, 1]);
	});

	it('ignores a bump far faster than any pour', () => {
		const events = run(
			trace(0, [
				[500, 0, 0],
				[200, 80, 300],
				[300, 0, -300],
				[2000, 0, 0]
			])
		);
		expect(events).toEqual([]);
	});

	it('ignores flow that is too short to be a pour', () => {
		const events = run(
			trace(0, [
				[500, 0, 0],
				[200, 1, 5],
				[2000, 1, 0]
			])
		);
		expect(events).toEqual([]);
	});

	it('reports a lift from when the weight began to fall', () => {
		const events = run(
			trace(100, [
				[500, 100, 0],
				[300, -50, -400],
				[3000, -50, 0]
			])
		);
		expect(events).toEqual([{ type: 'lifted', atMs: 500, weight: 100 }]);
	});

	it('ignores a short time off the scale, and still finds the next pour', () => {
		const events = run(
			trace(100, [
				[500, 100, 0],
				[300, -50, -400],
				[1000, -50, 0],
				[300, 100, 400],
				[1000, 100, 0],
				[2000, 120, 10],
				[2000, 120, 0]
			])
		);
		expect(types(events)).toEqual(['pourStart', 'pourEnd']);
		expect(events[1]).toMatchObject({ weight: 120 });
	});

	it('reports a return after a lift, and carries on counting pours', () => {
		const events = run(
			trace(0, [
				[500, 0, 0],
				[2000, 20, 10],
				[2000, 20, 0],
				[300, -100, -400],
				[3000, -100, 0],
				[300, 20, 400],
				[1000, 20, 0],
				[2000, 40, 10],
				[2000, 40, 0]
			])
		);
		expect(types(events)).toEqual([
			'pourStart',
			'pourEnd',
			'lifted',
			'returned',
			'pourStart',
			'pourEnd'
		]);
		expect(events[4]).toMatchObject({ pour: 1 });
	});

	it('ends a pour at its peak if the brewer is lifted mid-pour', () => {
		const events = run(
			trace(0, [
				[500, 0, 0],
				[2000, 40, 10],
				[300, -100, -300],
				[3000, -100, 0]
			])
		);
		expect(events[1]).toEqual({
			type: 'pourEnd',
			pour: 0,
			atMs: 2500,
			weight: 40,
			confirmedAtMs: 2600
		});
		expect(events[2]).toEqual({ type: 'lifted', atMs: 2500, weight: 40 });
	});

	it('uses the tuning it is given', () => {
		const samples = trace(0, [
			[1000, 0, 0],
			[3000, 30, 10],
			[3000, 30, 0]
		]);
		const events = run(samples, { ...DETECTOR_TUNING, quietHoldMs: 1500 });
		expect(events[1]).toMatchObject({ confirmedAtMs: 5600 });
	});
});

describe('recorded brews', () => {
	/** Read off each recording's weight trace by hand. */
	const BREWS: {
		file: string;
		pours: [startMs: number, endMs: number, grams: number][];
		liftedMs: number;
	}[] = [
		{
			// Fast pours, then picked up twice (a swirl and a knock) before the final lift.
			file: 'sawtooth-disturbed.json',
			pours: [
				[2850, 5160, 42.9],
				[7470, 10200, 86.4],
				[13020, 15630, 129.1],
				[18570, 20670, 166.8]
			],
			liftedMs: 31740
		},
		{
			// A bump just before the first pour; the third pour is stopped and topped up a second later.
			file: 'sawtooth-recipe.json',
			pours: [
				[2410, 6460, 48.9],
				[18130, 21460, 92.6],
				[32320, 36460, 151.5],
				[38170, 38980, 157.1],
				[48340, 52270, 202.1]
			],
			liftedMs: 57010
		},
		{
			file: 'smoothing-lift.json',
			pours: [[1870, 10120, 122.2]],
			liftedMs: 13150
		}
	];

	const TIME_TOLERANCE_MS = 150;
	const WEIGHT_TOLERANCE_G = 0.2;
	const within = (actual: number, expected: number, tolerance: number) =>
		expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

	it.each(BREWS)('$file', ({ file, pours, liftedMs }) => {
		const path = fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url));
		const recording = JSON.parse(readFileSync(path, 'utf8')) as ScaleRecording;
		const events = run(recording.samples.map(([atMs, , weight, flow]) => ({ atMs, weight, flow })));

		expect(types(events)).toEqual([...pours.flatMap(() => ['pourStart', 'pourEnd']), 'lifted']);
		pours.forEach(([startMs, endMs, grams], i) => {
			const start = events[i * 2];
			const end = events[i * 2 + 1];
			within(start.atMs, startMs, TIME_TOLERANCE_MS);
			within(end.atMs, endMs, TIME_TOLERANCE_MS);
			within(end.weight, grams, WEIGHT_TOLERANCE_G);
		});
		within(events.at(-1)!.atMs, liftedMs, TIME_TOLERANCE_MS);
	});
});
