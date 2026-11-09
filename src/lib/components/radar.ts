/**
 * Pure geometry for the taste radar (RadarChart.svelte). SVG coordinates: the centre is (0, 0) and the
 * y axis points down. Axis 0 points straight up and the rest follow clockwise.
 *
 * The scale is offset from the centre: the centre itself (and a small hole around it) means "not
 * rated", score 1 sits on the `inner` radius and score 10 on the outer `radius`. That keeps "not
 * rated" and 1 apart, both on screen and when tapping.
 */
import { SCORE_MAX, SCORE_MIN } from '#lib/domain/vocab.ts';

export interface RadarGeometry {
	/** Radius of the top score (10). */
	radius: number;
	/** Radius of the lowest score (1). */
	inner: number;
}

export interface Point {
	x: number;
	y: number;
}

/** Radius per score step. */
export function stepSize(g: RadarGeometry): number {
	return (g.radius - g.inner) / (SCORE_MAX - SCORE_MIN);
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
	return g.inner + (v - SCORE_MIN) * stepSize(g);
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
 * The score at a distance from the centre: the nearest step, clamped to 1…10. Anything closer to the
 * centre than half a step below score 1 is "not rated" (null).
 */
export function radiusToValue(r: number, g: RadarGeometry): number | null {
	const step = stepSize(g);
	if (r < g.inner - step / 2) return null;
	return clampScore(Math.round((r - g.inner) / step) + SCORE_MIN);
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
 * A slider key press: the new score, or undefined when the key isn't handled. Up/Right +1 (from
 * "not rated" to 1), Down/Left −1 (below 1 back to "not rated"), Home 1, End 10, Delete/Backspace
 * "not rated".
 */
export function keyValue(key: string, current: number | null): number | null | undefined {
	switch (key) {
		case 'ArrowUp':
		case 'ArrowRight':
			return current == null ? SCORE_MIN : clampScore(current + 1);
		case 'ArrowDown':
		case 'ArrowLeft':
			return current == null || current <= SCORE_MIN ? null : clampScore(current - 1);
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

/** The fine-control slider's position for a score: 0 is "not rated", like the chart's centre. */
export function sliderPosition(score: number | null): number {
	return score ?? 0;
}

/** The score at a slider position. */
export function sliderScore(position: number): number | null {
	return position < SCORE_MIN ? null : clampScore(position);
}

function clampScore(v: number): number {
	return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(v)));
}

function round2(n: number): number {
	const r = Math.round(n * 100) / 100;
	return r === 0 ? 0 : r; // no "-0" in the markup
}
