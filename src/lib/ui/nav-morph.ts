/**
 * Geometry of the nav's primary button (D38): the swirl ⇄ save icon morph and the circle ⇄ pill body.
 * Paths are rebuilt from point lists because iOS Safari can't animate `d` in CSS.
 */

type Point = readonly [number, number];
/** A start point followed by three points per cubic. */
type Stroke = readonly Point[];
/** Spiral line, then the arrow's right barb, left barb and shaft, which the cross turns into. */
type Pose = readonly [Stroke, Stroke, Stroke, Stroke];

const pointsOf = (coords: readonly number[]): Stroke =>
	Array.from({ length: coords.length / 2 }, (_, i) => [coords[i * 2], coords[i * 2 + 1]] as const);

/** Moves a pose from where it was drawn in Figma into the shared box. */
function placed(dx: number, dy: number, pose: Pose): Pose {
	const move = (stroke: Stroke): Stroke => stroke.map(([x, y]) => [x - dx, y - dy] as const);
	return [move(pose[0]), move(pose[1]), move(pose[2]), move(pose[3])];
}

/** A straight run from `a` to `b` as a cubic, so it can morph with the curves. */
function straight(a: Point, b: Point): Stroke {
	const at = (u: number) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u] as const;
	return [a, at(1 / 3), at(2 / 3), b];
}

/** Straight runs through `points`, joined into one stroke. */
function polyline(points: readonly Point[]): Stroke {
	return points.slice(1).reduce<Point[]>(
		(out, point, i) => {
			out.push(...straight(points[i], point).slice(1));
			return out;
		},
		[points[0]]
	);
}

const CROSS: Point = [16.8992, 17.3426];
/** Figma `spiral`, in the 115×118 box every pose shares. */
const SWIRL: Pose = [
	pointsOf([
		59.3902, 51.1377, 68.5163, 40.55, 91.2044, 53.5335, 83.0561, 70.3038, 72.1513, 92.7471, 40.4422,
		78.8821, 40.4422, 58.7114, 40.4422, 30.8897, 73.494, 15.3254, 95.5075, 34.8311, 119.405,
		56.0065, 116.234, 108.179, 67.2015, 112.655, 31.5535, 115.908, 9.27871, 95.8781, 5.57855,
		65.2763, 3.03252, 44.2197, 9.29375, 28.4686, 16.8992, 17.3426
	]),
	straight(CROSS, [27.3755, 24.4739]),
	straight(CROSS, [5.57856, 9.63664]),
	[CROSS, [20.3468, 12.2991], [24.0706, 8.20605], [27.3755, 5]]
];

const UNRAVEL_CROSS: Point = [314.02, 73.3514];
/** The midpoint drawn in Figma: the spiral has opened, with its inner end pointing up at the top right. */
const UNRAVEL = placed(257.5, 46, [
	pointsOf([
		334.69, 59.5, 352.19, 67, 362.69, 72.5, 362.69, 93, 362.69, 113.5, 357.69, 135.549, 352.19, 142,
		344.08, 151.512, 333.965, 151.951, 315.188, 151.951, 306.188, 151.951, 286.185, 148.884, 277.19,
		142, 264.19, 132.049, 270.89, 128.602, 267.189, 98, 264.194, 73.2248, 297.509, 68.2465, 314.02,
		73.3514
	]),
	[UNRAVEL_CROSS, [317.904, 74.552], [320.857, 76.3102], [322.19, 78.4999]],
	straight(UNRAVEL_CROSS, [300.19, 84.4999]),
	straight(UNRAVEL_CROSS, [304.29, 47])
]);

const [LEFT, RIGHT, TOP, BOTTOM, SHAFT] = [114.5, 199, 113.5, 188.5, 156.5];
const TIP: Point = [SHAFT, 163.5];
/** Figma `brew nav visible`, centred on the same circle as the swirl. */
const SAVE = placed(99.05, 86.44, [
	polyline([
		[RIGHT, TOP],
		[RIGHT, (TOP + BOTTOM) / 2],
		[RIGHT, BOTTOM],
		[SHAFT, BOTTOM],
		[LEFT, BOTTOM],
		[LEFT, TOP],
		[SHAFT, TOP]
	]),
	[TIP, [158.333, 156], [166, 145], [178, 138.5]],
	[TIP, [155, 157], [148, 144.5], [134, 138.5]],
	straight(TIP, [SHAFT, TOP])
]);

const n = (value: number) => Number(value.toFixed(2));

function strokePath(points: readonly Point[]): string {
	const [[x, y], ...rest] = points;
	let d = `M${n(x)} ${n(y)}`;
	rest.forEach(([px, py], i) => {
		d += `${i % 3 === 0 ? 'C' : ' '}${n(px)} ${n(py)}`;
	});
	return d;
}

/** Passes through `mid` at `t` = 0.5 with no jolt there and no overshoot (a monotone cubic). */
function through(a: number, mid: number, b: number, t: number): number {
	const before = (mid - a) * 2;
	const after = (b - mid) * 2;
	const atMid = before * after > 0 ? (2 * before * after) / (before + after) : 0;
	const atEnd = (slope: number) =>
		Math.sign(slope) *
		Math.min(Math.abs(slope) * 3, Math.max(0, (Math.sign(slope) * (3 * slope - atMid)) / 2));
	const [p0, p1, d0, d1, u] =
		t < 0.5 ? [a, mid, atEnd(before), atMid, t * 2] : [mid, b, atMid, atEnd(after), (t - 0.5) * 2];
	const u2 = u * u;
	const u3 = u2 * u;
	return (
		(2 * u3 - 3 * u2 + 1) * p0 +
		(u3 - 2 * u2 + u) * 0.5 * d0 +
		(-2 * u3 + 3 * u2) * p1 +
		(u3 - u2) * 0.5 * d1
	);
}

