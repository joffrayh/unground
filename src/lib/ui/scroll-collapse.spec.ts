import { describe, expect, it } from 'vitest';
import { type CollapseState, nextCollapse } from './scroll-collapse.ts';

const MAX = 1000;
const run = (positions: number[], start: CollapseState = { collapsed: false, anchor: 0 }) =>
	positions.reduce((state, y) => nextCollapse(state, y, MAX), start);

describe('nextCollapse', () => {
	it('stays open for a small scroll down', () => {
		expect(run([30, 35]).collapsed).toBe(false);
	});

	it('collapses after a real scroll down', () => {
		expect(run([30, 60, 100]).collapsed).toBe(true);
	});

	it('measures from the lowest point reached', () => {
		expect(run([100, 200, 130, 150]).collapsed).toBe(false);
		expect(run([100, 200, 130, 175]).collapsed).toBe(true);
	});

	it('stays collapsed for a small scroll back up', () => {
		expect(run([100, 300, 290]).collapsed).toBe(true);
	});

	it('expands after a real scroll up, measured from the furthest point', () => {
		expect(run([100, 300, 400, 370]).collapsed).toBe(false);
	});

	it('always expands at the top', () => {
		const collapsed = { collapsed: true, anchor: 30 };
		expect(nextCollapse(collapsed, 0, MAX).collapsed).toBe(false);
	});

	it('ignores overscroll bounce at the bottom', () => {
		const collapsed = run([100, 500, MAX]);
		expect(nextCollapse(collapsed, MAX + 60, MAX).collapsed).toBe(true);
		expect(nextCollapse(nextCollapse(collapsed, MAX + 60, MAX), MAX, MAX).collapsed).toBe(true);
	});

	it('ignores overscroll at the top', () => {
		expect(run([-40, 0]).collapsed).toBe(false);
	});
});
