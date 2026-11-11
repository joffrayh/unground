/**
 * Tap to pour (D53): the brewer taps when the brew starts, when each later pour starts and when the
 * drawdown ends. Pure and immutable, so undo is just the previous log.
 *
 * Times are whole seconds from the first tap. Each pour starts after the one before, and the end comes
 * after the last pour, as the form requires.
 */

export interface TapLog {
	/** `performance.now()` at the first tap; null before it. */
	startedAt: number | null;
	/** Each pour's start (s); pour 0 is always 0. */
	starts: readonly number[];
	/** Total time (s) once the drawdown has ended. */
	totalS: number | null;
}

export type TapPhase = 'idle' | 'running' | 'done';

export const IDLE_TAPS: TapLog = { startedAt: null, starts: [], totalS: null };

export function tapPhase(log: TapLog): TapPhase {
	if (log.startedAt === null) return 'idle';
	return log.totalS === null ? 'running' : 'done';
}

/** Seconds since the first tap, never earlier than `after` + 1. */
function secondsAt(log: TapLog, at: number, after: number): number {
	return Math.max(Math.round((at - (log.startedAt ?? at)) / 1000), after + 1);
}

export function tapStart(at: number): TapLog {
	return { startedAt: at, starts: [0], totalS: null };
}

/** The next pour starts now. */
export function tapPour(log: TapLog, at: number): TapLog {
	if (tapPhase(log) !== 'running') return log;
	return { ...log, starts: [...log.starts, secondsAt(log, at, log.starts.at(-1) ?? 0)] };
}

/** The drawdown has ended. */
export function tapEnd(log: TapLog, at: number): TapLog {
	if (tapPhase(log) !== 'running') return log;
	return { ...log, totalS: secondsAt(log, at, log.starts.at(-1) ?? 0) };
}

/** Takes back the last tap: the end, else the latest pour, else the start. */
export function tapUndo(log: TapLog): TapLog {
	if (log.totalS !== null) return { ...log, totalS: null };
	if (log.starts.length > 1) return { ...log, starts: log.starts.slice(0, -1) };
	return IDLE_TAPS;
}

/** A beep in the last seconds before the next pour, and the cue to pour. */
export type TapCue = 'tick' | 'go';

/** Beeps start this many seconds before a pour. */
export const TICK_FROM_S = 3;

/**
 * The cue as the countdown moves from `before` to `left` whole seconds to go (rounded up, as shown).
 * Null when there's no countdown, or `before` is null when a new pour has just started.
 */
export function countdownCue(before: number | null, left: number | null): TapCue | null {
	if (left === null || left === before) return null;
	if (left <= 0) return before === null || before > 0 ? 'go' : null;
	return left <= TICK_FROM_S ? 'tick' : null;
}

/** The clock: running from the first tap, stopped at the end. */
export function tapElapsedMs(log: TapLog, now: number): number {
	if (log.startedAt === null) return 0;
	if (log.totalS !== null) return log.totalS * 1000;
	return Math.max(0, now - log.startedAt);
}
