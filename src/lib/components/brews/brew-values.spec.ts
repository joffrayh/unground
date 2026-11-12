import { describe, expect, it } from 'vitest';
import {
	agreeingNotes,
	beanOptions,
	chooseId,
	dripperOptions,
	editValues,
	grinderOptions,
	hasPlanValues,
	newBrewValues,
	planFormValues,
	planValues,
	brewTemplates,
	templateFor,
	type TemplateBrew
} from './brew-values.ts';

const brew: TemplateBrew = {
	id: 'brew-1',
	brewedAt: new Date('2026-11-03T08:15:00Z'),
	timezone: 'UTC',
	beanName: 'Kochere',
	grinderName: 'Comandante',
	beanId: 'bean-1',
	grinderId: 'grinder-1',
	dripperId: 'dripper-1',
	grindSetting: 24,
	slowFed: true,
	doseG: 15.5,
	waterTempC: 94,
	agitation: 2,
	totalTimeS: 195,
	notes: 'stalled drawdown',
	details: {
		filterType: 'cafec_abaca',
		pours: [
			{ volumeG: 50, intervalS: 0, bloom: true },
			{ volumeG: 100, intervalS: 45, bloom: false },
			{ volumeG: 100, intervalS: 30, bloom: false }
		]
	},
	rating: {
		overall: 4,
		acidity: 3,
		sweetness: null,
		body: 2,
		bitterness: null,
		astringency: 1,
		clarity: 3.5,
		comment: 'juicy',
		perceivedNotes: ['fruity.berry']
	},
	plan: null
};

const plan = {
	waterTempC: null,
	ratio: 17,
	grindSetting: 26,
	pourCount: 4,
	agitation: 3,
	notes: 'Swirl less'
};

describe('editValues', () => {
	it('shows everything that was saved, as input strings', () => {
		const v = editValues({ ...brew, plan }, '2026-11-03T08:15');
		expect(v).toMatchObject({
			dripperId: 'dripper-1',
			grindSetting: '24',
			slowFed: true,
			doseG: '15.5',
			waterTempC: '94',
			agitation: '2',
			totalTime: '3:15',
			brewedAt: '2026-11-03T08:15',
			filterType: 'cafec_abaca',
			notes: 'stalled drawdown',
			templates: {},
			fallbackTemplate: null
		});
		expect(v.pours.map((r) => [r.time, r.scale, r.bloom, r.defaultScale])).toEqual([
			['0:00', '50', true, ''],
			['0:45', '150', false, ''],
			['1:15', '250', false, '']
		]);
		expect(v.rating).toMatchObject({
			overall: '4',
			sweetness: '',
			clarity: '3.5',
			comment: 'juicy'
		});
		expect(v.rating.perceivedNotes).toEqual(['fruity.berry']);
		expect(v.plan).toEqual({
			nextWaterTempC: '',
			nextRatio: '17',
			nextGrindSetting: '26',
			nextPourCount: '4',
			nextAgitation: '3',
			nextNotes: 'Swirl less'
		});
	});
});

