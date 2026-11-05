/**
 * Input validation for every form (Zod). Pure: no database, no framework.
 *
 * Forms post strings; these schemas turn them into typed domain inputs. Blank optional fields become
 * `null` ("not recorded"), never 0 or "" (concept.md §5).
 */
import { z } from 'zod';
import { zonedLocalToUtc } from './derive';
import { isFlavorId } from './flavors';
import { PLAN_STEPS, type PlanInput } from './plan';
import {
	entriesToPours,
	parseDuration,
	pourName,
	totalWater,
	type Pour,
	type PourEntry
} from './pours';
import {
	AGITATION_MAX,
	AGITATION_MIN,
	COUNTRY_CODES,
	DRIPPER_MATERIALS,
	FILTER_TYPES,
	PROCESSES,
	RATING_DIMENSIONS,
	ROAST_LEVELS,
	SCORE_MAX,
	SCORE_MIN,
	type FilterType,
	type RatingDimension
} from './vocab';

// --- primitives -------------------------------------------------------------------------------

const blankToNull = (v: unknown) =>
	v == null || (typeof v === 'string' && v.trim() === '') ? null : v;
/** Accepts "15,5" as well as "15.5". */
const decimal = (v: unknown) => (typeof v === 'string' ? v.trim().replace(',', '.') : v);

const reqText = (max: number) =>
	z.preprocess(
		(v) => v ?? '',
		z.string().trim().min(1, 'Required').max(max, `At most ${max} characters`)
	);
const optText = (max: number) =>
	z.preprocess(blankToNull, z.string().trim().max(max, `At most ${max} characters`).nullable());

type NumberOpts = { int?: boolean; decimals?: number };

/** Rejects more decimals than the column stores, instead of letting the database round silently. */
function hasAtMostDecimals(x: number, decimals: number): boolean {
	const scaled = x * 10 ** decimals;
	return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

const number = (min: number, max: number, opts: NumberOpts = {}) => {
	let n = z
		.number({ error: (iss) => (iss.input === undefined ? 'Required' : 'Must be a number') })
		.min(min, `Min ${min}`)
		.max(max, `Max ${max}`);
	if (opts.int) n = n.int('Must be a whole number');
	const { decimals } = opts;
	if (decimals !== undefined) {
		return n.refine(
			(x) => hasAtMostDecimals(x, decimals),
			`At most ${decimals} decimal place${decimals === 1 ? '' : 's'}`
		);
	}
	return n;
};
const reqNumber = (min: number, max: number, opts?: NumberOpts) =>
	z.preprocess(
		(v) => (blankToNull(v) === null ? undefined : Number(decimal(v))),
		number(min, max, opts)
	);
const optNumber = (min: number, max: number, opts?: NumberOpts) =>
	z.preprocess(
		(v) => (blankToNull(v) === null ? null : Number(decimal(v))),
		number(min, max, opts).nullable()
	);

const optEnum = <T extends readonly [string, ...string[]]>(values: T) =>
	z.preprocess(blankToNull, z.enum(values, { error: 'Pick a value from the list' }).nullable());
const checkbox = z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean());
const flavorIds = z
	.array(z.string())
	.max(30, 'At most 30 notes')
	.refine((ids) => ids.every(isFlavorId), 'Unknown tasting note')
	.transform((ids) => [...new Set(ids)]);
const uuid = z.uuid({ error: 'Pick one from the list' });

// --- form plumbing ----------------------------------------------------------------------------

export type FieldErrors = Record<string, string>;
export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

/** Flattens a FormData into a plain object; keys listed in `multi` keep every value as an array. */
export function formObject(fd: FormData, multi: readonly string[] = []): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const key of new Set(fd.keys())) {
		const values = fd.getAll(key).filter((v): v is string => typeof v === 'string');
		out[key] = multi.includes(key) ? values : values[0];
	}
	for (const key of multi) out[key] ??= [];
	return out;
}

function run<T>(schema: z.ZodType<T>, input: unknown): ParseResult<T> {
	const result = schema.safeParse(input);
	if (result.success) return { ok: true, data: result.data };
	const errors: FieldErrors = {};
	for (const issue of result.error.issues) {
		const key = issue.path.length ? issue.path.join('.') : '_form';
		errors[key] ??= issue.message;
	}
	return { ok: false, errors };
}

