import { describe, expect, it } from 'vitest';
import { PROFILE_SCALE, scaleScores } from '#lib/domain/vocab.ts';
import {
	RINGS,
	keyValue,
	labelPlacement,
	nearestAxis,
	pointFor,
	polygonPoints,
	radiusToValue,
	stepSize,
	valueAlongAxis,
	valueFromPoint,
	valueRadius,
	type RadarGeometry
} from './radar.ts';

// 9 steps of 8 from the inner radius (0.5) to the outer one (5).
const g: RadarGeometry = { radius: 90, inner: 18 };
const N = 6;

describe('pointFor', () => {
	it('puts axis 0 straight up and goes clockwise (y points down)', () => {
		expect(pointFor(0, 5, N, g)).toEqual({ x: 0, y: -90 });
		const right = pointFor(1, 5, N, g);
		expect(right.x).toBeGreaterThan(0);
		expect(right.y).toBeLessThan(0);
		expect(pointFor(3, 5, N, g)).toEqual({ x: 0, y: 90 });
		expect(pointFor(5, 5, N, g).x).toBeLessThan(0);
	});

	it('puts 0.5 on the inner radius, 5 on the outer and not rated at the centre', () => {
		expect(stepSize(g)).toBe(8);
		expect(valueRadius(0.5, g)).toBe(18);
		expect(valueRadius(1, g)).toBe(26);
		expect(valueRadius(5, g)).toBe(90);
		expect(valueRadius(null, g)).toBe(0);
		expect(pointFor(2, null, N, g)).toEqual({ x: 0, y: 0 });
	});

	it('clamps out-of-range scores and rounds to half steps', () => {
		expect(valueRadius(0, g)).toBe(18);
		expect(valueRadius(14, g)).toBe(90);
		expect(valueRadius(1.1, g)).toBe(26);
	});

	it('draws a ring at each whole score', () => {
		expect(RINGS).toEqual([1, 2, 3, 4, 5]);
	});
});

describe('valueFromPoint', () => {
	it('round-trips every axis and score', () => {
		for (let axis = 0; axis < N; axis++) {
			for (const v of scaleScores(PROFILE_SCALE)) {
				const p = pointFor(axis, v, N, g);
				expect(valueFromPoint(p.x, p.y, N, g)).toEqual({ axis, value: v });
			}
		}
	});

	it('rounds to the nearest step', () => {
		const step = stepSize(g);
		expect(radiusToValue(valueRadius(3, g) + step * 0.4, g)).toBe(3);
		expect(radiusToValue(valueRadius(3, g) + step * 0.6, g)).toBe(3.5);
	});

	it('clears at the centre, but keeps 0.5 just inside the inner radius', () => {
		const step = stepSize(g);
		expect(valueFromPoint(0, 0, N, g)).toEqual({ axis: 0, value: null });
		expect(radiusToValue(g.inner - step / 2 - 0.01, g)).toBeNull();
		expect(radiusToValue(g.inner - step / 2 + 0.01, g)).toBe(0.5);
		expect(valueFromPoint(0, -3, N, g)?.value).toBeNull();
	});

	it('clamps beyond 5 and ignores taps past the reach', () => {
		expect(valueFromPoint(0, -100, N, g, 105)).toEqual({ axis: 0, value: 5 });
		expect(valueFromPoint(0, -110, N, g, 105)).toBeNull();
	});

	it('picks the axis nearest by angle', () => {
		const deg = (d: number) => {
			// d degrees clockwise from up, at radius 50
			const a = ((d - 90) * Math.PI) / 180;
			return [50 * Math.cos(a), 50 * Math.sin(a)] as const;
		};
		expect(nearestAxis(...deg(0), N)).toBe(0);
		expect(nearestAxis(...deg(29), N)).toBe(0);
		expect(nearestAxis(...deg(31), N)).toBe(1);
		expect(nearestAxis(...deg(60), N)).toBe(1);
		expect(nearestAxis(...deg(185), N)).toBe(3);
		expect(nearestAxis(...deg(-25), N)).toBe(0);
		expect(nearestAxis(...deg(335), N)).toBe(0);
		expect(nearestAxis(...deg(320), N)).toBe(5);
	});
});

describe('valueAlongAxis', () => {
	it('projects onto the dragged axis, ignoring sideways movement', () => {
		const p = pointFor(1, 3.5, N, g);
		// Nudge perpendicular to axis 1 (whose direction is -30°): perpendicular is (sin30, cos30).
		const x = p.x + 10 * 0.5;
		const y = p.y + 10 * Math.cos(Math.PI / 6);
		expect(valueAlongAxis(x, y, 1, N, g)).toBe(3.5);
	});

	it('clears when dragged to or behind the centre', () => {
		expect(valueAlongAxis(0, 0, 0, N, g)).toBeNull();
		expect(valueAlongAxis(0, 40, 0, N, g)).toBeNull();
	});

	it('clamps past the end', () => {
		expect(valueAlongAxis(0, -200, 0, N, g)).toBe(5);
	});
});

describe('polygonPoints', () => {
	it('lists one vertex per axis with unrated ones at the centre', () => {
		expect(polygonPoints([5, null, null, 1, null, null], g)).toBe('0,-90 0,0 0,0 0,26 0,0 0,0');
	});
});

describe('labelPlacement', () => {
	it('centres top and bottom labels and hangs side labels outward', () => {
		expect(labelPlacement(0, N, 100)).toMatchObject({ anchor: 'middle', vertical: 'above' });
		expect(labelPlacement(1, N, 100)).toMatchObject({ anchor: 'start', vertical: 'middle' });
		expect(labelPlacement(2, N, 100)).toMatchObject({ anchor: 'start' });
		expect(labelPlacement(3, N, 100)).toMatchObject({ anchor: 'middle', vertical: 'below' });
		expect(labelPlacement(4, N, 100)).toMatchObject({ anchor: 'end' });
		expect(labelPlacement(5, N, 100)).toMatchObject({ anchor: 'end' });
	});
});

describe('keyValue', () => {
	it('steps a half up from not rated to 0.5 and stops at 5', () => {
		expect(keyValue('ArrowUp', null)).toBe(0.5);
		expect(keyValue('ArrowRight', 4)).toBe(4.5);
		expect(keyValue('ArrowUp', 5)).toBe(5);
	});

	it('steps a half down, below 0.5 to not rated', () => {
		expect(keyValue('ArrowDown', 2.5)).toBe(2);
		expect(keyValue('ArrowLeft', 0.5)).toBeNull();
		expect(keyValue('ArrowDown', null)).toBeNull();
	});

	it('moves a whole point with Page Up and Page Down', () => {
		expect(keyValue('PageUp', null)).toBe(0.5);
		expect(keyValue('PageUp', 2.5)).toBe(3.5);
		expect(keyValue('PageUp', 4.5)).toBe(5);
		expect(keyValue('PageDown', 3.5)).toBe(2.5);
		expect(keyValue('PageDown', 1)).toBe(0.5);
		expect(keyValue('PageDown', 0.5)).toBeNull();
	});

	it('handles Home, End, Delete and Backspace, and ignores other keys', () => {
		expect(keyValue('Home', null)).toBe(0.5);
		expect(keyValue('End', 3)).toBe(5);
		expect(keyValue('Delete', 3.5)).toBeNull();
		expect(keyValue('Backspace', 3.5)).toBeNull();
		expect(keyValue('Tab', 3.5)).toBeUndefined();
		expect(keyValue('a', 3.5)).toBeUndefined();
	});
});