describe('newBrewValues', () => {
	it('shows the recipe as placeholders, never the day’s measurements or notes (D15, D26)', () => {
		const v = newBrewValues(brew, '2026-11-04T07:00');
		expect(v).toMatchObject({
			beanId: 'bean-1',
			grinderId: 'grinder-1',
			dripperId: 'dripper-1',
			filterType: 'cafec_abaca',
			grindSetting: '',
			slowFed: true,
			doseG: '',
			waterTempC: '',
			agitation: '2',
			totalTime: '',
			brewedAt: '2026-11-04T07:00',
			notes: ''
		});
		expect(v.templates['bean-1'].defaults).toEqual({
			grindSetting: '24',
			grindSettingFor: 'grinder-1',
			doseG: '15.5',
			waterTempC: '94'
		});
		expect(v.templates['bean-1'].from).toMatchObject({ id: 'brew-1', beanName: 'Kochere' });
		expect(v.templates['bean-1'].suggestions).toBeNull();
		expect(v.pours.map((r) => [r.time, r.scale, r.bloom, r.defaultTime, r.defaultScale])).toEqual([
			['', '', true, '0:00', '50'],
			['', '', false, '0:45', '150'],
			['', '', false, '1:15', '250']
		]);
		expect(hasPlanValues(v.plan)).toBe(false);
	});

	it('starts the rating blank (D53)', () => {
		const v = newBrewValues(brew, 'x');
		expect(v.rating).toMatchObject({
			overall: '',
			acidity: '',
			clarity: '',
			comment: '',
			perceivedNotes: []
		});
		// The page adds each bean's last rating (D58).
		expect(v.lastRatings).toEqual({});
		expect(editValues(brew, 'x').lastRatings).toEqual({});
	});

	it('starts agitation at 3 when the template recorded none', () => {
		expect(newBrewValues({ ...brew, agitation: null }, 'x').agitation).toBe('3');
	});

	it('turns the template’s plan into suggestions for its bean, from its values (D25, D58)', () => {
		const v = newBrewValues({ ...brew, plan }, 'x');
		expect(Object.keys(v.templates)).toEqual(['bean-1']);
		expect(v.templates['bean-1'].suggestions).toEqual({
			grindSetting: { from: '24', to: '26', grindFor: 'grinder-1' },
			waterTempC: null,
			agitation: { from: '2', to: '3' },
			ratio: { from: 16.1, to: 17 },
			pourCount: { from: 3, to: 4 },
			notes: 'Swirl less',
			pours: brew.details.pours
		});
		expect(v.templates['bean-1'].suggestions?.pours).not.toBe(brew.details.pours);
	});

	it('starts each bean from its last brew, a bean never brewed from the template (D58, D60)', () => {
		const other: TemplateBrew = {
			...brew,
			id: 'brew-2',
			beanId: 'bean-2',
			doseG: 18,
			grindSetting: 20,
			plan: { ...plan, grindSetting: 21 }
		};
		const unplanned = { ...brew, id: 'brew-3', beanId: 'bean-3' };
		const olderSameBean = { ...brew, id: 'brew-0', doseG: 12, plan: { ...plan, grindSetting: 30 } };
		const t = brewTemplates({ ...brew, plan }, [other, unplanned, olderSameBean]);
		expect(Object.keys(t.templates).sort()).toEqual(['bean-1', 'bean-2', 'bean-3']);
		// The page's template speaks for its own bean, so copying an older brew starts from it.
		expect(t.templates['bean-1'].from.id).toBe('brew-1');
		expect(t.templates['bean-1'].suggestions?.grindSetting).toMatchObject({ to: '26' });
		expect(t.templates['bean-2'].defaults).toMatchObject({ doseG: '18', grindSetting: '20' });
		expect(t.templates['bean-2'].suggestions?.grindSetting).toMatchObject({ from: '20', to: '21' });
		expect(t.templates['bean-3'].suggestions).toBeNull();
		// A bean never brewed starts from the template's recipe, but not its plan: that was for its bean.
		expect(templateFor(t, 'bean-9')?.from.id).toBe('brew-1');
		expect(templateFor(t, 'bean-9')?.suggestions).toBeNull();
		expect(templateFor(t, 'bean-2')?.from.id).toBe('brew-2');
		expect(templateFor(brewTemplates(null), 'bean-1')).toBeNull();
		expect(templateFor(editValues(brew, 'x'), 'bean-1')).toBeNull();
	});

	it('lets the bean, grinder and dripper be overridden', () => {
		const v = newBrewValues(brew, 'x', {
			beanId: 'bean-2',
			grinderId: 'grinder-2',
			dripperId: ''
		});
		expect(v).toMatchObject({ beanId: 'bean-2', grinderId: 'grinder-2', dripperId: '' });
		// The grind placeholder still names its own grinder; the form ignores it on grinder-2.
		expect(templateFor(v, 'bean-2')?.defaults.grindSettingFor).toBe('grinder-1');
	});

	it('starts blank without a template, pour 0 ticked as a bloom', () => {
		const v = newBrewValues(null, '2026-11-04T07:00', { beanId: 'bean-2' });
		expect(v).toMatchObject({ beanId: 'bean-2', grinderId: '', doseG: '', agitation: '3' });
		expect(v.pours).toEqual([
			{ time: '', scale: '', bloom: true, defaultTime: '', defaultScale: '' }
		]);
		expect(templateFor(v, 'bean-2')).toBeNull();
	});

	it('does not share arrays with the template', () => {
		const v = editValues(brew, 'x');
		v.rating.perceivedNotes.push('sweet');
		v.pours[0].bloom = false;
		expect(brew.rating?.perceivedNotes).toEqual(['fruity.berry']);
		expect(brew.details.pours[0].bloom).toBe(true);
	});
});