// --- reference entities -----------------------------------------------------------------------

export const roasterSchema = z.object({
	name: reqText(100),
	website: z.preprocess(
		blankToNull,
		z
			.url({ protocol: /^https?$/, error: 'Must be a web address (https://…)' })
			.max(300)
			.nullable()
	)
});
export type RoasterInput = z.infer<typeof roasterSchema>;
export const parseRoasterForm = (fd: FormData) => run(roasterSchema, formObject(fd));

export const grinderSchema = z.object({
	name: reqText(100),
	settingUnit: optText(30)
});
export type GrinderInput = z.infer<typeof grinderSchema>;
export const parseGrinderForm = (fd: FormData) => run(grinderSchema, formObject(fd));

export const dripperSchema = z.object({
	name: reqText(100),
	material: optEnum(DRIPPER_MATERIALS)
});
export type DripperInput = z.infer<typeof dripperSchema>;
export const parseDripperForm = (fd: FormData) => run(dripperSchema, formObject(fd));

// --- bean -------------------------------------------------------------------------------------

export const beanSchema = z
	.object({
		name: reqText(150),
		/** Free-typed roaster name; resolved to an existing roaster or created (case-insensitive). */
		roasterName: reqText(100),
		country: optEnum(COUNTRY_CODES),
		farm: optText(150),
		altitudeMinM: optNumber(0, 4000, { int: true }),
		altitudeMaxM: optNumber(0, 4000, { int: true }),
		process: optEnum(PROCESSES),
		roastLevel: optEnum(ROAST_LEVELS),
		roastDate: z.preprocess(
			blankToNull,
			z.iso
				.date({ error: 'Must be a date' })
				.refine((d) => d >= '2000-01-01', 'Must be after 2000')
				// One day of slack for time zones ahead of the server.
				.refine(
					(d) => Date.parse(`${d}T00:00:00Z`) <= Date.now() + 86_400_000,
					'Can’t be in the future'
				)
				.nullable()
		),
		decaf: checkbox,
		storedFrozen: checkbox,
		roasterNotesRaw: optText(500),
		roasterNotes: flavorIds,
		bagWeightG: optNumber(1, 10000, { decimals: 1 }),
		bagPrice: optNumber(0, 100000, { decimals: 2 })
	})
	.transform((b) => ({
		...b,
		// A single quoted altitude sets both ends of the range (D13).
		altitudeMinM: b.altitudeMinM ?? b.altitudeMaxM,
		altitudeMaxM: b.altitudeMaxM ?? b.altitudeMinM
	}))
	.refine(
		(b) => b.altitudeMinM == null || b.altitudeMaxM == null || b.altitudeMinM <= b.altitudeMaxM,
		{ path: ['altitudeMaxM'], message: 'Max altitude must be at least the min' }
	);
export type BeanInput = z.infer<typeof beanSchema>;
export const parseBeanForm = (fd: FormData) => run(beanSchema, formObject(fd, ['roasterNotes']));

// --- rating -----------------------------------------------------------------------------------

const score = optNumber(SCORE_MIN, SCORE_MAX, { int: true });

const dimensionScores = Object.fromEntries(RATING_DIMENSIONS.map((d) => [d, score])) as Record<
	RatingDimension,
	typeof score
>;

export const ratingSchema = z
	.object({
		overall: score,
		...dimensionScores,
		comment: optText(2000),
		perceivedNotes: flavorIds
	})
	.superRefine((r, ctx) => {
		const anythingElse =
			RATING_DIMENSIONS.some((d) => r[d] != null) ||
			r.comment != null ||
			r.perceivedNotes.length > 0;
		if (r.overall == null && anythingElse) {
			ctx.addIssue({
				code: 'custom',
				path: ['overall'],
				message: 'An overall score is needed to save a rating'
			});
		}
	});

export type RatingInput = {
	overall: number;
	comment: string | null;
	perceivedNotes: string[];
} & Record<RatingDimension, number | null>;

