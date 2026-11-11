/**
 * Database schema — the authoritative data model (concept.md §5).
 *
 * Integrity rules live here, not only in application code (D18):
 * - vocabularies and value ranges are CHECK constraints;
 * - every reference between user-owned rows is a composite (id, user_id) foreign key, so a brew can
 *   never point at another user's bean or grinder even if a query forgets a filter.
 */
import { sql, type SQL } from 'drizzle-orm';
import {
	boolean,
	check,
	date,
	foreignKey,
	index,
	integer,
	numeric,
	pgTable,
	primaryKey,
	smallint,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
import {
	AGITATION_MAX,
	AGITATION_MIN,
	BREW_METHODS,
	CHANGED_VARIABLES,
	COUNTRY_CODES,
	DRIPPER_MATERIALS,
	FILTER_TYPES,
	PROCESSES,
	OVERALL_SCALE,
	PROFILE_SCALE,
	ROAST_LEVELS,
	type ScoreScale
} from '../../domain/vocab';

/** `col IN ('a', 'b', …)` with inlined literals (DDL can't take bind parameters). Values are our own constants. */
function inList(column: AnyPgColumn, values: readonly string[]): SQL {
	return sql`${column} IN (${sql.raw(values.map((v) => `'${v}'`).join(', '))})`;
}

function nullOrIn(column: AnyPgColumn, values: readonly string[]): SQL {
	return sql`${column} IS NULL OR ${inList(column, values)}`;
}

function agitationRange(column: AnyPgColumn): SQL {
	return sql`${column} IS NULL OR ${column} BETWEEN ${sql.raw(String(AGITATION_MIN))} AND ${sql.raw(String(AGITATION_MAX))}`;
}

/** In range and on a step (D55). */
function isScore(column: AnyPgColumn, s: ScoreScale): SQL {
	const n = (x: number) => sql.raw(String(x));
	return sql`${column} BETWEEN ${n(s.min)} AND ${n(s.max)} AND mod(${column}, ${n(s.step)}) = 0`;
}

function profileScore(column: AnyPgColumn): SQL {
	return sql`${column} IS NULL OR (${isScore(column, PROFILE_SCALE)})`;
}

/** Overall in quarters, sub-scores in halves (D55); migration 0005 halved the old 1–10 scores. */
const score = (name: string) => numeric(name, { precision: 3, scale: 2, mode: 'number' });

const timestamps = {
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
};

// --- accounts ---------------------------------------------------------------------------------

export const users = pgTable(
	'users',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		email: text('email').notNull().unique(),
		passwordHash: text('password_hash').notNull(),
		/** IANA zone; roast age uses the brewer's local date. */
		timezone: text('timezone').notNull().default('UTC'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [check('users_email_lowercase', sql`${t.email} = lower(${t.email})`)]
);

export const sessions = pgTable(
	'sessions',
	{
		/** SHA-256 of the session token; the raw token only ever lives in the cookie. */
		id: text('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
	},
	(t) => [index('sessions_user_idx').on(t.userId)]
);

// --- reference entities -----------------------------------------------------------------------

export const roasters = pgTable(
	'roasters',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		website: text('website'),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		...timestamps
	},
	(t) => [
		unique('roasters_id_user').on(t.id, t.userId),
		uniqueIndex('roasters_user_name').on(t.userId, sql`lower(${t.name})`),
		check('roasters_name_nonempty', sql`length(trim(${t.name})) > 0`)
	]
);

export const grinders = pgTable(
	'grinders',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		/** Label for the grind setting, e.g. "clicks" or "dial". */
		settingUnit: text('setting_unit'),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		...timestamps
	},
	(t) => [
		unique('grinders_id_user').on(t.id, t.userId),
		uniqueIndex('grinders_user_name').on(t.userId, sql`lower(${t.name})`),
		check('grinders_name_nonempty', sql`length(trim(${t.name})) > 0`)
	]
);

/** A dripper (brewer) is reused across brews like a grinder (D23). */
export const drippers = pgTable(
	'drippers',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		material: text('material'),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		...timestamps
	},
	(t) => [
		unique('drippers_id_user').on(t.id, t.userId),
		uniqueIndex('drippers_user_name').on(t.userId, sql`lower(${t.name})`),
		check('drippers_name_nonempty', sql`length(trim(${t.name})) > 0`),
		check('drippers_material', nullOrIn(t.material, DRIPPER_MATERIALS))
	]
);

