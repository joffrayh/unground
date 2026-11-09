/**
 * Finds pours in a scale's readings: when each starts and stops, how much was poured, and when the
 * brewer is lifted off the scale. Pure, so recorded brews can be replayed through it in tests.
 *
 * It only reports what physically happened. Whether a pour reached its target, or was a top-up of the
 * one before, depends on the recipe and is decided by whatever uses it. Create one after taring.
 */

export interface DetectorSample {
	/** Milliseconds on any steady clock. */
	atMs: number;
	weight: number;
	/** Per second. */
	flow: number;
}

export type DetectorEvent =
	| { type: 'pourStart'; pour: number; atMs: number; weight: number }
	| { type: 'pourEnd'; pour: number; atMs: number; weight: number; confirmedAtMs: number }
	| { type: 'lifted'; atMs: number; weight: number }
	| { type: 'returned'; atMs: number; weight: number };

/** Measured from recorded brews (see `pour-detector.spec.ts`). Everything to tune is here. */
export const DETECTOR_TUNING = {
	/** A pour starts when flow stays above this. */
	startFlow: 2,
	/** Faster than any pour; the highest recorded was 30 g/s, and bumps reach hundreds. */
	maxPourFlow: 60,
	startHoldMs: 300,
	/** Flow settles within ±0.05 at rest but never stays at exactly 0, so zero can't be the test. */
	quietFlow: 0.5,
	quietHoldMs: 700,
	/** Weight this close to the final weight counts as having reached it. */
	plateauToleranceG: 0.15,
	/** A fall this large means something came off the scale, rather than noise. */
	awayDropG: 30,
	/** Longer than a recorded swirl (about 2 s away from the scale). */
	liftHoldMs: 2200,
	settleMs: 500,
	settleRangeG: 0.3,
	historyMs: 3000
};

export type DetectorTuning = typeof DETECTOR_TUNING;

type Phase = 'idle' | 'pouring' | 'away' | 'settling';

export function createPourDetector(tuning: DetectorTuning = DETECTOR_TUNING) {
	const history: DetectorSample[] = [];
	let phase: Phase = 'idle';
	let rest: number | null = null;
	let pours = 0;
	let risingSince: number | null = null;
	let quietSince: number | null = null;
	let peak = 0;
	let awayFromMs = 0;
	let awayWeight = 0;
	let lifted = false;

	/** Flow lags, so the time comes from the weight: the first reading of the final plateau. */
	function plateauStart(final: number): number {
		const reached = (s: DetectorSample) => s.weight >= final - tuning.plateauToleranceG;
		let i = history.findLastIndex(reached);
		while (i > 0 && reached(history[i - 1])) i--;
		return history[Math.max(i, 0)].atMs;
	}

	/** The first reading above the low point before the weight began to climb. */
	function riseStart(fromMs: number): DetectorSample {
		let i = history.findIndex((s) => s.atMs === fromMs);
		while (i > 0 && history[i - 1].weight < history[i].weight) i--;
		return history[Math.min(i + 1, history.length - 1)];
	}

	/** The last reading before the weight began to fall. */
	function fallStart(): number {
		let i = history.length - 1;
		while (i > 0 && history[i - 1].weight > history[i].weight) i--;
		return history[i].atMs;
	}

	function leave(reference: number) {
		awayFromMs = fallStart();
		awayWeight = reference;
		lifted = false;
		phase = 'away';
	}

	function endPour(final: number, confirmedAtMs: number): DetectorEvent {
		return {
			type: 'pourEnd',
			pour: pours - 1,
			atMs: plateauStart(final),
			weight: final,
			confirmedAtMs
		};
	}

	function idle(s: DetectorSample, base: number): DetectorEvent[] {
		if (s.weight < base - tuning.awayDropG) {
			leave(base);
			return [];
		}
		if (s.flow > tuning.startFlow && s.flow < tuning.maxPourFlow && s.weight > base) {
			risingSince ??= s.atMs;
			if (s.atMs - risingSince < tuning.startHoldMs) return [];
			const start = riseStart(risingSince);
			risingSince = null;
			quietSince = null;
			peak = s.weight;
			phase = 'pouring';
			return [{ type: 'pourStart', pour: pours++, atMs: start.atMs, weight: start.weight }];
		}
		risingSince = null;
		if (Math.abs(s.flow) < tuning.quietFlow) rest = s.weight;
		return [];
	}

	function pouring(s: DetectorSample): DetectorEvent[] {
		peak = Math.max(peak, s.weight);
		if (s.weight < peak - tuning.awayDropG) {
			const end = endPour(peak, s.atMs);
			leave(peak);
			return [end];
		}
		if (Math.abs(s.flow) >= tuning.quietFlow) {
			quietSince = null;
			return [];
		}
		quietSince ??= s.atMs;
		if (s.atMs - quietSince < tuning.quietHoldMs) return [];
		rest = s.weight;
		phase = 'idle';
		return [endPour(s.weight, s.atMs)];
	}

	function away(s: DetectorSample): DetectorEvent[] {
		if (s.weight >= awayWeight - tuning.awayDropG) {
			phase = 'settling';
			return lifted ? [{ type: 'returned', atMs: s.atMs, weight: s.weight }] : [];
		}
		if (lifted || s.atMs - awayFromMs < tuning.liftHoldMs) return [];
		lifted = true;
		return [{ type: 'lifted', atMs: awayFromMs, weight: awayWeight }];
	}

	function settling(s: DetectorSample) {
		const window = history.filter((h) => s.atMs - h.atMs <= tuning.settleMs);
		const weights = window.map((h) => h.weight);
		const covered = s.atMs - window[0].atMs >= tuning.settleMs * 0.8;
		if (covered && Math.max(...weights) - Math.min(...weights) <= tuning.settleRangeG) {
			rest = s.weight;
			phase = 'idle';
		}
	}

	return {
		/** Takes in one reading and returns what it completed. */
		push(sample: DetectorSample): DetectorEvent[] {
			history.push(sample);
			while (sample.atMs - history[0].atMs > tuning.historyMs) history.shift();
			rest ??= sample.weight;
			switch (phase) {
				case 'idle':
					return idle(sample, rest);
				case 'pouring':
					return pouring(sample);
				case 'away':
					return away(sample);
				case 'settling':
					settling(sample);
					return [];
			}
		}
	};
}
