/**
 * The brew form's starting values, as the strings the inputs hold. Pure and client-safe.
 *
 * - Editing shows everything that was saved.
 * - A new brew (D15, D26) shows the template brew's recipe as placeholders: blank inputs whose
 *   placeholder is saved when they are left blank. Choices (bean, grinder, dripper, filter, agitation,
 *   bloom ticks) are pre-selected instead. What was measured or felt on that day (total time, notes,
 *   rating) starts blank, and the template's next-time plan becomes green suggestions (D25, D30).
 */
import { FLAVOR_BY_ID } from '#lib/domain/flavors.ts';
import { brewRatio } from '#lib/domain/derive.ts';
import type { PlanInput, PlanParam } from '#lib/domain/plan.ts';
import { formatDuration, poursToEntries, totalWater, type Pour } from '#lib/domain/pours.ts';
import { AGITATION_DEFAULT, RATING_DIMENSIONS, type RatingDimension } from '#lib/domain/vocab.ts';
import { val, vals, type FormState } from '#lib/ui/forms.ts';
import {
	blankRow,
	placeholderRowsFromEntries,
	rowsFromEntries,
	type PourRow
} from './pour-rows.ts';

export type RatingValues = {
	overall: string;
	comment: string;
	perceivedNotes: string[];
} & Record<RatingDimension, string>;

/** The next-time fields as the inputs hold them (D25); '' means "keep it as it was". */
export interface PlanValues {
	nextWaterTempC: string;
	nextRatio: string;
	nextGrindSetting: string;
	nextPourCount: string;
	nextAgitation: string;
	nextNotes: string;
}

/** The form field of each plan parameter. */
export const PLAN_FIELD: Record<PlanParam, Exclude<keyof PlanValues, 'nextNotes'>> = {
	waterTempC: 'nextWaterTempC',
	ratio: 'nextRatio',
	grindSetting: 'nextGrindSetting',
	pourCount: 'nextPourCount',
	agitation: 'nextAgitation'
};

/** Placeholders a new brew saves for fields left blank (D26), posted as `<field>Default`. */
export interface BrewDefaults {
	grindSetting: string;
	/** The grinder the grind placeholder belongs to; on any other grinder it doesn't apply (D2). */
	grindSettingFor: string;
	doseG: string;
	waterTempC: string;
}

/** What the template brew's plan suggests, with the values it changes from ("15 › 17"). */
export interface BrewSuggestions {
	/** Only shown while the brew uses `grindFor` (D2). */
	grindSetting: { from: string; to: string; grindFor: string } | null;
	waterTempC: { from: string; to: string } | null;
	agitation: { from: string; to: string } | null;
	/** Water:dose; the dose stays, the water changes. */
	ratio: { from: number | null; to: number } | null;
	pourCount: { from: number; to: number } | null;
	notes: string | null;
	/** The template's pours, which the pour suggestion reshapes (suggestPours). */
	pours: Pour[];
}

export interface BrewFormValues {
	beanId: string;
	grinderId: string;
	dripperId: string;
	filterType: string;
	grindSetting: string;
	doseG: string;
	waterTempC: string;
	/** '0'…'5', or '' when not recorded. */
	agitation: string;
	pours: PourRow[];
	totalTime: string;
	brewedAt: string;
	notes: string;
	rating: RatingValues;
	plan: PlanValues;
	/** New brews only. */
	defaults: BrewDefaults | null;
	/** New brews whose template has a plan. */
	suggestions: BrewSuggestions | null;
}

/** The parts of a stored rating the form shows (the service's Rating satisfies this). */
export type RatingLike = {
	overall: number;
	comment: string | null;
	perceivedNotes: readonly string[];
} & Record<RatingDimension, number | null>;

/** The parts of a stored brew the form shows (the service's Brew satisfies this). */
export interface BrewLike {
	beanId: string;
	grinderId: string;
	dripperId: string | null;
	grindSetting: number;
	doseG: number;
	waterTempC: number;
	agitation: number | null;
	totalTimeS: number;
	notes: string | null;
	details: { filterType: string | null; pours: Pour[] };
	rating: RatingLike | null;
	plan: PlanInput | null;
}

