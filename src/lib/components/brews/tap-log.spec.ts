import { describe, expect, it } from 'vitest';
import {
	IDLE_TAPS,
	countdownCue,
	tapElapsedMs,
	tapEnd,
	tapPhase,
	tapPour,
	tapStart,
	tapUndo
} from './tap-log.ts';

describe('tap log', () => {
	it('records each pour start and the end in whole seconds from the first tap', () => {
		let log = tapStart(1000);
		log = tapPour(log, 1000 + 44_600);
		log = tapPour(log, 1000 + 90_200);
		log = tapEnd(log, 1000 + 185_000);
		expect(log.starts).toEqual([0, 45, 90]);
		expect(log.totalS).toBe(185);
		expect(tapPhase(log)).toBe('done');
	});

	it('keeps each tap at least a second after the one before', () => {
		let log = tapStart(0);
		log = tapPour(log, 200);
		log = tapPour(log, 400);
		log = tapEnd(log, 600);
		expect(log.starts).toEqual([0, 1, 2]);
		expect(log.totalS).toBe(3);
	});

	it('ignores pours and ends outside a running brew', () => {
		expect(tapPour(IDLE_TAPS, 5000)).toBe(IDLE_TAPS);
		expect(tapEnd(IDLE_TAPS, 5000)).toBe(IDLE_TAPS);
		const done = tapEnd(tapStart(0), 60_000);
		expect(tapPour(done, 70_000)).toBe(done);
		expect(tapEnd(done, 70_000)).toBe(done);
	});

	it('undoes the end, then the pours, then the start', () => {
		let log = tapEnd(tapPour(tapStart(0), 30_000), 120_000);
		log = tapUndo(log);
		expect(log).toMatchObject({ starts: [0, 30], totalS: null });
		expect(tapPhase(log)).toBe('running');
		log = tapUndo(log);
		expect(log.starts).toEqual([0]);
		expect(tapUndo(log)).toBe(IDLE_TAPS);
		expect(tapUndo(IDLE_TAPS)).toBe(IDLE_TAPS);
	});

	it('beeps for the last three seconds, then cues the pour once', () => {
		const cues = [10, 4, 3, 3, 2, 1, 0, -1, -2].map((left, i, all) =>
			countdownCue(i === 0 ? null : all[i - 1], left)
		);
		expect(cues).toEqual([null, null, 'tick', null, 'tick', 'tick', 'go', null, null]);
		// A pour that's already due when the one before starts is cued at once.
		expect(countdownCue(null, -5)).toBe('go');
		expect(countdownCue(null, 2)).toBe('tick');
		expect(countdownCue(5, null)).toBeNull();
	});

	it('runs the clock from the first tap and stops it at the end', () => {
		expect(tapElapsedMs(IDLE_TAPS, 9000)).toBe(0);
		const log = tapStart(1000);
		expect(tapElapsedMs(log, 4500)).toBe(3500);
		expect(tapElapsedMs(log, 500)).toBe(0);
		expect(tapElapsedMs(tapEnd(log, 61_000), 99_000)).toBe(60_000);
	});
});