/** A Bluetooth scale (D46). Which phone it's paired with is kept on the phone (D47). */
export const scales = pgTable(
	'scales',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		...timestamps
	},
	(t) => [
		unique('scales_id_user').on(t.id, t.userId),
		uniqueIndex('scales_user_name').on(t.userId, sql`lower(${t.name})`),
		check('scales_name_nonempty', sql`length(trim(${t.name})) > 0`)
	]
);

export const flavors = pgTable(
	'flavors',
	{
		/** Dotted path, e.g. "fruity.berry.blueberry". Seeded from src/lib/domain/flavors.ts. */
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		parentId: text('parent_id').references((): AnyPgColumn => flavors.id),
		tier: smallint('tier').notNull()
	},
	(t) => [check('flavors_tier', sql`${t.tier} BETWEEN 1 AND 3`)]
);

// --- beans ------------------------------------------------------------------------------------

export const beans = pgTable(
	'beans',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		roasterId: uuid('roaster_id').notNull(),
		name: text('name').notNull(),
		// origin
		country: text('country'),
		farm: text('farm'),
		altitudeMinM: integer('altitude_min_m'),
		altitudeMaxM: integer('altitude_max_m'),
		// process
		process: text('process'),
		// roast
		roastLevel: text('roast_level'),
		roastDate: date('roast_date', { mode: 'string' }),
		decaf: boolean('decaf').notNull().default(false),
		storedFrozen: boolean('stored_frozen').notNull().default(false),
		roasterNotesRaw: text('roaster_notes_raw'),
		// bag (D28): what's left is the weight minus the doses of the bean's brews
		bagWeightG: numeric('bag_weight_g', { precision: 6, scale: 1, mode: 'number' }),
		/** Price paid for the bag, in the user's own currency. */
		bagPrice: numeric('bag_price', { precision: 8, scale: 2, mode: 'number' }),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		...timestamps
	},
	(t) => [
		unique('beans_id_user').on(t.id, t.userId),
		foreignKey({
			name: 'beans_roaster_fk',
			columns: [t.roasterId, t.userId],
			foreignColumns: [roasters.id, roasters.userId]
		}).onDelete('restrict'),
		index('beans_user_idx').on(t.userId),
		check('beans_name_nonempty', sql`length(trim(${t.name})) > 0`),
		check('beans_country', nullOrIn(t.country, COUNTRY_CODES)),
		check('beans_process', nullOrIn(t.process, PROCESSES)),
		check('beans_roast_level', nullOrIn(t.roastLevel, ROAST_LEVELS)),
		check(
			'beans_altitude',
			sql`(${t.altitudeMinM} IS NULL OR ${t.altitudeMinM} BETWEEN 0 AND 4000)
			AND (${t.altitudeMaxM} IS NULL OR ${t.altitudeMaxM} BETWEEN 0 AND 4000)
			AND (${t.altitudeMinM} IS NULL OR ${t.altitudeMaxM} IS NULL OR ${t.altitudeMinM} <= ${t.altitudeMaxM})`
		),
		check(
			'beans_bag_weight',
			sql`${t.bagWeightG} IS NULL OR (${t.bagWeightG} > 0 AND ${t.bagWeightG} <= 10000)`
		),
		check(
			'beans_bag_price',
			sql`${t.bagPrice} IS NULL OR (${t.bagPrice} >= 0 AND ${t.bagPrice} <= 100000)`
		)
	]
);

export const beanRoasterNotes = pgTable(
	'bean_roaster_notes',
	{
		beanId: uuid('bean_id')
			.notNull()
			.references(() => beans.id, { onDelete: 'cascade' }),
		flavorId: text('flavor_id')
			.notNull()
			.references(() => flavors.id)
	},
	(t) => [primaryKey({ columns: [t.beanId, t.flavorId] })]
);

// --- brews ------------------------------------------------------------------------------------

