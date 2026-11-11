import { describe, expect, it } from 'vitest';
import {
	parseBeanForm,
	parseBrewForm,
	parseDripperForm,
	parsePlanForm,
	parseRoasterForm,
	parseSignupForm
} from './schemas';

const BEAN = '0b9a3a0e-6c9c-4c3e-9a51-8c1f6d2b7e10';
const GRINDER = '7f1d2c3b-4a5e-4f60-8b7a-9c0d1e2f3a4b';
const OTHER_GRINDER = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const DRIPPER = '9e8d7c6b-5a4f-4e3d-9c2b-1a0f9e8d7c6b';

function form(fields: Record<string, string | string[]>): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x);
	return fd;
}

function brewForm(overrides: Record<string, string | string[]> = {}): FormData {
	return form({
		beanId: BEAN,
		grinderId: GRINDER,
		method: 'v60',
		brewedAt: '2026-11-03T08:15',
		grindSetting: '24',
		doseG: '15',
		waterTempC: '94',
		totalTime: '3:15',
		pourTime: ['0:00', '0:45', '1:15', ''],
		pourScale: ['50', '150', '250', ''],
		pourBloom: ['0'],
		agitation: '3',
		...overrides
	});
}

describe('parseBrewForm, measured by a scale (D51)', () => {
	const pours = (result: ReturnType<typeof parseBrewForm>) => {
		if (!result.ok) throw new Error(JSON.stringify(result.errors));
		return result.data.brew.details.pours;
	};

	it('keeps each pour’s plan and duration on its own row, and the scale', () => {
		const result = parseBrewForm(
			brewForm({
				scaleId: BEAN,
				pourPlannedG: ['45', '150', '', ''],
				pourPlannedStart: ['0', '45', '', ''],
				pourDuration: ['3.5', '4.04', '', '']
			}),
			'Europe/London'
		);
		expect(pours(result)).toMatchObject([
			{ plannedCumulativeG: 45, plannedStartS: 0, durationS: 3.5 },
			{ plannedCumulativeG: 150, plannedStartS: 45, durationS: 4 },
			{ volumeG: 100 }
		]);
		expect(pours(result)[2]).not.toHaveProperty('plannedCumulativeG');
		expect(result.ok && result.data.brew.scaleId).toBe(BEAN);
	});

	it('has none of it on a brew logged by hand', () => {
		const result = parseBrewForm(brewForm(), 'Europe/London');
		expect(pours(result)[0]).toEqual({ volumeG: 50, intervalS: 0, bloom: true });
		expect(result.ok && result.data.brew.scaleId).toBeNull();
	});

	it.each([
		['not a number', 'x'],
		['negative', '-5'],
		['too large', '99999']
	])('ignores a planned amount that is %s', (_name, value) => {
		const result = parseBrewForm(brewForm({ pourPlannedG: [value] }), 'Europe/London');
		expect(pours(result)[0]).not.toHaveProperty('plannedCumulativeG');
	});

	it('drops a dropped row’s measurement with it', () => {
		const result = parseBrewForm(
			brewForm({
				pourRow: ['a', 'b', 'c', 'd'],
				pourBloom: [],
				pourDrop: ['b'],
				pourTime: ['0:00', '0:45', '1:15', ''],
				pourScale: ['50', '150', '250', ''],
				pourPlannedG: ['45', '150', '240', '']
			}),
			'Europe/London'
		);
		expect(pours(result).map((p) => p.plannedCumulativeG)).toEqual([45, 240]);
	});

	it('rejects a scale id that is not an id', () => {
		const result = parseBrewForm(brewForm({ scaleId: 'nope' }), 'Europe/London');
		expect(result.ok).toBe(false);
	});
});

