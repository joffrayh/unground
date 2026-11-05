import { describe, expect, it } from 'vitest';
import {
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

const g: RadarGeometry = { radius: 90, inner: 18 };
const N = 6;

describe('pointFor', () => {
	it('puts axis 0 straight up and goes clockwise (y points down)', () => {
		expect(pointFor(0, 10, N, g)).toEqual({ x: 0, y: -90 });
		const right = pointFor(1, 10, N, g);
		expect(right.x).toBeGreaterThan(0);
		expect(right.y).toBeLessThan(0);
		expect(pointFor(3, 10, N, g)).toEqual({ x: 0, y: 90 });
		expect(pointFor(5, 10, N, g).x).toBeLessThan(0);
	});

	it('puts 1 on the inner radius, 10 on the outer and not rated at the centre', () => {
		expect(valueRadius(1, g)).toBe(18);
		expect(valueRadius(10, g)).toBe(90);
		expect(valueRadius(null, g)).toBe(0);
		expect(pointFor(2, null, N, g)).toEqual({ x: 0, y: 0 });
	});

	it('clamps out-of-range scores', () => {
		expect(valueRadius(0, g)).toBe(18);
		expect(valueRadius(14, g)).toBe(90);
	});
});

describe('valueFromPoint', () => {
	it('round-trips every axis and score', () => {
		for (let axis = 0; axis < N; axis++) {
			for (let v = 1; v <= 10; v++) {
				const p = pointFor(axis, v, N, g);
				expect(valueFromPoint(p.x, p.y, N, g)).toEqual({ axis, value: v });
			}
		}
	});

	it('rounds to the nearest step', () => {
		const step = stepSize(g);
		expect(radiusToValue(valueRadius(6, g) + step * 0.4, g)).toBe(6);
		expect(radiusToValue(valueRadius(6, g) + step * 0.6, g)).toBe(7);
	});

	it('clears at the centre, but keeps 1 just inside the inner radius', () => {
		const step = stepSize(g);
		expect(valueFromPoint(0, 0, N, g)).toEqual({ axis: 0, value: null });
		expect(radiusToValue(g.inner - step / 2 - 0.01, g)).toBeNull();
		expect(radiusToValue(g.inner - step / 2 + 0.01, g)).toBe(1);
		expect(valueFromPoint(0, -3, N, g)?.value).toBeNull();
	});

	it('clamps beyond 10 and ignores taps past the reach', () => {
		expect(valueFromPoint(0, -100, N, g, 105)).toEqual({ axis: 0, value: 10 });
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
		const p = pointFor(1, 7, N, g);
		// Nudge perpendicular to axis 1 (whose direction is -30°): perpendicular is (sin30, cos30).
		const x = p.x + 10 * 0.5;
		const y = p.y + 10 * Math.cos(Math.PI / 6);
		expect(valueAlongAxis(x, y, 1, N, g)).toBe(7);
	});

	it('clears when dragged to or behind the centre', () => {
		expect(valueAlongAxis(0, 0, 0, N, g)).toBeNull();
		expect(valueAlongAxis(0, 40, 0, N, g)).toBeNull();
	});

	it('clamps past the end', () => {
		expect(valueAlongAxis(0, -200, 0, N, g)).toBe(10);
	});
});

describe('polygonPoints', () => {
	it('lists one vertex per axis with unrated ones at the centre', () => {
		expect(polygonPoints([10, null, null, 1, null, null], g)).toBe('0,-90 0,0 0,0 0,18 0,0 0,0');
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
	it('steps up from not rated to 1 and stops at 10', () => {
		expect(keyValue('ArrowUp', null)).toBe(1);
		expect(keyValue('ArrowRight', 4)).toBe(5);
		expect(keyValue('ArrowUp', 10)).toBe(10);
	});

	it('steps down below 1 to not rated', () => {
		expect(keyValue('ArrowDown', 5)).toBe(4);
		expect(keyValue('ArrowLeft', 1)).toBeNull();
		expect(keyValue('ArrowDown', null)).toBeNull();
	});

	it('handles Home, End, Delete and Backspace, and ignores other keys', () => {
		expect(keyValue('Home', null)).toBe(1);
		expect(keyValue('End', 3)).toBe(10);
		expect(keyValue('Delete', 7)).toBeNull();
		expect(keyValue('Backspace', 7)).toBeNull();
		expect(keyValue('Tab', 7)).toBeUndefined();
		expect(keyValue('a', 7)).toBeUndefined();
	});
});
