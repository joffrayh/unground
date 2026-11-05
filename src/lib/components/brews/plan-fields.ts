/**
 * The glue behind the "next time" rows (PlanFields.svelte): reading, stepping and describing a planned
 * value against the brew's own. Pure and client-safe.
 *
 * A field holds the planned value as typed, or '' for "keep it as it was".
 */
import {
	PLAN_STEPS,
	grindStep,
	stepValue,
	type PlanBaseline,
	type PlanParam,
	type StepSpec
} from '#lib/domain/plan.ts';
import { AGITATION_DEFAULT } from '#lib/domain/vocab.ts';

const EPS = 1e-9;

/** Each parameter's row label. */
export const PLAN_LABEL: Record<PlanParam, string> = {
	waterTempC: 'Temperature',
	ratio: 'Ratio',
	grindSetting: 'Grind',
	pourCount: 'Pours',
	agitation: 'Agitation'
};

/** A number without float noise ("16.7", not "16.700000000000003"); '' for null. */
export function formatPlanNumber(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return '';
	return String(Math.round(n * 100) / 100);
}

/** A field's number, accepting a decimal comma; null when blank or not a number. */
export function parsePlanNumber(raw: string): number | null {
	const s = raw.trim().replace(',', '.');
	if (s === '') return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}

/** The −/+ step and limits of a parameter; grind follows the brew's own setting (grindStep). */
export function planStepSpec(param: PlanParam, current: PlanBaseline): StepSpec {
	return param === 'grindSetting' ? grindStep(current.grindSetting) : PLAN_STEPS[param];
}

/** Where a press starts when the field holds no number: the brew's value (agitation: the default). */
function startValue(param: PlanParam, current: PlanBaseline): number | null {
	return current[param] ?? (param === 'agitation' ? AGITATION_DEFAULT : null);
}

/** Whether −/+ can work at all: they need a value to start from. */
export function canStep(param: PlanParam, current: PlanBaseline): boolean {
	return startValue(param, current) != null;
}

/**
 * The field after one −/+ press. Starts from the typed value, else the brew's own; lands on '' when it
 * reaches the brew's own value again (no change). Returns `raw` unchanged when there is nothing to
 * step from.
 */
export function stepPlanField(
	param: PlanParam,
	raw: string,
	direction: 1 | -1,
	current: PlanBaseline
): string {
	const from = parsePlanNumber(raw) ?? startValue(param, current);
	if (from == null) return raw;
	const base = current[param];
	const next = stepValue(from, direction, planStepSpec(param, current), base);
	if (base != null && Math.abs(next - base) < EPS) return '';
	return formatPlanNumber(next);
}

/** Whether a press would change anything (false at a limit), so the button can be disabled. */
export function canStepTo(
	param: PlanParam,
	raw: string,
	direction: 1 | -1,
	current: PlanBaseline
): boolean {
	if (!canStep(param, current)) return false;
	const next = stepPlanField(param, raw, direction, current);
	const before = parsePlanNumber(raw);
	const after = parsePlanNumber(next);
	if (before == null && after == null) return false;
	return before == null || after == null || Math.abs(before - after) > EPS;
}

/** The planned value when the field holds one that differs from the brew's own, else null. */
export function plannedChange(param: PlanParam, raw: string, current: PlanBaseline): number | null {
	const v = parsePlanNumber(raw);
	if (v == null) return null;
	const base = current[param];
	return base != null && Math.abs(v - base) < EPS ? null : v;
}

/** "92 → 94 °C", "1:16.7 → 1:17", "24 → 26 clicks": a planned change, unit once at the end. */
export function changeText(
	param: PlanParam,
	from: number | null | undefined,
	to: number,
	grindUnit: string | null = null
): string {
	const f = from == null ? '—' : formatPlanNumber(from);
	const t = formatPlanNumber(to);
	switch (param) {
		case 'waterTempC':
			return `${f} → ${t} °C`;
		case 'ratio':
			return `${from == null ? '—' : `1:${f}`} → 1:${t}`;
		case 'grindSetting':
			return grindUnit ? `${f} → ${t} ${grindUnit}` : `${f} → ${t}`;
		case 'pourCount':
			return `${f} → ${t}`;
		case 'agitation':
			return `${f} → ${t} / 5`;
	}
}
