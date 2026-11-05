import { describe, expect, it } from 'vitest';
import {
	activeFirst,
	altitudeText,
	bagEmptyText,
	brewsLeftText,
	gramsLeftText,
	leftFraction,
	pricePerBrew,
	pricePerBrewText,
	priceText,
	roastAgeText,
	withParam
} from './helpers';

describe('withParam', () => {
	it('appends a param to a bare path', () => {
		expect(withParam('/brews/new', 'bean', 'abc')).toBe('/brews/new?bean=abc');
	});
	it('keeps existing params and the hash, replacing the same key', () => {
		expect(withParam('/brews/new?copy=1&bean=old#pours', 'bean', 'new')).toBe(
			'/brews/new?copy=1&bean=new#pours'
		);
	});
	it('encodes the value', () => {
		expect(withParam('/x', 'k', 'a b&c')).toBe('/x?k=a+b%26c');
	});
});

describe('roastAgeText', () => {
	it('handles unknown, today, singular and plural', () => {
		expect(roastAgeText(null)).toBeNull();
		expect(roastAgeText(0)).toBe('Roasted today');
		expect(roastAgeText(-1)).toBe('Roasted today');
		expect(roastAgeText(1)).toBe('1 day off roast');
		expect(roastAgeText(12)).toBe('12 days off roast');
	});
});

describe('altitudeText', () => {
	it('formats ranges and single values', () => {
		expect(altitudeText(null, null)).toBeNull();
		expect(altitudeText(1900, 1900)).toBe('1,900 m');
		expect(altitudeText(1800, 2000)).toBe('1,800–2,000 m');
		expect(altitudeText(null, 950)).toBe('950 m');
	});
});

describe('activeFirst', () => {
	it('moves archived items last, stably', () => {
		const d = new Date();
		const items = [
			{ n: 'a', archivedAt: d },
			{ n: 'b', archivedAt: null },
			{ n: 'c', archivedAt: d },
			{ n: 'd', archivedAt: null }
		];
		expect(activeFirst(items).map((i) => i.n)).toEqual(['b', 'd', 'a', 'c']);
	});
});

describe('bag texts', () => {
	it('formats grams left, rounding float noise', () => {
		expect(gramsLeftText(143)).toBe('143 g left');
		expect(gramsLeftText(250 - 15.1 - 15.2)).toBe('219.7 g left');
		expect(gramsLeftText(0)).toBe('0 g left');
	});
	it('formats brews left, with or without the dose', () => {
		expect(brewsLeftText({ brewsLeft: 9, doseG: 15 })).toBe('≈ 9 brews');
		expect(brewsLeftText({ brewsLeft: 1, doseG: 15 })).toBe('≈ 1 brew');
		expect(brewsLeftText({ brewsLeft: 9, doseG: 15.5 }, { withDose: true })).toBe(
			'≈ 9 brews at 15.5 g'
		);
		expect(brewsLeftText({ brewsLeft: null, doseG: null })).toBeNull();
	});
	it('describes an over-logged bag', () => {
		expect(bagEmptyText(250, 262.5)).toBe('0 g left — 262.5 g logged from a 250 g bag');
	});
	it('clamps the fraction left', () => {
		expect(leftFraction(125, 250)).toBe(0.5);
		expect(leftFraction(0, 250)).toBe(0);
		expect(leftFraction(300, 250)).toBe(1);
		expect(leftFraction(10, 0)).toBe(0);
	});
});

describe('pricePerBrew', () => {
	it('is the dose share of the price, rounded to 2 decimals', () => {
		expect(pricePerBrew(14.5, 250, 15)).toBe(0.87);
		expect(pricePerBrew(12.5, 250, 15)).toBe(0.75);
		expect(pricePerBrew(0, 250, 15)).toBe(0);
	});
	it('needs a price, a weight and a dose', () => {
		expect(pricePerBrew(null, 250, 15)).toBeNull();
		expect(pricePerBrew(14.5, null, 15)).toBeNull();
		expect(pricePerBrew(14.5, 250, null)).toBeNull();
		expect(pricePerBrew(14.5, 0, 15)).toBeNull();
	});
	it('has display texts without a currency symbol', () => {
		expect(priceText(14.5)).toBe('14.50');
		expect(pricePerBrewText(14.5, 250, 15)).toBe('0.87 per 15 g brew');
		expect(pricePerBrewText(14.5, 250, null)).toBeNull();
	});
});
