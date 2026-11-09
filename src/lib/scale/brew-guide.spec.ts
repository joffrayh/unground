import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createBrewGuide, type GuideCommand, type GuideTarget } from './brew-guide';
import type { ScaleRecording } from './recording';

const STEP_MS = 100;

/** Plays readings every 100 ms into a guide. */
function brew(targets: GuideTarget[], { timer = false } = {}) {
	const guide = createBrewGuide(() => targets);
	const commands: GuideCommand[] = [];
	let at = 0;
	let weight = 0;
	const read = (grams: number, flow: number) => {
		at += STEP_MS;
		weight = grams;
		commands.push(...guide.push({ timerMs: timer ? at : 0, weight: grams, flow }, at));
	};
	const api = {
		guide,
		commands,
		read,
		rest(ms = 1000) {
			for (let i = 0; i < ms / STEP_MS; i++) read(weight, 0);
			return api;
		},
		pour(to: number, ms = 3000) {
			const from = weight;
			const steps = ms / STEP_MS;
			for (let i = 1; i <= steps; i++) read(from + ((to - from) * i) / steps, 10);
			return api;
		},
		lift(ms = 3000) {
			read(-200, -400);
			return api.rest(ms);
		},
		putBack(grams: number) {
			read(grams, 400);
			return api.rest();
		},
		get state() {
			return guide.snapshot();
		}
	};
	return api;
}

const TWO_POURS: GuideTarget[] = [
	{ startS: 0, cumulativeG: 45 },
	{ startS: 45, cumulativeG: 150 }
];