describe('parseBrewForm', () => {
	it('parses a complete brew and converts pours, times and the local time zone', () => {
		const result = parseBrewForm(
			brewForm({ overall: '4', acidity: '2.5', perceivedNotes: ['fruity.berry'] }),
			'Europe/London'
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const { brew, rating } = result.data;
		expect(brew).toMatchObject({
			timezone: 'Europe/London',
			grindSetting: 24,
			slowFed: false,
			doseG: 15,
			waterTempC: 94,
			agitation: 3,
			totalTimeS: 195,
			dripperId: null,
			notes: null,
			details: {
				filterType: null,
				pours: [
					{ volumeG: 50, intervalS: 0, bloom: true },
					{ volumeG: 100, intervalS: 45, bloom: false },
					{ volumeG: 100, intervalS: 30, bloom: false }
				]
			}
		});
		expect(result.data.plan).toBeNull();
		expect(brew.brewedAt.toISOString()).toBe('2026-11-03T08:15:00.000Z');
		expect(rating).toMatchObject({
			overall: 4,
			acidity: 2.5,
			sweetness: null,
			perceivedNotes: ['fruity.berry']
		});
	});

	it('accepts comma decimals and an omitted bloom time', () => {
		const result = parseBrewForm(
			brewForm({ doseG: '15,5', pourTime: ['', '0:40'], pourScale: ['45', '255'] }),
			'UTC'
		);
		expect(result.ok && result.data.brew.doseG).toBe(15.5);
		expect(result.ok && result.data.brew.details.pours[0]).toEqual({
			volumeG: 45,
			intervalS: 0,
			bloom: true
		});
	});

	it('reads the slow-fed tick box (D56)', () => {
		const result = parseBrewForm(brewForm({ slowFed: 'on' }), 'UTC');
		expect(result.ok && result.data.brew.slowFed).toBe(true);
	});

	it('takes the split Cafec filters and refuses the old one (D56)', () => {
		const filter = (filterType: string) => parseBrewForm(brewForm({ filterType }), 'UTC');
		expect(filter('cafec_abaca')).toMatchObject({
			ok: true,
			data: { brew: { details: { filterType: 'cafec_abaca' } } }
		});
		expect(filter('cafec')).toMatchObject({
			ok: false,
			errors: { filterType: expect.any(String) }
		});
	});

	it('treats a blank rating section as "rate later"', () => {
		const result = parseBrewForm(brewForm(), 'UTC');
		expect(result.ok && result.data.rating).toBeNull();
	});

	it('requires an overall score when any other rating field is filled', () => {
		const result = parseBrewForm(brewForm({ acidity: '3.5' }), 'UTC');
		expect(result).toMatchObject({ ok: false, errors: { overall: expect.any(String) } });
	});

	it('takes overall from 0.25 to 5 in quarters and the profile in halves (D55)', () => {
		const parse = (overall: string, acidity = '') =>
			parseBrewForm(brewForm({ overall, acidity }), 'UTC');
		expect(parse('0.25', '5')).toMatchObject({
			ok: true,
			data: { rating: { overall: 0.25, acidity: 5 } }
		});
		expect(parse('3,75')).toMatchObject({ ok: true, data: { rating: { overall: 3.75 } } });
		expect(parse('0')).toMatchObject({ ok: false, errors: { overall: 'Min 0.25' } });
		expect(parse('5.25')).toMatchObject({ ok: false, errors: { overall: 'Max 5' } });
		expect(parse('3.3')).toMatchObject({
			ok: false,
			errors: { overall: 'Must be in steps of 0.25' }
		});
		// The taste profile is coarser: 0.5–5 in halves.
		expect(parse('4', '0.5')).toMatchObject({ ok: true, data: { rating: { acidity: 0.5 } } });
		expect(parse('4', '0.25')).toMatchObject({ ok: false, errors: { acidity: 'Min 0.5' } });
		expect(parse('4', '2.25')).toMatchObject({
			ok: false,
			errors: { acidity: 'Must be in steps of 0.5' }
		});
	});

	it('reports missing and invalid fields by name', () => {
		const result = parseBrewForm(
			brewForm({ doseG: '', grindSetting: 'fine', totalTime: 'soon', beanId: '' }),
			'UTC'
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors.doseG).toBe('Required');
		expect(result.errors.grindSetting).toBe('Must be a number');
		expect(result.errors.beanId).toBeDefined();
	});

	it('rejects a total time before the last pour starts', () => {
		const result = parseBrewForm(brewForm({ totalTime: '1:00' }), 'UTC');
		expect(result).toMatchObject({ ok: false, errors: { totalTime: expect.any(String) } });
	});

	it('rejects a typo that would exceed the water limit instead of failing in the database', () => {
		const result = parseBrewForm(
			brewForm({ pourTime: ['0:00', '0:45'], pourScale: ['50', '25000'] }),
			'UTC'
		);
		expect(result).toMatchObject({ ok: false, errors: { pours: expect.stringContaining('5000') } });
	});

	it('rejects readings that only differ beyond 0.1 g (would be a 0 g pour)', () => {
		const result = parseBrewForm(
			brewForm({ pourTime: ['0:00', '0:30', '1:00'], pourScale: ['50', '50.04', '250'] }),
			'UTC'
		);
		expect(result).toMatchObject({ ok: false, errors: { pours: expect.any(String) } });
	});

	it('rejects more decimals than are stored', () => {
		const result = parseBrewForm(brewForm({ grindSetting: '5.333', doseG: '15.25' }), 'UTC');
		expect(result).toMatchObject({
			ok: false,
			errors: { grindSetting: expect.any(String), doseG: expect.any(String) }
		});
	});

	it('ignores a posted "what changed" (legacy, D25)', () => {
		const result = parseBrewForm(brewForm({ changed: ['vibes'] }), 'UTC');
		expect(result.ok && 'changed' in result.data.brew).toBe(false);
	});

	it('marks the ticked rows as blooms, by posted row position', () => {
		// Rows 0 and 1 are ticked; blank row 2 is skipped, so the third kept pour isn't a bloom.
		const result = parseBrewForm(
			brewForm({
				pourTime: ['0:00', '0:30', '', '1:15'],
				pourScale: ['30', '60', '', '250'],
				pourBloom: ['0', '1']
			}),
			'UTC'
		);
		expect(result.ok && result.data.brew.details.pours.map((p) => p.bloom)).toEqual([
			true,
			true,
			false
		]);
		const after = parseBrewForm(
			brewForm({
				pourTime: ['0:00', '', '0:45', '1:15'],
				pourScale: ['50', '', '150', '250'],
				pourBloom: ['3']
			}),
			'UTC'
		);
		expect(after.ok && after.data.brew.details.pours.map((p) => p.bloom)).toEqual([
			false,
			false,
			true
		]);
		const none = parseBrewForm(brewForm({ pourBloom: [] }), 'UTC');
		expect(none.ok && none.data.brew.details.pours.some((p) => p.bloom)).toBe(false);
	});

	it('matches bloom ticks to row ids, whatever rows the editor removed', () => {
		const result = parseBrewForm(
			brewForm({
				pourRow: ['k0', 'k5', 'k9'],
				pourTime: ['0:00', '0:30', '1:15'],
				pourScale: ['30', '60', '250'],
				pourBloom: ['k0', 'k5']
			}),
			'UTC'
		);
		expect(result.ok && result.data.brew.details.pours.map((p) => p.bloom)).toEqual([
			true,
			true,
			false
		]);
	});

	it('names pours from 0 in errors', () => {
		const result = parseBrewForm(
			brewForm({ pourTime: ['0:00', 'soon', ''], pourScale: ['50', '150', ''] }),
			'UTC'
		);
		expect(result).toMatchObject({
			ok: false,
			errors: { pours: 'Pour 1: time must look like 1:30' }
		});
	});

	it('reads the dripper and agitation, both optional', () => {
		const set = parseBrewForm(brewForm({ dripperId: DRIPPER, agitation: '5' }), 'UTC');
		expect(set.ok && set.data.brew).toMatchObject({ dripperId: DRIPPER, agitation: 5 });
		const blank = parseBrewForm(brewForm({ dripperId: '', agitation: '' }), 'UTC');
		expect(blank.ok && blank.data.brew).toMatchObject({ dripperId: null, agitation: null });
		expect(parseBrewForm(brewForm({ agitation: '6' }), 'UTC')).toMatchObject({
			ok: false,
			errors: { agitation: expect.any(String) }
		});
		expect(parseBrewForm(brewForm({ dripperId: 'nope' }), 'UTC').ok).toBe(false);
	});

	describe('placeholders (D26)', () => {
		const blankRecipe = {
			grindSetting: '',
			doseG: '',
			waterTempC: '',
			pourTime: ['0:00', '', ''],
			pourScale: ['', '', ''],
			grindSettingDefault: '22',
			grindSettingDefaultFor: GRINDER,
			doseGDefault: '16',
			waterTempCDefault: '93',
			pourTimeDefault: ['0:00', '0:40', '1:20'],
			pourScaleDefault: ['45', '150', '256']
		};

		it('saves the placeholder of every field left blank', () => {
			const result = parseBrewForm(brewForm(blankRecipe), 'UTC');
			expect(result.ok && result.data.brew).toMatchObject({
				grindSetting: 22,
				doseG: 16,
				waterTempC: 93,
				details: {
					pours: [
						{ volumeG: 45, intervalS: 0, bloom: true },
						{ volumeG: 105, intervalS: 40, bloom: false },
						{ volumeG: 106, intervalS: 40, bloom: false }
					]
				}
			});
		});

		it('lets typed values win, cell by cell', () => {
			const result = parseBrewForm(
				brewForm({ ...blankRecipe, grindSetting: '24', pourScale: ['', '160', ''] }),
				'UTC'
			);
			expect(result.ok && result.data.brew.grindSetting).toBe(24);
			expect(result.ok && result.data.brew.details.pours.map((p) => p.volumeG)).toEqual([
				45, 115, 96
			]);
		});

		it('only uses the grind placeholder on the grinder it came from', () => {
			const result = parseBrewForm(brewForm({ ...blankRecipe, grinderId: OTHER_GRINDER }), 'UTC');
			expect(result).toMatchObject({ ok: false, errors: { grindSetting: 'Required' } });
		});

		it('lets a no-JS form drop a placeholder row ("drop" box, by row id)', () => {
			const result = parseBrewForm(
				brewForm({
					...blankRecipe,
					pourRow: ['a', 'b', 'c'],
					pourBloom: ['a'],
					pourDrop: ['b']
				}),
				'UTC'
			);
			expect(result.ok && result.data.brew.details.pours).toEqual([
				{ volumeG: 45, intervalS: 0, bloom: true },
				{ volumeG: 211, intervalS: 80, bloom: false }
			]);
			const positional = parseBrewForm(brewForm({ ...blankRecipe, pourDrop: ['2'] }), 'UTC');
			expect(positional.ok && positional.data.brew.details.pours.map((p) => p.volumeG)).toEqual([
				45, 105
			]);
		});

		it('drops a removed row together with its placeholders', () => {
			// The editor removes a row's inputs and hidden defaults together, so the arrays stay aligned.
			const result = parseBrewForm(
				brewForm({
					...blankRecipe,
					pourTime: ['0:00', ''],
					pourScale: ['', ''],
					pourTimeDefault: ['0:00', '1:20'],
					pourScaleDefault: ['45', '256']
				}),
				'UTC'
			);
			expect(result.ok && result.data.brew.details.pours.map((p) => p.volumeG)).toEqual([45, 211]);
		});

		it('saves an extrapolated time placeholder, but a time placeholder alone is a spare row', () => {
			// A first brew: no recipe placeholders, only the editor's estimated start times.
			const result = parseBrewForm(
				brewForm({
					pourTime: ['0:00', '', '', ''],
					pourScale: ['50', '150', '250', ''],
					pourTimeDefault: ['', '0:45', '1:30', '2:15'],
					pourScaleDefault: ['', '', '', '']
				}),
				'UTC'
			);
			expect(result.ok && result.data.brew.details.pours).toEqual([
				{ volumeG: 50, intervalS: 0, bloom: true },
				{ volumeG: 100, intervalS: 45, bloom: false },
				{ volumeG: 100, intervalS: 45, bloom: false }
			]);
		});
	});

	it('reads the next-time plan as entered', () => {
		const result = parseBrewForm(
			brewForm({ nextRatio: '17', nextGrindSetting: '26', nextNotes: ' swirl less ' }),
			'UTC'
		);
		expect(result.ok && result.data.plan).toEqual({
			waterTempC: null,
			ratio: 17,
			grindSetting: 26,
			pourCount: null,
			agitation: null,
			notes: 'swirl less'
		});
		expect(parseBrewForm(brewForm({ nextAgitation: '9' }), 'UTC')).toMatchObject({
			ok: false,
			errors: { nextAgitation: expect.any(String) }
		});
	});

	it('rejects impossible and implausible dates', () => {
		expect(parseBrewForm(brewForm({ brewedAt: '2026-02-30T08:00' }), 'UTC')).toMatchObject({
			ok: false,
			errors: { brewedAt: expect.any(String) }
		});
		expect(parseBrewForm(brewForm({ brewedAt: '1999-12-31T08:00' }), 'UTC').ok).toBe(false);
		expect(parseBrewForm(brewForm({ brewedAt: '2999-01-01T08:00' }), 'UTC').ok).toBe(false);
	});

	it('rejects unknown flavor notes', () => {
		expect(parseBrewForm(brewForm({ overall: '3.5', perceivedNotes: ['made.up'] }), 'UTC').ok).toBe(
			false
		);
	});
});

describe('parseBeanForm', () => {
	const bean = (overrides: Record<string, string | string[]> = {}) =>
		parseBeanForm(form({ name: 'Kochere', roasterName: 'Square Mile', ...overrides }));

	it('turns blanks into null and a single altitude into a range', () => {
		const result = bean({ altitudeMinM: '1950', process: '', farm: ' ' });
		expect(result).toMatchObject({
			ok: true,
			data: {
				altitudeMinM: 1950,
				altitudeMaxM: 1950,
				process: null,
				farm: null,
				decaf: false,
				roasterNotes: []
			}
		});
	});

	it('validates vocabularies and altitude order', () => {
		expect(bean({ process: 'magic' }).ok).toBe(false);
		expect(bean({ country: 'XX' }).ok).toBe(false);
		expect(bean({ altitudeMinM: '2000', altitudeMaxM: '1500' })).toMatchObject({
			ok: false,
			errors: { altitudeMaxM: expect.any(String) }
		});
	});

	it('rejects a roast date in the future', () => {
		expect(bean({ roastDate: '2999-01-01' })).toMatchObject({
			ok: false,
			errors: { roastDate: expect.any(String) }
		});
	});

	it('reads the bag weight and price', () => {
		expect(bean({ bagWeightG: '250', bagPrice: '14,50' })).toMatchObject({
			ok: true,
			data: { bagWeightG: 250, bagPrice: 14.5 }
		});
		expect(bean()).toMatchObject({ ok: true, data: { bagWeightG: null, bagPrice: null } });
		expect(bean({ bagWeightG: '0' }).ok).toBe(false);
		expect(bean({ bagPrice: '1.234' }).ok).toBe(false);
	});

	it('reads checkboxes and de-duplicates notes', () => {
		const result = bean({ decaf: 'on', roasterNotes: ['fruity.berry', 'fruity.berry'] });
		expect(result).toMatchObject({
			ok: true,
			data: { decaf: true, storedFrozen: false, roasterNotes: ['fruity.berry'] }
		});
	});
});

describe('other forms', () => {
	it('reads a dripper with an optional material', () => {
		expect(parseDripperForm(form({ name: 'Origami', material: 'ceramic' }))).toMatchObject({
			ok: true,
			data: { name: 'Origami', material: 'ceramic' }
		});
		expect(parseDripperForm(form({ name: 'Origami', material: '' }))).toMatchObject({
			ok: true,
			data: { material: null }
		});
		expect(parseDripperForm(form({ name: ' ', material: 'wood' })).ok).toBe(false);
	});

	it('reads a plan form, blank meaning no plan', () => {
		expect(parsePlanForm(form({ nextWaterTempC: '', nextNotes: '' }))).toEqual({
			ok: true,
			data: null
		});
		expect(parsePlanForm(form({ nextPourCount: '4' }))).toMatchObject({
			ok: true,
			data: { pourCount: 4, ratio: null }
		});
		expect(parsePlanForm(form({ nextPourCount: '2.5' })).ok).toBe(false);
	});

	it('only accepts http(s) roaster websites', () => {
		expect(
			parseRoasterForm(form({ name: 'R', website: 'javascript:alert(document.cookie)' })).ok
		).toBe(false);
		expect(parseRoasterForm(form({ name: 'R', website: 'https://example.com' })).ok).toBe(true);
	});

	it('normalises sign-up email and enforces password length', () => {
		expect(
			parseSignupForm(form({ email: ' Ada@Example.COM ', password: 'long enough pw' }))
		).toMatchObject({
			ok: true,
			data: { email: 'ada@example.com', timezone: 'UTC' }
		});
		expect(parseSignupForm(form({ email: 'ada@example.com', password: 'short' })).ok).toBe(false);
	});
});