/** Returns `null` data when the rating section was left blank (rate later). */
export function parseRatingFields(obj: Record<string, unknown>): ParseResult<RatingInput | null> {
	const result = run(ratingSchema, obj);
	if (!result.ok) return result;
	const r = result.data;
	if (r.overall == null) return { ok: true, data: null };
	const data = {
		overall: r.overall,
		comment: r.comment,
		perceivedNotes: r.perceivedNotes
	} as RatingInput;
	for (const d of RATING_DIMENSIONS) data[d] = r[d] as number | null;
	return { ok: true, data };
}

export const parseRatingForm = (fd: FormData) =>
	parseRatingFields(formObject(fd, ['perceivedNotes']));

// --- next-time plan ---------------------------------------------------------------------------

const planNumber = (spec: { min: number; max: number }, opts: NumberOpts) =>
	optNumber(spec.min, spec.max, opts);

/** The "next time" fields (D25); the brew form prefixes them with `next`. Not yet compared to the brew. */
export const planSchema = z.object({
	nextWaterTempC: planNumber(PLAN_STEPS.waterTempC, { decimals: 1 }),
	nextRatio: planNumber(PLAN_STEPS.ratio, { decimals: 1 }),
	nextGrindSetting: planNumber(PLAN_STEPS.grindSetting, { decimals: 2 }),
	nextPourCount: planNumber(PLAN_STEPS.pourCount, { int: true }),
	nextAgitation: planNumber(PLAN_STEPS.agitation, { int: true }),
	nextNotes: optText(1000)
});

export const PLAN_FIELDS = [
	'nextWaterTempC',
	'nextRatio',
	'nextGrindSetting',
	'nextPourCount',
	'nextAgitation',
	'nextNotes'
] as const;

/** Null when every field was left blank. */
export function parsePlanFields(obj: Record<string, unknown>): ParseResult<PlanInput | null> {
	const result = run(planSchema, obj);
	if (!result.ok) return result;
	const p = result.data;
	const plan: PlanInput = {
		waterTempC: p.nextWaterTempC,
		ratio: p.nextRatio,
		grindSetting: p.nextGrindSetting,
		pourCount: p.nextPourCount,
		agitation: p.nextAgitation,
		notes: p.nextNotes
	};
	return { ok: true, data: Object.values(plan).every((v) => v == null) ? null : plan };
}

export const parsePlanForm = (fd: FormData) => parsePlanFields(formObject(fd));

// --- brew -------------------------------------------------------------------------------------

export interface V60Details {
	filterType: FilterType | null;
	pours: Pour[];
}

export interface BrewInput {
	/** IANA zone the brew was entered in (brewedAt was typed as local time there). */
	timezone: string;
	beanId: string;
	grinderId: string;
	/** Null = not recorded (D23). */
	dripperId: string | null;
	method: 'v60';
	brewedAt: Date;
	grindSetting: number;
	doseG: number;
	waterTempC: number;
	/** 0–5, null = not recorded (D24). */
	agitation: number | null;
	totalTimeS: number;
	notes: string | null;
	/** Method-specific block (D8). Becomes a union keyed by `method` when more methods exist. */
	details: V60Details;
}

const brewCommonSchema = z.object({
	beanId: uuid,
	grinderId: uuid,
	dripperId: z.preprocess(blankToNull, uuid.nullable()),
	method: z.literal('v60', { error: 'Unsupported brew method' }),
	brewedAt: reqText(20),
	grindSetting: reqNumber(0, 9999, { decimals: 2 }),
	doseG: reqNumber(0.1, 200, { decimals: 1 }),
	waterTempC: reqNumber(0, 100, { decimals: 1 }),
	agitation: optNumber(AGITATION_MIN, AGITATION_MAX, { int: true }),
	totalTime: reqText(10),
	notes: optText(2000),
	filterType: optEnum(FILTER_TYPES)
});

/** Brew-form fields that post several values; routes pass this to `formValues` too. */
export const BREW_MULTI = [
	'pourTime',
	'pourScale',
	'pourTimeDefault',
	'pourScaleDefault',
	'pourRow',
	'pourBloom',
	'pourDrop',
	'perceivedNotes'
] as const;

