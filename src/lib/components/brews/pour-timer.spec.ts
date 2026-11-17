import { describe, expect, it } from 'vitest';
import {
	IDLE_CLOCK,
	currentPour,
	nextPour,
	timerCue,
	timerElapsedMs,
	timerPhase,
	timerResume,
	timerStart,
	timerStop
} from './pour-timer.ts';

describe('pour timer', () => {
	it('stops in whole seconds from Start, after the last pour', () => {
		const clock = timerStart(1000);
		expect(timerPhase(clock)).toBe('running');
		const done = timerStop(clock, 1000 + 185_400, 90);
		expect(done.totalS).toBe(185);
		expect(timerPhase(done)).toBe('done');
		expect(timerStop(clock, 1000 + 30_000, 90).totalS).toBe(91);
	});

	it('ignores Stop outside a running brew, and resumes after it', () => {
		expect(timerStop(IDLE_CLOCK, 5000)).toBe(IDLE_CLOCK);
		const done = timerStop(timerStart(0), 60_000);
		expect(timerStop(done, 70_000)).toBe(done);
		expect(timerPhase(timerResume(done))).toBe('running');
		expect(timerResume(IDLE_CLOCK)).toBe(IDLE_CLOCK);
	});

	it('runs the clock from Start and stops it at the end', () => {
		expect(timerElapsedMs(IDLE_CLOCK, 9000)).toBe(0);
		const clock = timerStart(1000);
		expect(timerElapsedMs(clock, 4500)).toBe(3500);
		expect(timerElapsedMs(clock, 500)).toBe(0);
		expect(timerElapsedMs(timerStop(clock, 61_000), 99_000)).toBe(60_000);
	});

	it('follows the pour times, skipping pours without one', () => {
		const starts = [0, 45, null, 120];
		expect(currentPour(starts, 0)).toBe(0);
		expect(nextPour(starts, 0)).toBe(1);
		expect(currentPour(starts, 45_000)).toBe(1);
		expect(nextPour(starts, 45_000)).toBe(3);
		expect(currentPour(starts, 200_000)).toBe(3);
		expect(nextPour(starts, 200_000)).toBeNull();
	});

	it('beeps for the last three seconds, then cues the pour once', () => {
		const starts = [0, 10];
		const at = [0, 6_000, 7_100, 7_300, 8_100, 9_100, 10_000, 10_250, 11_000];
		const cues = at.map((ms, i) => (i === 0 ? null : timerCue(starts, at[i - 1], ms)));
		expect(cues).toEqual([null, null, 'tick', null, 'tick', 'tick', 'go', null, null]);
		expect(timerCue(starts, 5_000, 5_000)).toBeNull();
		expect(timerCue([0], 0, 5_000)).toBeNull();
	});
});
