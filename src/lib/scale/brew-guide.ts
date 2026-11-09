/**
 * Walks a brew through its pours from the scale's readings: waits for pour 0, follows each pour to its
 * target, counts down to the next, and ends when the brewer is lifted off after the last. Pure, so
 * recorded brews can be replayed through it in tests.
 *
 * Its clock follows the scale's timer while that's moving and the time between readings when it
 * isn't, because the timer only runs in some modes. 0:00 is the first water, not when the timer
 * started: a bump can start it early.
 */
import { createPourDetector, type DetectorEvent } from './pour-detector';

export const GUIDE_TUNING = {
	/** A pour this close under its target counts as done; any amount over does too. */
	shortToleranceG: 4,
	/** The scale counts as tared once it reads within this of zero. */
	taredG: 2,
	/** Water soon after a pour ended, before the next one is due, tops up that pour. */
	topUpGapMs: 5000,
	/** Water this long before the next pour is due also tops up the last one. */
	topUpLeadMs: 10_000
};

export interface GuideTarget {
	/** When the pour is due, in seconds from the first water. */
	startS: number | null;
	/** The running total to reach (g). */
	cumulativeG: number;
}

export interface GuideReading {
	timerMs: number;
	weight: number;
	flow: number;
}

export type GuideCommand = 'startTimer' | 'stopTimer';

export type GuidePhase =
	| 'arming' // waiting for the tare to show
	| 'waiting' // for the first water
	| 'pouring'
	| 'short' // stopped too far under the target
	| 'countdown' // to the next pour
	| 'drawdown' // after the last pour
	| 'done';

/** A pour as it happened. Times are from the first water. */
export interface MeasuredPour {
	startMs: number;
	endMs: number | null;
	/** The running total when it stopped (g). */
	weight: number | null;
}

export interface GuideState {
	phase: GuidePhase;
	/** The pour on show: the one coming up during a countdown. */
	pour: number;
	/** The running total that pour aims for; null when there's no such pour. */
	target: number | null;
	weight: number;
	elapsedMs: number;
	/** Until the next pour is due, negative once it's overdue; null when it has no time. */
	countdownMs: number | null;
	pours: readonly MeasuredPour[];
}

export function createBrewGuide(
	getTargets: () => readonly GuideTarget[],
	tuning: typeof GUIDE_TUNING = GUIDE_TUNING
) {
	const detector = createPourDetector();
	const pours: MeasuredPour[] = [];
	let phase: GuidePhase = 'arming';
	let current = 0;
	let clock = 0;
	let previous: { timerMs: number; at: number } | null = null;
	let timerRunning = false;
	let weight = 0;
	/** The clock at the first water. */
	let zero: number | null = null;
	let finishedAt: number | null = null;
	let liftEnded = false;
	let lastEndAt = 0;
	/** Next was tapped during the countdown, so the next water is the next pour however early. */
	let skipWait = false;

	const fromZero = (at: number) => at - (zero ?? at);
	const dueMs = (index: number) => {
		const startS = getTargets()[index]?.startS;
		return startS == null ? null : startS * 1000;
	};

	function advanceClock(reading: GuideReading, at: number) {
		if (previous) {
			const step = reading.timerMs - previous.timerMs;
			timerRunning = step > 0;
			clock += timerRunning ? step : at - previous.at;
		}
		previous = { timerMs: reading.timerMs, at };
	}

	function afterPour() {
		phase = getTargets()[current + 1] ? 'countdown' : 'drawdown';
	}

	function isTopUp(at: number): boolean {
		const due = dueMs(current + 1);
		const started = fromZero(at);
		const soon = at - lastEndAt < tuning.topUpGapMs;
		if (due === null) return soon;
		return started < due && (soon || due - started > tuning.topUpLeadMs);
	}

	function onPourStart(atMs: number): GuideCommand[] {
		switch (phase) {
			case 'waiting':
				zero = atMs;
				pours.push({ startMs: 0, endMs: null, weight: null });
				phase = 'pouring';
				return timerRunning ? [] : ['startTimer'];
			case 'short':
			case 'drawdown':
				phase = 'pouring';
				return [];
			case 'countdown':
				if (skipWait || !isTopUp(atMs)) {
					skipWait = false;
					current++;
					pours.push({ startMs: fromZero(atMs), endMs: null, weight: null });
				}
				phase = 'pouring';
				return [];
			default:
				return [];
		}
	}

	function recordEnd(atMs: number, grams: number) {
		const pour = pours[current];
		pour.endMs = fromZero(atMs);
		pour.weight = grams;
		lastEndAt = atMs;
	}

	function finish(atMs: number): GuideCommand[] {
		finishedAt = atMs;
		phase = 'done';
		return ['stopTimer'];
	}

	function handle(event: DetectorEvent): GuideCommand[] {
		switch (event.type) {
			case 'pourStart':
				return onPourStart(event.atMs);
			case 'pourEnd': {
				if (phase !== 'pouring') return [];
				recordEnd(event.atMs, event.weight);
				const target = getTargets()[current];
				if (target && event.weight < target.cumulativeG - tuning.shortToleranceG) phase = 'short';
				else afterPour();
				return [];
			}
			case 'lifted':
				if (phase !== 'drawdown') return [];
				liftEnded = true;
				return finish(event.atMs);
			case 'returned':
				if (phase !== 'done' || !liftEnded) return [];
				liftEnded = false;
				finishedAt = null;
				phase = 'drawdown';
				return ['startTimer'];
		}
	}

	return {
		/** Takes in one reading and returns the commands to send to the scale. */
		push(reading: GuideReading, at: number): GuideCommand[] {
			advanceClock(reading, at);
			weight = reading.weight;
			if (phase === 'arming') {
				if (Math.abs(weight) > tuning.taredG) return [];
				phase = 'waiting';
			}
			return detector
				.push({ atMs: clock, weight: reading.weight, flow: reading.flow })
				.flatMap(handle);
		},

		/** The brewer moving on by hand: ends the pour, or the wait for the next one. */
		next(): GuideCommand[] {
			if (phase === 'pouring') {
				recordEnd(clock, weight);
				afterPour();
			} else if (phase === 'short') {
				afterPour();
			} else if (phase === 'countdown') {
				skipWait = true;
			}
			return [];
		},

		/** Ends the brew now. */
		stop(): GuideCommand[] {
			if (zero === null || phase === 'done') return [];
			if (phase === 'pouring') recordEnd(clock, weight);
			return finish(clock);
		},

		snapshot(): GuideState {
			const pour = phase === 'countdown' ? current + 1 : current;
			const due = dueMs(current + 1);
			let countdownMs: number | null = null;
			if (phase === 'countdown') {
				if (skipWait) countdownMs = 0;
				else if (due !== null) countdownMs = due - fromZero(clock);
			}
			const pouringOver = phase === 'drawdown' || phase === 'done';
			return {
				phase,
				pour,
				target: pouringOver ? null : (getTargets()[pour]?.cumulativeG ?? null),
				weight,
				elapsedMs: fromZero(finishedAt ?? clock),
				countdownMs,
				pours: pours.map((p) => ({ ...p }))
			};
		}
	};
}