const str = (v: number | string | null | undefined) => (v == null ? '' : String(v));

export function ratingValues(rating: RatingLike | null): RatingValues {
	const out = {
		overall: str(rating?.overall),
		comment: rating?.comment ?? '',
		perceivedNotes: [...(rating?.perceivedNotes ?? [])]
	} as RatingValues;
	for (const d of RATING_DIMENSIONS) out[d] = str(rating?.[d]);
	return out;
}

/** The rating fields after a failed submit (what was sent), else the fallback. */
export function ratingFormValues(form: FormState, fallback: RatingValues): RatingValues {
	if (!form?.values) return fallback;
	const out = {
		overall: val(form, 'overall'),
		comment: val(form, 'comment'),
		perceivedNotes: vals(form, 'perceivedNotes')
	} as RatingValues;
	for (const d of RATING_DIMENSIONS) out[d] = val(form, d);
	return out;
}

export function planValues(plan: PlanInput | null): PlanValues {
	return {
		nextWaterTempC: str(plan?.waterTempC),
		nextRatio: str(plan?.ratio),
		nextGrindSetting: str(plan?.grindSetting),
		nextPourCount: str(plan?.pourCount),
		nextAgitation: str(plan?.agitation),
		nextNotes: plan?.notes ?? ''
	};
}

export const PLAN_FORM_FIELDS = [...Object.values(PLAN_FIELD), 'nextNotes'] as const;

/** The plan fields after a failed submit (what was sent), else the fallback. */
export function planFormValues(form: FormState, fallback: PlanValues): PlanValues {
	if (!form?.values) return fallback;
	const out = {} as PlanValues;
	for (const key of PLAN_FORM_FIELDS) out[key] = val(form, key);
	return out;
}

export function hasPlanValues(p: PlanValues): boolean {
	return PLAN_FORM_FIELDS.some((k) => p[k].trim() !== '');
}

/** Everything that was saved, for the edit form. */
export function editValues(brew: BrewLike, brewedAt: string): BrewFormValues {
	return {
		beanId: brew.beanId,
		grinderId: brew.grinderId,
		dripperId: brew.dripperId ?? '',
		filterType: brew.details.filterType ?? '',
		grindSetting: str(brew.grindSetting),
		doseG: str(brew.doseG),
		waterTempC: str(brew.waterTempC),
		agitation: str(brew.agitation),
		pours: rowsFromEntries(poursToEntries(brew.details.pours)),
		totalTime: formatDuration(brew.totalTimeS),
		brewedAt,
		notes: brew.notes ?? '',
		rating: ratingValues(brew.rating),
		plan: planValues(brew.plan),
		defaults: null,
		suggestions: null
	};
}

/** The template's plan as suggestions for the next brew, or null when it has none. */
export function suggestionsFrom(template: BrewLike): BrewSuggestions | null {
	const plan = template.plan;
	if (!plan) return null;
	const change = (from: number | null, to: number | null) =>
		to == null ? null : { from: str(from), to: str(to) };
	return {
		grindSetting:
			plan.grindSetting == null
				? null
				: {
						from: str(template.grindSetting),
						to: str(plan.grindSetting),
						grindFor: template.grinderId
					},
		waterTempC: change(template.waterTempC, plan.waterTempC),
		agitation: change(template.agitation ?? AGITATION_DEFAULT, plan.agitation),
		ratio:
			plan.ratio == null
				? null
				: {
						from: brewRatio(template.doseG, totalWater(template.details.pours)),
						to: plan.ratio
					},
		pourCount:
			plan.pourCount == null ? null : { from: template.details.pours.length, to: plan.pourCount },
		notes: plan.notes,
		pours: template.details.pours.map((p) => ({ ...p }))
	};
}

/**
 * A new brew's values: the template's recipe as placeholders (grind, dose, temperature, pours) and
 * pre-selected choices (bean, grinder, dripper, filter, agitation, blooms). `overrides` picks a bean,
 * grinder or dripper.
 */