/** Straight edges per cubic of the spiral line; each cubic's ends stay exact, so corners stay sharp. */
const EDGES_PER_CUBIC = 12;

function sampled(stroke: Stroke): Point[] {
	const out: Point[] = [stroke[0]];
	for (let i = 1; i < stroke.length; i += 3) {
		const [p0, p1, p2, p3] = [stroke[i - 1], stroke[i], stroke[i + 1], stroke[i + 2]];
		for (let k = 1; k <= EDGES_PER_CUBIC; k++) {
			const u = k / EDGES_PER_CUBIC;
			const v = 1 - u;
			const at = (c: 0 | 1) =>
				v * v * v * p0[c] + 3 * v * v * u * p1[c] + 3 * v * u * u * p2[c] + u * u * u * p3[c];
			out.push([at(0), at(1)]);
		}
	}
	return out;
}

/** The spiral line described from its cross end: each edge's length and running direction. */
interface Uncoiled {
	anchor: Point;
	lengths: number[];
	angles: number[];
}

const nearestTurn = (angle: number) => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI));

function uncoiled(stroke: Stroke, previous?: Uncoiled): Uncoiled {
	const points = sampled(stroke).reverse();
	const lengths: number[] = [];
	const angles: number[] = [];
	for (let k = 1; k < points.length; k++) {
		const dx = points[k][0] - points[k - 1][0];
		const dy = points[k][1] - points[k - 1][1];
		const angle = Math.atan2(dy, dx);
		const reference = k > 1 ? angles[k - 2] : (previous?.angles[0] ?? angle);
		lengths.push(Math.hypot(dx, dy));
		angles.push(reference + nearestTurn(angle - reference));
	}
	return { anchor: points[0], lengths, angles };
}

const SWIRL_LINE = uncoiled(SWIRL[0]);
const UNRAVEL_LINE = uncoiled(UNRAVEL[0], SWIRL_LINE);
const SAVE_LINE = uncoiled(SAVE[0], UNRAVEL_LINE);

/**
 * The icon at `t`: 0 swirl, 0.5 the drawn midpoint, 1 save. The spiral line blends each edge's
 * direction and rebuilds from the cross end, so the free end leads and the coil can't fold over it.
 */
export function glyphPath(t: number): string {
	let x = through(SWIRL_LINE.anchor[0], UNRAVEL_LINE.anchor[0], SAVE_LINE.anchor[0], t);
	let y = through(SWIRL_LINE.anchor[1], UNRAVEL_LINE.anchor[1], SAVE_LINE.anchor[1], t);
	let d = `M${n(x)} ${n(y)}`;
	SWIRL_LINE.lengths.forEach((length, k) => {
		const edge = through(length, UNRAVEL_LINE.lengths[k], SAVE_LINE.lengths[k], t);
		const angle = through(SWIRL_LINE.angles[k], UNRAVEL_LINE.angles[k], SAVE_LINE.angles[k], t);
		x += Math.cos(angle) * edge;
		y += Math.sin(angle) * edge;
		d += `L${n(x)} ${n(y)}`;
	});
	for (const s of [1, 2, 3] as const) {
		d += strokePath(
			SWIRL[s].map(([px, py], i) => {
				const [mx, my] = UNRAVEL[s][i];
				const [ex, ey] = SAVE[s][i];
				return [through(px, mx, ex, t), through(py, my, ey, t)] as const;
			})
		);
	}
	return d;
}

export const CIRCLE_SIZE = 52;
export const PILL_WIDTH = 122;
const PINCH = 5;
const SQUASH = 2.5;
/** Kappa: a cubic this far along its tangent traces a quarter circle. */
const ARC = 0.5523;

/**
 * The body at `t`, centred on 0,0: 0 circle, 1 pill. It necks in mid-stretch like a drop pulling
 * apart; a spring overshooting past 1 flattens it a little more.
 */
export function bodyPath(t: number): string {
	const settled = Math.min(1, Math.max(0, t));
	const stretch = Math.sin(Math.PI * settled);
	const width = CIRCLE_SIZE + (PILL_WIDTH - CIRCLE_SIZE) * t;
	const halfWidth = width / 2;
	const radius = Math.min(halfWidth, CIRCLE_SIZE / 2 - SQUASH * stretch - Math.max(0, t - 1) * 20);
	const flat = halfWidth - radius;
	const neck = radius - PINCH * stretch;
	const arc = radius * ARC;
	const edge = flat / 2;
	const v = (...values: number[]) => values.map(n).join(' ');
	return (
		`M${v(-halfWidth, 0)}` +
		`C${v(-halfWidth, -arc, -flat - arc, -radius, -flat, -radius)}` +
		`C${v(-edge, -radius, -edge, -neck, 0, -neck)}` +
		`C${v(edge, -neck, edge, -radius, flat, -radius)}` +
		`C${v(flat + arc, -radius, halfWidth, -arc, halfWidth, 0)}` +
		`C${v(halfWidth, arc, flat + arc, radius, flat, radius)}` +
		`C${v(edge, radius, edge, neck, 0, neck)}` +
		`C${v(-edge, neck, -edge, radius, -flat, radius)}` +
		`C${v(-flat - arc, radius, -halfWidth, arc, -halfWidth, 0)}Z`
	);
}
