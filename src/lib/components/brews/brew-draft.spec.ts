import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearBrewDraft,
	readBrewDraft,
	resumeBrewDraft,
	writeBrewDraft,
	type BrewDraft,
	type DraftContext
} from './brew-draft.ts';
import { newBrewValues } from './brew-values.ts';

const option = (id: string) => ({ id, label: id, archived: false, unit: null });
const url = (search = '') => new URLSearchParams(search);

function draft(fields: BrewDraft['fields'] = {}): BrewDraft {
	const values = newBrewValues(null, '2026-11-09T08:00');
	values.defaults = { grindSetting: '24', grindSettingFor: 'g1', doseG: '15', waterTempC: '94' };
	return {
		fields: { beanId: 'b1', grinderId: 'g1', dripperId: 'd1', doseG: '16', ...fields },
		values,
		copiedFrom: {
			id: 'brew-x',
			brewedAt: new Date('2026-11-08T08:00:00Z'),
			timezone: 'UTC',
			beanName: 'Kochere',
			explicit: true,
			beanReset: false,
			grinderReset: false,
			grinderName: 'Comandante'
		}
	};
}

const context: DraftContext = {
	values: {
		...newBrewValues(null, '2026-11-09T09:00'),
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
		expect(resumed?.values.defaults?.doseG).toBe('15');
	});

	it('takes the page’s latest ratings and plans by bean (D58)', () => {
		const fresh: DraftContext = {
			...context,
			values: {
				...context.values,
				lastRatings: { b1: { overall: '4' } as never },
				suggestionsByBean: { b2: { notes: 'Finer' } as never }
			}
		};
		const resumed = resumeBrewDraft(draft(), url(), fresh);
		expect(resumed?.values.lastRatings).toEqual({ b1: { overall: '4' } });
		expect(resumed?.values.suggestionsByBean).toEqual({ b2: { notes: 'Finer' } });
		expect(resumed?.values.defaults?.doseG).toBe('15');
	});

	it('is not shown over a request to copy a different brew', () => {
		expect(resumeBrewDraft(draft(), url('?from=brew-x'), context)).not.toBeNull();
		expect(resumeBrewDraft(draft(), url('?from=brew-y'), context)).toBeNull();
	});

	it('takes a bean, grinder or dripper just added from the page', () => {
		const resumed = resumeBrewDraft(draft(), url('?grinder=g2&bean=b2&dripper=d2'), context);
		expect(resumed?.fields).toMatchObject({ beanId: 'b2', grinderId: 'g2', dripperId: 'd2' });
		expect(resumed?.copiedFrom).toMatchObject({ grinderReset: true, beanReset: false });
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
		expect(read?.copiedFrom?.brewedAt).toEqual(new Date('2026-11-08T08:00:00Z'));
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
