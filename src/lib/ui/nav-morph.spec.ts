import { describe, expect, it } from 'vitest';
import { CIRCLE_SIZE, PILL_WIDTH, bodyPath, glyphPath } from './nav-morph.ts';

/** The strokes of a path, each as its coordinates. */
function strokes(d: string): number[][] {
	return d
		.split('M')
		.slice(1)
		.map((s) => s.match(/-?\d+(\.\d+)?/g)!.map(Number));
}

/** The start of a stroke and the end of each of its pieces, `every` coordinates apart. */
function nodes(coords: number[], every: number): [number, number][] {
	const out: [number, number][] = [];
	for (let i = 0; i < coords.length; i += every) out.push([coords[i], coords[i + 1]]);
	return out;
}

function expectNodes(actual: [number, number][], expected: [number, number][]) {
	expect(actual).toHaveLength(expected.length);
	actual.forEach(([x, y], i) => {
		expect(x).toBeCloseTo(expected[i][0], 1);
		expect(y).toBeCloseTo(expected[i][1], 1);
	});
}

/** Coordinates from the Figma frame to the box the icon is drawn in. */
const save = (x: number, y: number): [number, number] => [x - 99.05, y - 86.44];

/** The spiral line has 12 straight edges per original cubic, drawn from the cross end. */
const LINE_NODE = 24;
const CUBIC_NODE = 6;

function selfCrossings(coords: number[]): number {
	const p = nodes(coords, 2);
	const side = (a: number[], b: number[], c: number[]) =>
		(b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
	let crossings = 0;
	for (let i = 0; i < p.length - 1; i++) {
		for (let j = i + 2; j < p.length - 1; j++) {
			const straddlesI = side(p[i], p[i + 1], p[j]) * side(p[i], p[i + 1], p[j + 1]) < 0;
			const straddlesJ = side(p[j], p[j + 1], p[i]) * side(p[j], p[j + 1], p[i + 1]) < 0;
			if (straddlesI && straddlesJ) crossings++;
		}
	}
	return crossings;
}

describe('glyphPath', () => {
	it('starts on the Figma swirl', () => {
		const [line, barbA, barbB, tail] = strokes(glyphPath(0));
		expectNodes(nodes(line, LINE_NODE), [
			[16.9, 17.34],
			[5.58, 65.28],
			[67.2, 112.66],
			[95.51, 34.83],
			[40.44, 58.71],
			[83.06, 70.3],
			[59.39, 51.14]
		]);
		expect(barbA.slice(-2)[0]).toBeCloseTo(27.38, 1);
		expect(barbB.slice(-2)[0]).toBeCloseTo(5.58, 1);
		expect(tail.slice(-2)[1]).toBeCloseTo(5, 1);
	});

	it('passes through the drawn midpoint', () => {
		const [line] = strokes(glyphPath(0.5));
		expect(line.at(-2)).toBeCloseTo(334.69 - 257.5, 1);
		expect(line.at(-1)).toBeCloseTo(59.5 - 46, 1);
	});

	it('ends on the Figma save icon', () => {
		const [line, right, left, shaft] = strokes(glyphPath(1));
		expectNodes(nodes(line, LINE_NODE), [
			save(156.5, 113.5),
			save(114.5, 113.5),
			save(114.5, 188.5),
			save(156.5, 188.5),
			save(199, 188.5),
			save(199, 151),
			save(199, 113.5)
		]);
		expectNodes(nodes(right, CUBIC_NODE), [save(156.5, 163.5), save(178, 138.5)]);
		expectNodes(nodes(left, CUBIC_NODE), [save(156.5, 163.5), save(134, 138.5)]);
		expectNodes(nodes(shaft, CUBIC_NODE), [save(156.5, 163.5), save(156.5, 113.5)]);
	});

	it('keeps the same commands all the way through', () => {
		const shape = (d: string) => d.replace(/[^MCL]/g, '');
		for (const t of [0.1, 0.33, 0.5, 0.9]) {
			expect(shape(glyphPath(t))).toBe(shape(glyphPath(0)));
			expect(glyphPath(t)).not.toContain('NaN');
		}
	});

	it('unwinds without the line ever crossing itself', () => {
		for (let i = 0; i <= 200; i++) {
			const [line] = strokes(glyphPath(i / 200));
			expect(selfCrossings(line)).toBe(0);
		}
	});
});

describe('bodyPath', () => {
	const xs = (d: string) =>
		d
			.match(/-?\d+(\.\d+)?/g)!
			.map(Number)
			.filter((_, i) => i % 2 === 0);

	it('is the circle at rest and the pill when stretched', () => {
		expect(Math.max(...xs(bodyPath(0)))).toBe(CIRCLE_SIZE / 2);
		expect(Math.max(...xs(bodyPath(1)))).toBe(PILL_WIDTH / 2);
	});

	it('stays well formed when a spring overshoots either end', () => {
		for (const t of [-0.1, 1.15]) expect(bodyPath(t)).not.toContain('NaN');
	});
});