export function newBrewValues(
	template: BrewLike | null,
	brewedAt: string,
	overrides: { beanId?: string; grinderId?: string; dripperId?: string } = {}
): BrewFormValues {
	const base = template ? templateValues(template, brewedAt) : blankValues(brewedAt);
	return {
		...base,
		beanId: overrides.beanId ?? base.beanId,
		grinderId: overrides.grinderId ?? base.grinderId,
		dripperId: overrides.dripperId ?? base.dripperId
	};
}

function templateValues(template: BrewLike, brewedAt: string): BrewFormValues {
	return {
		beanId: template.beanId,
		grinderId: template.grinderId,
		dripperId: template.dripperId ?? '',
		filterType: template.details.filterType ?? '',
		grindSetting: '',
		doseG: '',
		waterTempC: '',
		agitation: String(template.agitation ?? AGITATION_DEFAULT),
		pours: placeholderRowsFromEntries(poursToEntries(template.details.pours)),
		totalTime: '',
		brewedAt,
		notes: '',
		rating: ratingValues(null),
		plan: planValues(null),
		defaults: {
			grindSetting: str(template.grindSetting),
			grindSettingFor: template.grinderId,
			doseG: str(template.doseG),
			waterTempC: str(template.waterTempC)
		},
		suggestions: suggestionsFrom(template)
	};
}

function blankValues(brewedAt: string): BrewFormValues {
	return {
		beanId: '',
		grinderId: '',
		dripperId: '',
		filterType: '',
		grindSetting: '',
		doseG: '',
		waterTempC: '',
		agitation: String(AGITATION_DEFAULT),
		// The first ever brew starts with pour 0 ticked as a bloom, the usual recipe.
		pours: [blankRow(true)],
		totalTime: '',
		brewedAt,
		notes: '',
		rating: ratingValues(null),
		plan: planValues(null),
		defaults: null,
		suggestions: null
	};
}

export interface BeanOption {
	id: string;
	label: string;
	archived: boolean;
}

export interface GrinderOption extends BeanOption {
	unit: string | null;
}

export type DripperOption = BeanOption;

/**
 * Picker options: active items, plus the archived ones in `keep` (the brew's own bean or grinder when
 * editing), marked as archived. Order is kept.
 */
export function beanOptions(
	beans: readonly { id: string; name: string; roasterName: string; archivedAt: Date | null }[],
	keep: readonly string[] = []
): BeanOption[] {
	return beans
		.filter((b) => b.archivedAt == null || keep.includes(b.id))
		.map((b) => ({
			id: b.id,
			label: `${b.name} · ${b.roasterName}`,
			archived: b.archivedAt != null
		}));
}

export function grinderOptions(
	grinders: readonly {
		id: string;
		name: string;
		settingUnit: string | null;
		archivedAt: Date | null;
	}[],
	keep: readonly string[] = []
): GrinderOption[] {
	return grinders
		.filter((g) => g.archivedAt == null || keep.includes(g.id))
		.map((g) => ({ id: g.id, label: g.name, unit: g.settingUnit, archived: g.archivedAt != null }));
}

export function dripperOptions(
	drippers: readonly { id: string; name: string; archivedAt: Date | null }[],
	keep: readonly string[] = []
): DripperOption[] {
	return drippers
		.filter((d) => d.archivedAt == null || keep.includes(d.id))
		.map((d) => ({ id: d.id, label: d.name, archived: d.archivedAt != null }));
}

/** The id if it is one of the options, else the first option's (or '' when there are none). */
export function chooseId(id: string | null | undefined, opts: readonly { id: string }[]): string {
	return opts.find((o) => o.id === id)?.id ?? opts[0]?.id ?? '';
}

/**
 * Tasted notes that agree with the roaster's: the same tag, or one is a broader tier of the other
 * ("Berry" agrees with "Blueberry"). Returns the tasted ids, in order.
 */
export function agreeingNotes(tasted: readonly string[], claimed: readonly string[]): string[] {
	const related = (a: string, b: string) =>
		a === b || a.startsWith(b + '.') || b.startsWith(a + '.');
	return tasted.filter((t) => claimed.some((c) => related(t, c)));
}

export function flavorName(id: string): string {
	return FLAVOR_BY_ID.get(id)?.name ?? id;
}