describe('createBrewGuide', () => {
	describe('before the first water', () => {
		it('waits for the tare to show', () => {
			const b = brew(TWO_POURS);
			b.read(300, 0);
			expect(b.state.phase).toBe('arming');
			b.read(0.1, 0);
			expect(b.state.phase).toBe('waiting');
		});

		it('still detects a pour after a tare from a heavy reading', () => {
			const b = brew(TWO_POURS);
			b.read(350, 0);
			b.read(350, 0);
			b.read(0, -500);
			b.rest().pour(45).rest();
			expect(b.state.phase).toBe('countdown');
		});

		it('shows pour 0 and its target, with the clock at zero', () => {
			const b = brew(TWO_POURS).rest(500);
			expect(b.state).toMatchObject({ phase: 'waiting', pour: 0, target: 45, elapsedMs: 0 });
		});
	});

	describe('the clock', () => {
		it('starts at the first water, not at the first reading', () => {
			const b = brew(TWO_POURS).rest(2000).pour(45).rest(1000);
			expect(b.state.pours[0].startMs).toBe(0);
			// Started at 2.1 s, now 6 s.
			expect(b.state.elapsedMs).toBe(3900);
		});

		it('follows the scale timer while it moves', () => {
			const b = brew(TWO_POURS, { timer: true }).rest(500);
			b.pour(45);
			const before = b.state.elapsedMs;
			// Readings arrive late, but the timer says 100 ms passed.
			b.guide.push({ timerMs: 3700, weight: 45, flow: 0 }, 9000);
			expect(b.state.elapsedMs).toBe(before + 200);
		});

		it('uses the time between readings when the timer has stopped', () => {
			const b = brew(TWO_POURS).rest(500);
			b.pour(45);
			const before = b.state.elapsedMs;
			b.guide.push({ timerMs: 0, weight: 45, flow: 0 }, 5500);
			expect(b.state.elapsedMs).toBe(before + 2000);
		});
	});

	describe('the scale timer', () => {
		it('is started at the first water when it is not running', () => {
			const b = brew(TWO_POURS).rest(500).pour(45);
			expect(b.commands).toEqual(['startTimer']);
		});

		it('is left alone when it is already running', () => {
			const b = brew(TWO_POURS, { timer: true }).rest(500).pour(45);
			expect(b.commands).toEqual([]);
		});

		it('is stopped at the end', () => {
			const b = brew([{ startS: 0, cumulativeG: 45 }])
				.rest()
				.pour(45)
				.rest()
				.lift();
			expect(b.commands).toEqual(['startTimer', 'stopTimer']);
		});
	});

	describe('reaching a target', () => {
		it.each([
			['exactly on it', 45],
			['just inside the tolerance', 41],
			['over it', 60]
		])('moves on when %s', (_name, grams) => {
			const b = brew(TWO_POURS).rest().pour(grams).rest();
			expect(b.state.phase).toBe('countdown');
		});

		it('waits when stopped too far under', () => {
			const b = brew(TWO_POURS).rest().pour(40).rest();
			expect(b.state).toMatchObject({ phase: 'short', pour: 0, target: 45 });
		});

		it('moves on once topped up, as the same pour', () => {
			const b = brew(TWO_POURS).rest().pour(40).rest().pour(44).rest();
			expect(b.state.phase).toBe('countdown');
			expect(b.state.pours).toHaveLength(1);
			expect(b.state.pours[0].weight).toBe(44);
		});

		it('keeps the running targets after an over-pour', () => {
			const b = brew(TWO_POURS).rest().pour(60).rest();
			expect(b.state.target).toBe(150);
		});
	});

	describe('the countdown', () => {
		it('shows the next pour and the time until it is due', () => {
			const b = brew(TWO_POURS).rest().pour(45).rest();
			expect(b.state).toMatchObject({ phase: 'countdown', pour: 1, target: 150, weight: 45 });
			expect(b.state.countdownMs).toBe(45_000 - b.state.elapsedMs);
		});

		it('goes negative once overdue', () => {
			const b = brew(TWO_POURS).rest().pour(45).rest(46_000);
			expect(b.state.countdownMs).toBeLessThan(0);
		});

		it('has no time for a pour with none', () => {
			const b = brew([TWO_POURS[0], { startS: null, cumulativeG: 150 }])
				.rest()
				.pour(45)
				.rest();
			expect(b.state.countdownMs).toBeNull();
		});

		it('starts the next pour at its time', () => {
			const b = brew(TWO_POURS).rest().pour(45).rest(42_000).pour(150).rest();
			expect(b.state.phase).toBe('drawdown');
			expect(b.state.pours).toHaveLength(2);
		});

		it('takes a pour started a little early as the next pour', () => {
			const b = brew(TWO_POURS).rest().pour(45).rest(38_000).pour(150).rest();
			expect(b.state.pours).toHaveLength(2);
		});

		it('treats water straight after a pour as a top-up', () => {
			const b = brew(TWO_POURS).rest().pour(45).rest(1500).pour(50).rest();
			expect(b.state.phase).toBe('countdown');
			expect(b.state.pours).toHaveLength(1);
			expect(b.state.pours[0].weight).toBe(50);
		});

		it('treats water long before the next pour as a top-up', () => {
			const b = brew(TWO_POURS).rest().pour(45).rest(15_000).pour(50).rest();
			expect(b.state.pours).toHaveLength(1);
		});

		it('never treats overdue water as a top-up, however soon', () => {
			const b = brew([TWO_POURS[0], { startS: 4, cumulativeG: 150 }])
				.rest()
				.pour(45)
				.rest(1500)
				.pour(150)
				.rest();
			expect(b.state.pours).toHaveLength(2);
		});
	});

	describe('ending the brew', () => {
		const ONE: GuideTarget[] = [{ startS: 0, cumulativeG: 45 }];

		it('goes to drawdown after the last pour', () => {
			const b = brew(ONE).rest().pour(45).rest();
			expect(b.state).toMatchObject({ phase: 'drawdown', target: null });
		});

		it('ends when lifted after the last pour, at the moment it was lifted', () => {
			const b = brew(ONE).rest().pour(45).rest(5000).lift();
			expect(b.state.phase).toBe('done');
			// Water at 1.1 s; last reading before the fall at 9.0 s.
			expect(b.state.elapsedMs).toBe(7900);
		});

		it('ignores a lift before the last pour', () => {
			const b = brew(TWO_POURS).rest().pour(45).rest().lift();
			expect(b.state.phase).toBe('countdown');
		});

		it('ignores a short lift, such as a swirl', () => {
			const b = brew(ONE).rest().pour(45).rest().lift(1000).putBack(45);
			expect(b.state.phase).toBe('drawdown');
		});

		it('undoes the end when put back, and restarts the scale timer', () => {
			const b = brew(ONE).rest().pour(45).rest().lift();
			expect(b.state.phase).toBe('done');
			b.putBack(45);
			expect(b.state.phase).toBe('drawdown');
			expect(b.commands.at(-1)).toBe('startTimer');
		});
	});

	describe('by hand', () => {
		it('Next accepts a short pour', () => {
			const b = brew(TWO_POURS).rest().pour(30).rest();
			b.guide.next();
			expect(b.state).toMatchObject({ phase: 'countdown', pour: 1 });
			expect(b.state.pours[0].weight).toBe(30);
		});

		it('Next ends a pour still running', () => {
			const b = brew(TWO_POURS).rest().pour(30);
			b.guide.next();
			expect(b.state.phase).toBe('countdown');
			expect(b.state.pours[0].weight).toBe(30);
		});

		it('Next during the countdown makes the next water the next pour', () => {
			const b = brew(TWO_POURS).rest().pour(45).rest();
			b.guide.next();
			expect(b.state.countdownMs).toBe(0);
			b.pour(150).rest();
			expect(b.state.pours).toHaveLength(2);
		});

		it('Next ignores the pour end that follows', () => {
			const b = brew(TWO_POURS).rest().pour(30);
			b.guide.next();
			b.rest();
			expect(b.state.pours[0].weight).toBe(30);
			expect(b.state.phase).toBe('countdown');
		});

		it('Next does nothing before the first water', () => {
			const b = brew(TWO_POURS).rest();
			b.guide.next();
			expect(b.state.phase).toBe('waiting');
		});

		it('Stop ends the brew at once, closing a running pour', () => {
			const b = brew(TWO_POURS).rest().pour(30);
			expect(b.guide.stop()).toEqual(['stopTimer']);
			expect(b.state.phase).toBe('done');
			expect(b.state.pours[0].weight).toBe(30);
		});

		it('Stop does nothing before the first water or twice', () => {
			const b = brew(TWO_POURS).rest();
			expect(b.guide.stop()).toEqual([]);
			b.pour(30);
			b.guide.stop();
			expect(b.guide.stop()).toEqual([]);
		});

		it('a put-back does not undo a Stop', () => {
			const b = brew(TWO_POURS).rest().pour(45).rest();
			b.guide.stop();
			b.lift().putBack(45);
			expect(b.state.phase).toBe('done');
		});
	});

	it('uses the targets as they are now', () => {
		const targets = [...TWO_POURS];
		const guide = createBrewGuide(() => targets);
		guide.push({ timerMs: 0, weight: 0, flow: 0 }, 0);
		targets[0] = { startS: 0, cumulativeG: 60 };
		expect(guide.snapshot().target).toBe(60);
	});
});

