/**
 * Controlled vocabularies (concept.md §4, D18).
 *
 * These arrays are the single source of truth: the database CHECK constraints,
 * the Zod validators and the form <select>s are all generated from them.
 * Append new values at the end; never rename or remove a stored value.
 */

export const BREW_METHODS = ['v60'] as const;
export type BrewMethod = (typeof BREW_METHODS)[number];

export const PROCESSES = [
	'washed',
	'natural',
	'honey',
	'anaerobic',
	'carbonic_maceration',
	'co_ferment',
	'wet_hulled',
	'other'
] as const;
export type Process = (typeof PROCESSES)[number];

export const ROAST_LEVELS = ['light', 'medium_light', 'medium', 'medium_dark', 'dark'] as const;
export type RoastLevel = (typeof ROAST_LEVELS)[number];

export const DRIPPER_MATERIALS = ['plastic', 'ceramic', 'glass', 'metal'] as const;
export type DripperMaterial = (typeof DRIPPER_MATERIALS)[number];

export const FILTER_TYPES = [
	'hario_tabbed',
	'hario_tabless',
	'cafec',
	'sibarist',
	'other'
] as const;
export type FilterType = (typeof FILTER_TYPES)[number];

/**
 * What the user deliberately changed versus their previous brew (D16). No longer asked in the form
 * (the "next time" plan replaced it, D25); kept so stored values stay valid.
 */
export const CHANGED_VARIABLES = [
	'nothing',
	'grind',
	'dose',
	'water',
	'temperature',
	'pours',
	'bean',
	'equipment',
	'technique'
] as const;
export type ChangedVariable = (typeof CHANGED_VARIABLES)[number];

/**
 * Rating sub-scores the form collects: intensity, higher = more of it (D7). Order is display order
 * (clockwise from the top of the radar chart).
 */
export const RATING_DIMENSIONS = [
	'acidity',
	'sweetness',
	'body',
	'bitterness',
	'astringency',
	'clarity'
] as const;
export type RatingDimension = (typeof RATING_DIMENSIONS)[number];

/**
 * Sub-scores that are still stored but no longer collected (D22). Old ratings keep them, and saving a
 * rating never overwrites them.
 */
export const LEGACY_RATING_DIMENSIONS = ['aftertaste'] as const;
export type LegacyRatingDimension = (typeof LEGACY_RATING_DIMENSIONS)[number];

export const SCORE_MIN = 1;
export const SCORE_MAX = 10;

/** Agitation (swirl / stir), unitless 0 none … 5 a lot (D24). New brews start at the default. */
export const AGITATION_MIN = 0;
export const AGITATION_MAX = 5;
export const AGITATION_DEFAULT = 3;

export const LABELS: Record<string, string> = {
	v60: 'V60',
	washed: 'Washed',
	natural: 'Natural',
	honey: 'Honey',
	anaerobic: 'Anaerobic',
	carbonic_maceration: 'Carbonic maceration',
	co_ferment: 'Co-ferment',
	wet_hulled: 'Wet-hulled',
	other: 'Other',
	light: 'Light',
	medium_light: 'Medium-light',
	medium: 'Medium',
	medium_dark: 'Medium-dark',
	dark: 'Dark',
	plastic: 'Plastic',
	ceramic: 'Ceramic',
	glass: 'Glass',
	metal: 'Metal',
	hario_tabbed: 'Hario (tabbed)',
	hario_tabless: 'Hario (tabless)',
	cafec: 'Cafec',
	sibarist: 'Sibarist',
	nothing: 'Nothing (repeat)',
	grind: 'Grind',
	dose: 'Dose',
	water: 'Water amount',
	temperature: 'Temperature',
	pours: 'Pour structure',
	bean: 'Bean',
	equipment: 'Equipment',
	technique: 'Technique',
	acidity: 'Acidity',
	sweetness: 'Sweetness',
	body: 'Body',
	bitterness: 'Bitterness',
	astringency: 'Astringency',
	clarity: 'Clarity',
	aftertaste: 'Aftertaste'
};

/** What a high sub-score means, shown next to each slider so the scale stays consistent over time. */
export const DIMENSION_HINTS: Record<RatingDimension | LegacyRatingDimension, string> = {
	acidity: '1 flat · 10 very bright',
	sweetness: '1 none · 10 very sweet',
	body: '1 thin · 10 heavy',
	bitterness: '1 none · 10 very bitter',
	astringency: '1 smooth · 10 very drying',
	clarity: '1 muddy · 10 clean, distinct',
	aftertaste: '1 short · 10 long, strong'
};

export function label(value: string | null | undefined): string {
	if (value == null) return '—';
	return LABELS[value] ?? value;
}

/**
 * Coffee-producing countries (ISO 3166-1 alpha-2). Kept as a curated list so the picker stays short;
 * add codes as needed.
 */
export const COUNTRIES: Record<string, string> = {
	BO: 'Bolivia',
	BR: 'Brazil',
	BI: 'Burundi',
	CM: 'Cameroon',
	CN: 'China',
	CO: 'Colombia',
	CD: 'DR Congo',
	CR: 'Costa Rica',
	CU: 'Cuba',
	DO: 'Dominican Republic',
	EC: 'Ecuador',
	SV: 'El Salvador',
	ET: 'Ethiopia',
	GT: 'Guatemala',
	HT: 'Haiti',
	HN: 'Honduras',
	IN: 'India',
	ID: 'Indonesia',
	JM: 'Jamaica',
	KE: 'Kenya',
	LA: 'Laos',
	MG: 'Madagascar',
	MW: 'Malawi',
	MX: 'Mexico',
	MM: 'Myanmar',
	NP: 'Nepal',
	NI: 'Nicaragua',
	PA: 'Panama',
	PG: 'Papua New Guinea',
	PE: 'Peru',
	PH: 'Philippines',
	RW: 'Rwanda',
	TZ: 'Tanzania',
	TH: 'Thailand',
	TL: 'Timor-Leste',
	UG: 'Uganda',
	US: 'United States (Hawaiʻi)',
	VE: 'Venezuela',
	VN: 'Vietnam',
	YE: 'Yemen',
	ZM: 'Zambia',
	ZW: 'Zimbabwe'
};
export const COUNTRY_CODES = Object.keys(COUNTRIES) as [string, ...string[]];
