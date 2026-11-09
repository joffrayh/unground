import { describe, expect, it } from 'vitest';
import { cascadeDelay, changesPage, letterStep } from './page-enter.ts';

const at = (path: string) => ({ url: new URL(path, 'https://unground.test') });

describe('changesPage', () => {
	it('is true for a link to another page', () => {
		expect(changesPage({ type: 'link', from: at('/'), to: at('/brews') })).toBe(true);
	});

	it('is true for a redirect after saving', () => {
		expect(changesPage({ type: 'goto', from: at('/brews/new'), to: at('/brews/1') })).toBe(true);
	});

	it('is false going back', () => {
		expect(changesPage({ type: 'popstate', from: at('/brews'), to: at('/') })).toBe(false);
	});

	it('is false on the first load', () => {
		expect(changesPage({ type: 'enter', from: null, to: at('/') })).toBe(false);
	});

	it('is false for a hash link on the same page', () => {
		expect(changesPage({ type: 'link', from: at('/brews/1'), to: at('/brews/1#rate') })).toBe(
			false
		);
	});

	it('is false when only the query changes', () => {
		expect(changesPage({ type: 'goto', from: at('/brews/new'), to: at('/brews/new?bean=1') })).toBe(
			false
		);
	});

	it('is false with no navigation in progress', () => {
		expect(changesPage({ type: null, from: null, to: null })).toBe(false);
	});
});

describe('cascadeDelay', () => {
	it('starts the first block straight away', () => {
		expect(cascadeDelay(0)).toBe(0);
	});

	it('steps evenly', () => {
		expect(cascadeDelay(2) - cascadeDelay(1)).toBe(cascadeDelay(1));
	});

	it('stops growing on a long page', () => {
		expect(cascadeDelay(40)).toBe(cascadeDelay(7));
	});
});

describe('letterStep', () => {
	it('keeps its pace for a short title', () => {
		expect(letterStep(5)).toBe(letterStep(3));
	});

	it('fits a long name in the same sweep', () => {
		expect(letterStep(61) * 60).toBeCloseTo(letterStep(31) * 30);
	});

	it('copes with a single letter', () => {
		expect(letterStep(1)).toBeGreaterThan(0);
	});
});