export const brews = pgTable(
	'brews',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		beanId: uuid('bean_id').notNull(),
		grinderId: uuid('grinder_id').notNull(),
		/** Null on brews logged before drippers were tracked, or when not recorded (D23). */
		dripperId: uuid('dripper_id'),
		/** The scale it was measured on; null when logged by hand (D51). */
		scaleId: uuid('scale_id'),
		method: text('method').notNull(),
		brewedAt: timestamp('brewed_at', { withTimezone: true }).notNull(),
		/**
		 * IANA zone the brew was logged in. Local date and roast age are derived from it, so a later move
		 * or trip never rewrites history.
		 */
		timezone: text('timezone').notNull(),
		grindSetting: numeric('grind_setting', { precision: 6, scale: 2, mode: 'number' }).notNull(),
		/** The beans were fed into the grinder slowly (D56). Brews from before it was asked are false. */
		slowFed: boolean('slow_fed').notNull().default(false),
		doseG: numeric('dose_g', { precision: 5, scale: 1, mode: 'number' }).notNull(),
		/** For pour-over methods this always equals the sum of the pours (set by the server). */
		waterG: numeric('water_g', { precision: 6, scale: 1, mode: 'number' }).notNull(),
		waterTempC: numeric('water_temp_c', { precision: 4, scale: 1, mode: 'number' }).notNull(),
		totalTimeS: integer('total_time_s').notNull(),
		/** Swirl / stir, unitless 0–5 (D24). Null = not recorded. */
		agitation: smallint('agitation'),
		/** Legacy (D25): no longer asked in the form; kept for brews that recorded it. */
		changed: text('changed')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		notes: text('notes'),
		...timestamps
	},
	(t) => [
		// Lets each method block reference (id, method), so a brew can only carry its own method's block.
		unique('brews_id_method').on(t.id, t.method),
		foreignKey({
			name: 'brews_bean_fk',
			columns: [t.beanId, t.userId],
			foreignColumns: [beans.id, beans.userId]
		}).onDelete('restrict'),
		foreignKey({
			name: 'brews_grinder_fk',
			columns: [t.grinderId, t.userId],
			foreignColumns: [grinders.id, grinders.userId]
		}).onDelete('restrict'),
		// MATCH SIMPLE: a null dripper_id skips the check, a set one must be the user's own dripper.
		foreignKey({
			name: 'brews_dripper_fk',
			columns: [t.dripperId, t.userId],
			foreignColumns: [drippers.id, drippers.userId]
		}).onDelete('restrict'),
		foreignKey({
			name: 'brews_scale_fk',
			columns: [t.scaleId, t.userId],
			foreignColumns: [scales.id, scales.userId]
		}).onDelete('restrict'),
		index('brews_user_brewed_idx').on(t.userId, t.brewedAt.desc()),
		index('brews_bean_idx').on(t.beanId),
		check('brews_method', inList(t.method, BREW_METHODS)),
		check('brews_grind', sql`${t.grindSetting} >= 0`),
		check('brews_dose', sql`${t.doseG} > 0 AND ${t.doseG} <= 200`),
		check('brews_water', sql`${t.waterG} > 0 AND ${t.waterG} <= 5000`),
		check('brews_temp', sql`${t.waterTempC} BETWEEN 0 AND 100`),
		check('brews_time', sql`${t.totalTimeS} > 0 AND ${t.totalTimeS} <= 3600`),
		check('brews_agitation', agitationRange(t.agitation)),
		check(
			'brews_changed',
			sql`${t.changed} <@ ARRAY[${sql.raw(CHANGED_VARIABLES.map((v) => `'${v}'`).join(', '))}]::text[]`
		)
	]
);

/**
 * V60 method-specific block (D8). Add `brew_<method>` tables for new methods, following the same pattern:
 * a constant `method` column plus a composite FK to brews(id, method).
 */
export const brewV60 = pgTable(
	'brew_v60',
	{
		brewId: uuid('brew_id').primaryKey(),
		method: text('method').notNull().default('v60'),
		filterType: text('filter_type')
	},
	(t) => [
		foreignKey({
			name: 'brew_v60_brew_fk',
			columns: [t.brewId, t.method],
			foreignColumns: [brews.id, brews.method]
		})
			.onDelete('cascade')
			.onUpdate('cascade'),
		check('brew_v60_method', sql`${t.method} = 'v60'`),
		check('brew_v60_filter', nullOrIn(t.filterType, FILTER_TYPES))
	]
);

