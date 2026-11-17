/**
 * Pour timer (D62): Start at the first water, Stop at the end of the drawdown. In between the clock
 * runs against the pour times already in the rows and cues each pour as it comes due. Pure and
 * immutable, so undo is just the previous state.
 *
 * Times are whole seconds from Start; the end comes after the last pour, as the form requires.
 */

export interface PourClock {
	/** `performance.now()` at Start; null before it. */
	startedAt: number | null;
	/** Total time (s) once the drawdown has ended. */
	totalS: number | null;
}

export type TimerPhase = 'idle' | 'running' | 'done';

export const IDLE_CLOCK: PourClock = { startedAt: null, totalS: null };

export function timerPhase(clock: PourClock): TimerPhase {
	if (clock.startedAt === null) return 'idle';
	return clock.totalS === null ? 'running' : 'done';
}

export function timerStart(at: number): PourClock {
	return { startedAt: at, totalS: null };
}

/** The drawdown has ended, at least a second after `afterS` (the last pour's start). */
export function timerStop(clock: PourClock, at: number, afterS = 0): PourClock {
	if (timerPhase(clock) !== 'running') return clock;
	const s = Math.round((at - (clock.startedAt ?? at)) / 1000);
	return { ...clock, totalS: Math.max(s, afterS + 1) };
}

/** Takes back Stop: the clock runs on. */
export function timerResume(clock: PourClock): PourClock {
	return clock.totalS === null ? clock : { ...clock, totalS: null };
}

/** The clock: running from Start, stopped at the end. */
export function timerElapsedMs(clock: PourClock, now: number): number {
	if (clock.startedAt === null) return 0;
	if (clock.totalS !== null) return clock.totalS * 1000;
	return Math.max(0, now - clock.startedAt);
}

/** The pour under way at `ms`: the last whose start has come. Pour 0 starts the brew. */
export function currentPour(starts: readonly (number | null)[], ms: number): number {
	let current = 0;
	starts.forEach((s, i) => {
		if (i > 0 && s !== null && s * 1000 <= ms) current = i;
	});
	return current;
}

/** The next pour still to come after `ms`, or null when the last has started. */
export function nextPour(starts: readonly (number | null)[], ms: number): number | null {
	const i = starts.findIndex((s, j) => j > 0 && s !== null && s * 1000 > ms);
	return i < 0 ? null : i;
}

/** A beep in the last seconds before a pour, and the cue to pour. */
export type TimerCue = 'tick' | 'go';

/** Beeps start this many seconds before a pour. */
export const TICK_FROM_S = 3;

/**
 * The cue as the clock moves from `beforeMs` to `nowMs`: 'go' when a pour came due in between, 'tick'
 * when the countdown to the next one (rounded up, as shown) reached one of its last seconds.
 */
export function timerCue(
	starts: readonly (number | null)[],
	beforeMs: number,
	nowMs: number
): TimerCue | null {
	if (nowMs <= beforeMs) return null;
	if (starts.some((s, i) => i > 0 && s !== null && s * 1000 > beforeMs && s * 1000 <= nowMs)) {
		return 'go';
	}
	const next = nextPour(starts, nowMs);
	if (next === null) return null;
	const dueMs = (starts[next] ?? 0) * 1000;
	const left = Math.ceil((dueMs - nowMs) / 1000);
	const was = Math.ceil((dueMs - beforeMs) / 1000);
	return left <= TICK_FROM_S && left < was ? 'tick' : null;
}