describe('plan values', () => {
	it('round-trips a stored plan and reads a failed submit', () => {
		expect(planValues(null)).toEqual({
			nextWaterTempC: '',
			nextRatio: '',
			nextGrindSetting: '',
			nextPourCount: '',
			nextAgitation: '',
			nextNotes: ''
		});
		const posted = { values: { nextRatio: '17.5', nextNotes: 'finer' } };
		expect(planFormValues(posted, planValues(plan))).toMatchObject({
			nextRatio: '17.5',
			nextGrindSetting: '',
			nextNotes: 'finer'
		});
		expect(hasPlanValues(planValues(plan))).toBe(true);
	});
});

describe('picker options', () => {
	const archivedAt = new Date('2026-10-01T00:00:00Z');
	const beans = [
		{ id: 'a', name: 'Kochere', roasterName: 'Square Mile', archivedAt: null },
		{ id: 'b', name: 'Old bag', roasterName: 'Square Mile', archivedAt },
		{ id: 'c', name: 'Older bag', roasterName: 'Origin', archivedAt }
	];

	it('lists active beans, plus the archived ones asked for, marked archived', () => {
		expect(beanOptions(beans)).toEqual([
			{ id: 'a', label: 'Kochere · Square Mile', archived: false }
		]);
		expect(beanOptions(beans, ['b']).map((o) => [o.id, o.archived])).toEqual([
			['a', false],
			['b', true]
		]);
	});

	it('carries the grinder unit', () => {
		expect(
			grinderOptions([{ id: 'g', name: 'C40', settingUnit: 'clicks', archivedAt: null }])
		).toEqual([{ id: 'g', label: 'C40', unit: 'clicks', archived: false }]);
	});

	it('lists active drippers plus the kept archived one', () => {
		const archivedAt = new Date('2026-10-01T00:00:00Z');
		const all = [
			{ id: 'd1', name: 'V60 02', archivedAt: null },
			{ id: 'd2', name: 'Origami', archivedAt }
		];
		expect(dripperOptions(all)).toEqual([{ id: 'd1', label: 'V60 02', archived: false }]);
		expect(dripperOptions(all, ['d2'])).toHaveLength(2);
	});

	it('chooseId keeps a listed id and falls back to the first option', () => {
		const opts = [{ id: 'a' }, { id: 'b' }];
		expect(chooseId('b', opts)).toBe('b');
		expect(chooseId('zzz', opts)).toBe('a');
		expect(chooseId(null, opts)).toBe('a');
		expect(chooseId('a', [])).toBe('');
	});
});

describe('agreeingNotes', () => {
	it('matches the same tag or a broader / narrower tier of it', () => {
		expect(
			agreeingNotes(
				['fruity.berry', 'sweet.brown_sugar', 'roasted', 'floral.floral.jasmine'],
				['fruity.berry.blueberry', 'roasted.cereal', 'floral.black_tea']
			)
		).toEqual(['fruity.berry', 'roasted']);
	});

	it('does not match tags that merely share a prefix', () => {
		expect(agreeingNotes(['fruity.berry'], ['fruity.berryish'])).toEqual([]);
	});
});