/**
 * D26: a new brew shows the previous brew's values as placeholders, and a field left blank saves its
 * placeholder. The form posts each placeholder as `<field>Default`; this fills blanks from them.
 * The grind placeholder only counts on the grinder it came from (D2), named by `grindSettingDefaultFor`.
 */
function applyDefaults(obj: Record<string, unknown>): Record<string, unknown> {
	const out = dropPourRows(obj);
	const blank = (v: unknown) => blankToNull(v) === null;
	const fill = (key: string) => {
		if (blank(out[key]) && !blank(obj[`${key}Default`])) out[key] = obj[`${key}Default`];
	};
	if (obj.grindSettingDefaultFor === obj.grinderId) fill('grindSetting');
	fill('doseG');
	fill('waterTempC');
	const times = (out.pourTime as string[]).slice();
	const scales = (out.pourScale as string[]).slice();
	const timeDefaults = out.pourTimeDefault as string[];
	const scaleDefaults = out.pourScaleDefault as string[];
	const rows = Math.max(times.length, scales.length);
	for (let i = 0; i < rows; i++) {
		if (blank(scales[i]) && !blank(scaleDefaults[i])) scales[i] = scaleDefaults[i];
		// A time placeholder only fills a pour that has a scale reading: on its own it is a spare row.
		if (blank(times[i]) && !blank(timeDefaults[i]) && !blank(scales[i])) {
			times[i] = timeDefaults[i];
		}
	}
	out.pourTime = times;
	out.pourScale = scales;
	return out;
}

/**
 * Each pour row posts a stable id (`pourRow`); the bloom and drop tick boxes post that id, so they
 * stay on their row whatever rows the editor added or removed. Without ids, positions are used.
 */
function rowIds(obj: Record<string, unknown>, rows: number): string[] {
	const ids = obj.pourRow as string[];
	return Array.from({ length: rows }, (_, i) => ids[i] ?? String(i));
}

/**
 * Removes the rows ticked "drop" (the no-JS way to log fewer pours than the placeholders offer)
 * from every per-row array, before their placeholders could fill them.
 */
function dropPourRows(obj: Record<string, unknown>): Record<string, unknown> {
	const out = { ...obj };
	const drop = new Set(obj.pourDrop as string[]);
	if (drop.size === 0) return out;
	const perRow = ['pourTime', 'pourScale', 'pourTimeDefault', 'pourScaleDefault', 'pourRow'];
	const rows = Math.max(...perRow.map((k) => (obj[k] as string[]).length));
	const ids = rowIds(obj, rows);
	for (const key of perRow) {
		out[key] = (obj[key] as string[]).filter((_, i) => !drop.has(ids[i]));
	}
	// Positional ids would shift once rows are dropped, so keep the surviving ids explicit.
	out.pourRow = ids.filter((id) => !drop.has(id));
	return out;
}

/**
 * Reads the pour rows; fully blank rows are ignored so a no-JS form can offer spare rows.
 * `bloomRows` holds the row ids whose bloom box is ticked.
 */
function parsePourRows(
	times: string[],
	scales: string[],
	ids: string[],
	bloomRows: ReadonlySet<string>
): ParseResult<Pour[]> {
	const entries: PourEntry[] = [];
	const rows = Math.max(times.length, scales.length);
	for (let i = 0; i < rows; i++) {
		const t = (times[i] ?? '').trim();
		const g = (scales[i] ?? '').trim();
		if (t === '' && g === '') continue;
		const name = pourName(entries.length);
		const startS = t === '' && entries.length === 0 ? 0 : parseDuration(t);
		if (startS === null)
			return { ok: false, errors: { pours: `${name}: time must look like 1:30` } };
		const cumulativeG = Number(decimal(g));
		if (g === '' || !Number.isFinite(cumulativeG)) {
			return { ok: false, errors: { pours: `${name}: enter the scale reading in grams` } };
		}
		if (!hasAtMostDecimals(cumulativeG, 1)) {
			return { ok: false, errors: { pours: `${name}: at most 1 decimal place` } };
		}
		entries.push({ startS, cumulativeG, bloom: bloomRows.has(ids[i]) });
	}
	const result = entriesToPours(entries);
	if (!result.ok) return { ok: false, errors: { pours: result.error } };
	if (result.pours.length > 50) return { ok: false, errors: { pours: 'At most 50 pours' } };
	if (totalWater(result.pours) > 5000)
		return { ok: false, errors: { pours: 'Total water can’t exceed 5000 g' } };
	return { ok: true, data: result.pours };
}