export const pours = pgTable(
	'pours',
	{
		brewId: uuid('brew_id')
			.notNull()
			.references(() => brews.id, { onDelete: 'cascade' }),
		idx: smallint('idx').notNull(),
		volumeG: numeric('volume_g', { precision: 6, scale: 1, mode: 'number' }).notNull(),
		/** Seconds since the previous pour started; 0 for pour 1 (D12). */
		intervalS: integer('interval_s').notNull(),
		/** The brewer marked this pour as a bloom (D27). */
		bloom: boolean('bloom').notNull().default(false),
		/** Set when a scale measured the pour (D51): the running total and start it was aiming for. */
		plannedCumulativeG: numeric('planned_cumulative_g', {
			precision: 6,
			scale: 1,
			mode: 'number'
		}),
		plannedStartS: integer('planned_start_s'),
		/** How long the water ran, in seconds. */
		durationS: numeric('duration_s', { precision: 5, scale: 1, mode: 'number' })
	},
	(t) => [
		primaryKey({ columns: [t.brewId, t.idx] }),
		check('pours_idx', sql`${t.idx} BETWEEN 1 AND 50`),
		check('pours_volume', sql`${t.volumeG} > 0`),
		check('pours_planned_g', sql`${t.plannedCumulativeG} IS NULL OR ${t.plannedCumulativeG} > 0`),
		check('pours_planned_start', sql`${t.plannedStartS} IS NULL OR ${t.plannedStartS} >= 0`),
		check('pours_duration', sql`${t.durationS} IS NULL OR ${t.durationS} > 0`),
		check(
			'pours_interval',
			sql`(${t.idx} = 1 AND ${t.intervalS} = 0) OR (${t.idx} > 1 AND ${t.intervalS} > 0)`
		)
	]
);

// --- rating -----------------------------------------------------------------------------------

export const ratings = pgTable(
	'ratings',
	{
		brewId: uuid('brew_id')
			.primaryKey()
			.references(() => brews.id, { onDelete: 'cascade' }),
		/** Quality, higher = better. */
		overall: score('overall').notNull(),
		// Intensity sub-scores, higher = more of it (D7). Null = not recorded.
		acidity: score('acidity'),
		sweetness: score('sweetness'),
		body: score('body'),
		bitterness: score('bitterness'),
		astringency: score('astringency'),
		clarity: score('clarity'),
		/** Legacy (D22): no longer collected; old ratings keep their value. */
		aftertaste: score('aftertaste'),
		comment: text('comment'),
		...timestamps
	},
	(t) => [
		check('ratings_overall', isScore(t.overall, OVERALL_SCALE)),
		check('ratings_acidity', profileScore(t.acidity)),
		check('ratings_sweetness', profileScore(t.sweetness)),
		check('ratings_body', profileScore(t.body)),
		check('ratings_bitterness', profileScore(t.bitterness)),
		check('ratings_astringency', profileScore(t.astringency)),
		check('ratings_clarity', profileScore(t.clarity)),
		check('ratings_aftertaste', profileScore(t.aftertaste))
	]
);

export const ratingPerceivedNotes = pgTable(
	'rating_perceived_notes',
	{
		brewId: uuid('brew_id')
			.notNull()
			.references(() => ratings.brewId, { onDelete: 'cascade' }),
		flavorId: text('flavor_id')
			.notNull()
			.references(() => flavors.id)
	},
	(t) => [primaryKey({ columns: [t.brewId, t.flavorId] })]
);

// --- next-time plan ---------------------------------------------------------------------------

/**
 * What the brewer means to change next time (D25), 1:1 with a brew. Each column is null unless it
 * differs from the brew's own value, so a stored value is always a deliberate change; the row exists
 * only while at least one column is set.
 */
export const brewPlans = pgTable(
	'brew_plans',
	{
		brewId: uuid('brew_id')
			.primaryKey()
			.references(() => brews.id, { onDelete: 'cascade' }),
		waterTempC: numeric('water_temp_c', { precision: 4, scale: 1, mode: 'number' }),
		/** Water:dose. The next brew keeps the dose and changes the water. */
		ratio: numeric('ratio', { precision: 4, scale: 1, mode: 'number' }),
		grindSetting: numeric('grind_setting', { precision: 6, scale: 2, mode: 'number' }),
		pourCount: smallint('pour_count'),
		agitation: smallint('agitation'),
		notes: text('notes'),
		...timestamps
	},
	(t) => [
		check('brew_plans_temp', sql`${t.waterTempC} IS NULL OR ${t.waterTempC} BETWEEN 0 AND 100`),
		check('brew_plans_ratio', sql`${t.ratio} IS NULL OR ${t.ratio} BETWEEN 1 AND 50`),
		check('brew_plans_grind', sql`${t.grindSetting} IS NULL OR ${t.grindSetting} >= 0`),
		check('brew_plans_pours', sql`${t.pourCount} IS NULL OR ${t.pourCount} BETWEEN 1 AND 50`),
		check('brew_plans_agitation', agitationRange(t.agitation)),
		check(
			'brew_plans_nonempty',
			sql`num_nonnulls(${t.waterTempC}, ${t.ratio}, ${t.grindSetting}, ${t.pourCount}, ${t.agitation}, ${t.notes}) > 0`
		)
	]
);
