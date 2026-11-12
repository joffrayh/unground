import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearBrewDraft,
	readBrewDraft,
	resumeBrewDraft,
	writeBrewDraft,
	type BrewDraft,
	type DraftContext
} from './brew-draft.ts';
import { brewTemplates, newBrewValues, type TemplateBrew } from './brew-values.ts';

const brewOf = (id: string, beanId: string, doseG: number): TemplateBrew => ({
	id,
	brewedAt: new Date('2026-11-08T08:00:00Z'),
	timezone: 'UTC',
	beanName: beanId,
	grinderName: 'Comandante',
	beanId,
	grinderId: 'g1',
	dripperId: null,
	grindSetting: 24,
	slowFed: false,
	doseG,
	waterTempC: 94,
	agitation: null,
	totalTimeS: 180,
	notes: null,
	details: { filterType: null, pours: [{ volumeG: 250, intervalS: 0, bloom: false }] },
	rating: null,
	plan: null
});

const option = (id: string) => ({ id, label: id, archived: false, unit: null });
const url = (search = '') => new URLSearchParams(search);

function draft(fields: BrewDraft['fields'] = {}): BrewDraft {
	// Asked to copy an older brew of b1 (15 g); b1's last brew used 17 g.
	const values = newBrewValues(brewOf('brew-x', 'b1', 15), '2026-11-09T08:00');
	Object.assign(values, brewTemplates(brewOf('brew-x', 'b1', 15), [brewOf('brew-y', 'b1', 17)]));
	return {
		fields: { beanId: 'b1', grinderId: 'g1', dripperId: 'd1', doseG: '16', ...fields },
		values,
		copiedFrom: { id: 'brew-x', beanName: 'b1', explicit: true, beanReset: false }
	};
}

// The plain Add Brew page: it would start b1 from its last brew, and b2 from its own.
const context: DraftContext = {
	values: {
		...newBrewValues(brewOf('brew-y', 'b1', 17), '2026-11-09T09:00'),
		...brewTemplates(brewOf('brew-y', 'b1', 17), [brewOf('brew-z', 'b2', 20)]),
		beanId: 'b2',
		grinderId: 'g2',
		dripperId: 'd2'
	},
	beans: [option('b1'), option('b2')],
	grinders: [option('g1'), option('g2')],
	drippers: [option('d1'), option('d2')]
};

describe('resumeBrewDraft', () => {
	it('keeps what was typed on the plain Add Brew URL, with the template it started from', () => {
		const resumed = resumeBrewDraft(draft(), url(), context);
		expect(resumed?.fields).toMatchObject({ beanId: 'b1', grinderId: 'g1', doseG: '16' });
		expect(resumed?.copiedFrom?.id).toBe('brew-x');
		expect(resumed?.values.templates.b1.defaults.doseG).toBe('15');
	});

	it('takes the page’s latest brews and ratings by bean (D58, D60)', () => {
		const fresh: DraftContext = {
			...context,
			values: { ...context.values, lastRatings: { b1: { overall: '4' } as never } }
		};
		const resumed = resumeBrewDraft(draft(), url(), fresh);
		expect(resumed?.values.lastRatings).toEqual({ b1: { overall: '4' } });
		expect(resumed?.values.templates.b2.defaults.doseG).toBe('20');
		// Not asked to copy a brew, b1 starts from its last one too.
		const plain = resumeBrewDraft({ ...draft(), copiedFrom: null }, url(), fresh);
		expect(plain?.values.templates.b1.defaults.doseG).toBe('17');
	});

	it('is not shown over a request to copy a different brew', () => {
		expect(resumeBrewDraft(draft(), url('?from=brew-x'), context)).not.toBeNull();
		expect(resumeBrewDraft(draft(), url('?from=brew-y'), context)).toBeNull();
	});

	it('takes a bean, grinder or dripper just added from the page', () => {
		const resumed = resumeBrewDraft(draft(), url('?grinder=g2&bean=b2&dripper=d2'), context);
		expect(resumed?.fields).toMatchObject({ beanId: 'b2', grinderId: 'g2', dripperId: 'd2' });
		expect(resumed?.copiedFrom).toMatchObject({ beanReset: false });
	});

	it('falls back to the page when a saved choice is gone, but keeps "not recorded"', () => {
		const resumed = resumeBrewDraft(draft({ beanId: 'gone', dripperId: '' }), url(), context);
		expect(resumed?.fields).toMatchObject({ beanId: 'b2', dripperId: '' });
	});
});

describe('stored drafts', () => {
	beforeEach(() => {
		const items = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => items.get(k) ?? null,
			setItem: (k: string, v: string) => items.set(k, v),
			removeItem: (k: string) => items.delete(k)
		});
	});
	afterEach(() => vi.unstubAllGlobals());

	it('round-trips per owner, with its dates intact', () => {
		writeBrewDraft('a@example.com', draft());
		const read = readBrewDraft('a@example.com');
		expect(read?.fields.doseG).toBe('16');
		expect(read?.values.templates.b1.from.brewedAt).toEqual(new Date('2026-11-08T08:00:00Z'));
		expect(read?.values.fallbackTemplate?.from.brewedAt).toEqual(new Date('2026-11-08T08:00:00Z'));
		expect(readBrewDraft('b@example.com')).toBeNull();

		clearBrewDraft('a@example.com');
		expect(readBrewDraft('a@example.com')).toBeNull();
	});

	it('ignores anything unreadable or from an older shape', () => {
		localStorage.setItem('unground:brew-draft:a', '{not json');
		expect(readBrewDraft('a')).toBeNull();
		localStorage.setItem('unground:brew-draft:a', JSON.stringify({ version: 0, fields: {} }));
		expect(readBrewDraft('a')).toBeNull();
	});

	it('survives blocked storage', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			},
			removeItem: () => {
				throw new Error('blocked');
			}
		});
		expect(() => writeBrewDraft('a', draft())).not.toThrow();
		expect(() => clearBrewDraft('a')).not.toThrow();
		expect(readBrewDraft('a')).toBeNull();
	});
});