export interface BrewFormData {
	brew: BrewInput;
	rating: RatingInput | null;
	/** As entered; the service drops values equal to the brew's own (planChanges). */
	plan: PlanInput | null;
}

/**
 * Parses the brew form (brew + V60 block + optional rating and next-time sections).
 * `timeZone` is the user's zone; the datetime-local input is interpreted in it.
 */
export function parseBrewForm(fd: FormData, timeZone: string): ParseResult<BrewFormData> {
	const obj = applyDefaults(formObject(fd, BREW_MULTI));
	const errors: FieldErrors = {};

	const common = run(brewCommonSchema, obj);
	if (!common.ok) Object.assign(errors, common.errors);

	const times = obj.pourTime as string[];
	const scales = obj.pourScale as string[];
	const pours = parsePourRows(
		times,
		scales,
		rowIds(obj, Math.max(times.length, scales.length)),
		new Set(obj.pourBloom as string[])
	);
	if (!pours.ok) Object.assign(errors, pours.errors);

	const rating = parseRatingFields(obj);
	if (!rating.ok) Object.assign(errors, rating.errors);

	const plan = parsePlanFields(obj);
	if (!plan.ok) Object.assign(errors, plan.errors);

	let brewedAt: Date | null = null;
	let totalTimeS: number | null = null;
	if (common.ok) {
		brewedAt = zonedLocalToUtc(common.data.brewedAt, timeZone);
		if (!brewedAt) errors.brewedAt = 'Must be a date and time';
		else if (brewedAt.getTime() > Date.now() + 24 * 3600_000)
			errors.brewedAt = 'Can’t be in the future';
		else if (brewedAt.getTime() < Date.UTC(2000, 0, 1)) errors.brewedAt = 'Must be after 2000';
		totalTimeS = parseDuration(common.data.totalTime);
		if (totalTimeS === null || totalTimeS <= 0 || totalTimeS > 3600) {
			errors.totalTime = 'Must look like 3:15 (max 60:00)';
		}
	}
	if (pours.ok && common.ok && totalTimeS !== null) {
		const lastStart = pours.data.reduce((s, p) => s + p.intervalS, 0);
		if (lastStart >= totalTimeS) errors.totalTime = 'Total time must be after the last pour starts';
	}

	if (Object.keys(errors).length > 0 || !common.ok || !pours.ok || !rating.ok || !plan.ok) {
		return { ok: false, errors };
	}
	const c = common.data;
	return {
		ok: true,
		data: {
			brew: {
				timezone: timeZone,
				beanId: c.beanId,
				grinderId: c.grinderId,
				dripperId: c.dripperId,
				method: c.method,
				brewedAt: brewedAt!,
				grindSetting: c.grindSetting,
				doseG: c.doseG,
				waterTempC: c.waterTempC,
				agitation: c.agitation,
				totalTimeS: totalTimeS!,
				notes: c.notes,
				details: { filterType: c.filterType, pours: pours.data }
			},
			rating: rating.data,
			plan: plan.data
		}
	};
}

// --- account ----------------------------------------------------------------------------------

export const signupSchema = z.object({
	email: z.preprocess(
		(v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
		z.email({ error: 'Must be an email address' }).max(254)
	),
	password: z
		.string({ error: 'Required' })
		.min(10, 'At least 10 characters')
		.max(200, 'At most 200 characters'),
	timezone: z.preprocess((v) => blankToNull(v) ?? 'UTC', z.string().max(64)),
	inviteCode: optText(200)
});
export const parseSignupForm = (fd: FormData) => run(signupSchema, formObject(fd));

export const loginSchema = z.object({
	email: z.preprocess(
		(v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''),
		z.string().min(1, 'Required')
	),
	password: z.string({ error: 'Required' }).min(1, 'Required')
});
export const parseLoginForm = (fd: FormData) => run(loginSchema, formObject(fd));