describe('recorded brews', () => {
	function replay(file: string, targets: GuideTarget[]) {
		const path = fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url));
		const recording = JSON.parse(readFileSync(path, 'utf8')) as ScaleRecording;
		const guide = createBrewGuide(() => targets);
		const commands = recording.samples.flatMap(([at, timerMs, weight, flow]) =>
			guide.push({ timerMs, weight, flow }, at)
		);
		return { state: guide.snapshot(), commands };
	}

	/** Read off each recording's weight trace by hand, relative to its first water. */
	function expectPours(
		pours: readonly { startMs: number; endMs: number | null; weight: number | null }[],
		expected: [startMs: number, endMs: number, grams: number][]
	) {
		expect(pours).toHaveLength(expected.length);
		expected.forEach(([startMs, endMs, grams], i) => {
			expect(Math.abs(pours[i].startMs - startMs)).toBeLessThanOrEqual(400);
			expect(Math.abs(pours[i].endMs! - endMs)).toBeLessThanOrEqual(400);
			expect(Math.abs(pours[i].weight! - grams)).toBeLessThanOrEqual(0.2);
		});
	}

	it('follows fast pours, ignoring a swirl and a knock, and ends on the lift', () => {
		const { state, commands } = replay('sawtooth-disturbed.json', [
			{ startS: 0, cumulativeG: 45 },
			{ startS: 4, cumulativeG: 90 },
			{ startS: 9, cumulativeG: 130 },
			{ startS: 15, cumulativeG: 170 }
		]);
		expect(state.phase).toBe('done');
		expectPours(state.pours, [
			[0, 2310, 42.9],
			[4620, 7350, 86.4],
			[10170, 12780, 129.1],
			[15720, 17820, 166.8]
		]);
		expect(Math.abs(state.elapsedMs - 28890)).toBeLessThanOrEqual(400);
		expect(commands).toEqual(['startTimer', 'stopTimer']);
	});

	it('merges a top-up into its pour, and leaves a running timer alone', () => {
		const { state, commands } = replay('sawtooth-recipe.json', [
			{ startS: 0, cumulativeG: 50 },
			{ startS: 15, cumulativeG: 95 },
			{ startS: 30, cumulativeG: 150 },
			{ startS: 45, cumulativeG: 200 }
		]);
		expect(state.phase).toBe('done');
		expectPours(state.pours, [
			[0, 4050, 48.9],
			[15720, 19050, 92.6],
			[29910, 36570, 157.1],
			[45930, 49860, 202.1]
		]);
		expect(commands).toEqual(['stopTimer']);
	});

	it('stays on a pour that never reaches its target, ignoring the lift', () => {
		const { state } = replay('sawtooth-recipe.json', [
			{ startS: 0, cumulativeG: 250 },
			{ startS: 60, cumulativeG: 300 }
		]);
		expect(state).toMatchObject({ phase: 'short', pour: 0, target: 250 });
		expect(state.pours).toHaveLength(1);
		expect(Math.abs(state.pours[0].weight! - 202.1)).toBeLessThanOrEqual(0.2);
	});

	it('follows a single pour with smoothing on', () => {
		const { state } = replay('smoothing-lift.json', [{ startS: 0, cumulativeG: 120 }]);
		expect(state.phase).toBe('done');
		expectPours(state.pours, [[0, 8250, 122.2]]);
	});
});
