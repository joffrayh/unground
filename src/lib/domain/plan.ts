/**
 * The "next time" plan (D25): what the brewer means to change on the next brew, and how the next brew
 * turns that plan into suggestions. Pure and client-safe.
 *
 * A stored plan only holds deliberate changes: a value equal to the brew's own is dropped, so `null`
 * always means "keep it as it was".
 */
import { brewRatio } from './derive';
import { roundTenth, totalWater, type Pour } from './pours';
import { AGITATION_MAX, AGITATION_MIN } from './vocab';

export interface PlanInput {
	waterTempC: number | null;
	/** Water:dose. The next brew keeps its dose and changes the water. */
	ratio: number | null;
	grindSetting: number | null;
	pourCount: number | null;
	agitation: number | null;
	notes: string | null;
}

/** The numeric parameters a plan can change. */
export const PLAN_PARAMS = [
	'waterTempC',
	'ratio',
	'grindSetting',
	'pourCount',
	'agitation'
] as const;
export type PlanParam = (typeof PLAN_PARAMS)[number];

/** The brew's own values, which the plan is compared against. */
export type PlanBaseline = Record<PlanParam, number | null>;

export interface StepSpec {
	step: number;
	min: number;
	max: number;
}

/** The −/+ buttons' step and limits. Limits match the validators and the database CHECKs. */
export const PLAN_STEPS: Record<PlanParam, StepSpec> = {
	waterTempC: { step: 1, min: 0, max: 100 },
	ratio: { step: 0.5, min: 1, max: 50 },
	grindSetting: { step: 1, min: 0, max: 9999 },
	pourCount: { step: 1, min: 1, max: 50 },
	agitation: { step: 1, min: AGITATION_MIN, max: AGITATION_MAX }
};

/**
 * Grind steps by 1, or by 0.1 when the brew's own setting has decimals (a dial such as 5.3). Base it on
 * the brew's setting, not the value being stepped, so the step doesn't change half-way (5.9 → 6.0).
 */
export function grindStep(brewSetting: number | null): StepSpec {
	const fine = brewSetting != null && !Number.isInteger(brewSetting);
	return { ...PLAN_STEPS.grindSetting, step: fine ? 0.1 : 1 };
}

/**
 * One −/+ press: moves to the next multiple of `step` in that direction, so 16.7 steps to 17 or 16.5
 * (step 0.5) and the values stay on a tidy grid. A press that would cross `baseline` (the brew's own
 * value, often off the grid) stops on it, so the user can always get back to "no change". Clamped to
 * the limits.
 */
export function stepValue(
	value: number,
	direction: 1 | -1,
	spec: StepSpec,
	baseline: number | null = null
): number {
	const k = value / spec.step;
	const n = direction > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1;
	let next = Math.round(n * spec.step * 100) / 100;
	if (baseline != null) {
		const crosses =
			direction > 0
				? value < baseline - 1e-9 && next > baseline + 1e-9
				: value > baseline + 1e-9 && next < baseline - 1e-9;
		if (crosses) next = baseline;
	}
	return Math.min(spec.max, Math.max(spec.min, next));
}

/** The values a brew's plan is compared against. */
export function planBaseline(brew: {
	waterTempC: number;
	grindSetting: number;
	doseG: number;
	waterG: number;
	agitation: number | null;
	pourCount: number;
}): PlanBaseline {
	return {
		waterTempC: brew.waterTempC,
		ratio: brewRatio(brew.doseG, brew.waterG),
		grindSetting: brew.grindSetting,
		pourCount: brew.pourCount,
		agitation: brew.agitation
	};
}

/**
 * Keeps only real changes: values equal to the brew's own become null. Returns null when nothing is
 * left (no row is stored for an empty plan).
 */
export function planChanges(plan: PlanInput | null, baseline: PlanBaseline): PlanInput | null {
	if (!plan) return null;
	const out: PlanInput = { ...plan };
	for (const key of PLAN_PARAMS) {
		const v = out[key];
		const base = baseline[key];
		if (v != null && base != null && Math.abs(v - base) < 1e-9) out[key] = null;
	}
	const empty = PLAN_PARAMS.every((k) => out[k] == null) && out.notes == null;
	return empty ? null : out;
}

/** Fallback gap before an added pour when the previous brew gives none. */
const DEFAULT_INTERVAL_S = 45;
/** The validators' total-water limit; a suggestion beyond it couldn't be saved. */
const MAX_WATER_G = 5000;

export interface PourSuggestion {
	pours: Pour[];
	totalG: number;
	/** Pours appended to the previous brew's (shown in green until accepted). */
	added: number;
	/** Pours dropped from the end of the previous brew's (shown in red until accepted). */
	removed: number;
}

/**
 * The previous brew's pours reshaped for the plan's ratio and pour count (D25): the dose stays, so a
 * new ratio changes the total water; pours are dropped from or appended to the end; bloom pours keep
 * their amount and the other pours share the rest evenly (whole grams where possible). Appended pours
 * start one previous gap after the last pour.
 *
 * Returns null when nothing changes, or when the plan can't be met (the blooms alone already reach
 * the new total, every pour is a bloom, or the water would exceed what can be saved).
 */
export function suggestPours(
	prev: readonly Pour[],
	doseG: number | null,
	target: { ratio: number | null; pourCount: number | null }
): PourSuggestion | null {
	if (prev.length === 0) return null;
	const count = target.pourCount ?? prev.length;
	const prevTotal = totalWater([...prev]);
	const total =
		target.ratio != null && doseG != null && doseG > 0
			? Math.round(doseG * target.ratio)
			: prevTotal;
	if (count === prev.length && total === prevTotal) return null;
	if (total > MAX_WATER_G) return null;

	const gap = prev.at(-1)!.intervalS || DEFAULT_INTERVAL_S;
	const shaped: Pour[] = prev.slice(0, count).map((p) => ({ ...p }));
	while (shaped.length < count) shaped.push({ volumeG: 0, intervalS: gap, bloom: false });

	const fixed = roundTenth(shaped.filter((p) => p.bloom).reduce((s, p) => s + p.volumeG, 0));
	const others = shaped.filter((p) => !p.bloom);
	const rest = roundTenth(total - fixed);
	if (others.length === 0) return null;

	const whole = Math.floor(rest + 1e-9);
	const fraction = roundTenth(rest - whole);
	const base = Math.floor(whole / others.length);
	if (base < 1) return null;
	const extra = whole - base * others.length;
	others.forEach((p, i) => {
		p.volumeG = base + (i < extra ? 1 : 0) + (i === others.length - 1 ? fraction : 0);
		p.volumeG = roundTenth(p.volumeG);
	});

	return {
		pours: shaped,
		totalG: totalWater(shaped),
		added: Math.max(0, count - prev.length),
		removed: Math.max(0, prev.length - count)
	};
}
