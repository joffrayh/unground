/**
 * Pure geometry for the taste radar (RadarChart.svelte). SVG coordinates: the centre is (0, 0) and the
 * y axis points down. Axis 0 points straight up and the rest follow clockwise.
 *
 * The scale is offset from the centre: the centre itself (and a small hole around it) means "not
 * rated", the lowest score (0.5) sits on the `inner` radius and 5 on the outer `radius`. That keeps
 * "not rated" and the lowest score apart, both on screen and when tapping.
 */
import { PROFILE_SCALE } from '#lib/domain/vocab.ts';

const { min: SCORE_MIN, max: SCORE_MAX, step: SCORE_STEP } = PROFILE_SCALE;

export interface RadarGeometry {
	/** Radius of the top score (5). */
	radius: number;
	/** Radius of the lowest score (0.5). */
	inner: number;
}

/** The whole-number rings drawn behind the shape. */
export const RINGS: readonly number[] = Array.from({ length: SCORE_MAX }, (_, i) => i + 1);

/** Steps between the lowest and the top score. */
const STEPS = Math.round((SCORE_MAX - SCORE_MIN) / SCORE_STEP);

export interface Point {
	x: number;
	y: number;
}

/** Radius per score step. */
export function stepSize(g: RadarGeometry): number {
	return (g.radius - g.inner) / STEPS;
}

/** The axis direction in radians, screen convention (0 = right, positive = clockwise). */
export function axisAngle(axis: number, count: number): number {
	return -Math.PI / 2 + (2 * Math.PI * axis) / count;
}

/** The point at distance `r` along an axis. */
export function polar(axis: number, count: number, r: number): Point {
	const a = axisAngle(axis, count);
	// Round away float noise so SSR output is stable and readable.
	return { x: round2(r * Math.cos(a)), y: round2(r * Math.sin(a)) };
}

/** The radius of a score; null (not rated) is the centre. Out-of-range scores are clamped. */
export function valueRadius(value: number | null, g: RadarGeometry): number {
	if (value == null) return 0;
	const v = clampScore(value);
	return g.inner + ((v - SCORE_MIN) / SCORE_STEP) * stepSize(g);
}

/** Where a score sits on its axis. */
export function pointFor(
	axis: number,
	value: number | null,
	count: number,
	g: RadarGeometry
): Point {
	return polar(axis, count, valueRadius(value, g));
}

/**
 * The score at a distance from the centre: the nearest step, clamped to 0.5…5. Anything closer to
 * the centre than half a step below the lowest score is "not rated" (null).
 */
export function radiusToValue(r: number, g: RadarGeometry): number | null {
	const step = stepSize(g);
	if (r < g.inner - step / 2) return null;
	return clampScore(Math.round((r - g.inner) / step) * SCORE_STEP + SCORE_MIN);
}

/** The axis whose direction is closest to the point's angle. The centre maps to axis 0. */
export function nearestAxis(x: number, y: number, count: number): number {
	if (x === 0 && y === 0) return 0;
	// Angle measured clockwise from "up", in [0, 2π).
	const fromUp = (Math.atan2(y, x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
	return Math.round(fromUp / ((2 * Math.PI) / count)) % count;
}

/**
 * A tap at (x, y): the nearest axis by angle and the score at that distance. Returns null when the
 * tap is further out than `reach` (e.g. on a label), so it changes nothing.
 */
export function valueFromPoint(
	x: number,
	y: number,
	count: number,
	g: RadarGeometry,
	reach = Infinity
): { axis: number; value: number | null } | null {
	const r = Math.hypot(x, y);
	if (r > reach) return null;
	return { axis: nearestAxis(x, y, count), value: radiusToValue(r, g) };
}

/**
 * Dragging a handle: the score at the point's projection onto the handle's own axis (so moving
 * sideways doesn't jump to another axis). Behind the centre counts as the centre.
 */
export function valueAlongAxis(
	x: number,
	y: number,
	axis: number,
	count: number,
	g: RadarGeometry
): number | null {
	const a = axisAngle(axis, count);
	const along = x * Math.cos(a) + y * Math.sin(a);
	return radiusToValue(Math.max(0, along), g);
}

/** The polygon of the scores, as an SVG `points` attribute. Unrated axes collapse to the centre. */
export function polygonPoints(values: readonly (number | null)[], g: RadarGeometry): string {
	return values
		.map((v, i) => {
			const p = pointFor(i, v, values.length, g);
			return `${p.x},${p.y}`;
		})
		.join(' ');
}

export type TextAnchor = 'start' | 'middle' | 'end';

/**
 * Where an axis label goes: `distance` out along the axis. Labels on the top and bottom axes are
 * centred; the others hang off the side they point to, so they never cover the chart.
 */
export function labelPlacement(
	axis: number,
	count: number,
	distance: number
): Point & { anchor: TextAnchor; vertical: 'above' | 'below' | 'middle' } {
	const a = axisAngle(axis, count);
	const cos = Math.cos(a);
	const sin = Math.sin(a);
	const anchor: TextAnchor = Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end';
	const vertical = anchor !== 'middle' ? 'middle' : sin < 0 ? 'above' : 'below';
	return { ...polar(axis, count, distance), anchor, vertical };
}

/**
 * A slider key press: the new score, or undefined when the key isn't handled. Up/Right one step
 * (from "not rated" to the lowest score), Down/Left one step (below the lowest back to "not rated"),
 * Page Up/Down a whole point, Home the lowest score, End 5, Delete/Backspace "not rated".
 */
export function keyValue(key: string, current: number | null): number | null | undefined {
	switch (key) {
		case 'ArrowUp':
		case 'ArrowRight':
			return step(current, SCORE_STEP);
		case 'PageUp':
			return step(current, 1);
		case 'ArrowDown':
		case 'ArrowLeft':
			return step(current, -SCORE_STEP);
		case 'PageDown':
			return step(current, -1);
		case 'Home':
			return SCORE_MIN;
		case 'End':
			return SCORE_MAX;
		case 'Delete':
		case 'Backspace':
			return null;
		default:
			return undefined;
	}
}

/** Up from "not rated" starts at the lowest score; down past the lowest is "not rated". */
function step(current: number | null, by: number): number | null {
	if (current == null) return by > 0 ? SCORE_MIN : null;
	if (by < 0 && current <= SCORE_MIN) return null;
	return clampScore(current + by);
}

/** The nearest score on the scale. */
function clampScore(v: number): number {
	const stepped = Math.round(v / SCORE_STEP) * SCORE_STEP;
	return Math.min(SCORE_MAX, Math.max(SCORE_MIN, stepped));
}

function round2(n: number): number {
	const r = Math.round(n * 100) / 100;
	return r === 0 ? 0 : r; // no "-0" in the markup
}
