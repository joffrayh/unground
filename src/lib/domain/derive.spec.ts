import { describe, expect, it } from 'vitest';
import {
	bagLeft,
	brewRatio,
	isValidTimeZone,
	localDate,
	roastAgeDays,
	utcToZonedLocal,
	zonedLocalToUtc
} from './derive';

describe('brewRatio', () => {
	it('is water / dose to one decimal', () => {
		expect(brewRatio(15, 250)).toBe(16.7);
		expect(brewRatio(20, 320)).toBe(16);
	});
	it('is null for missing or zero inputs', () => {
		expect(brewRatio(0, 250)).toBeNull();
		expect(brewRatio(15, 0)).toBeNull();
	});
});

describe('roastAgeDays', () => {
	it('counts days to the local brew date', () => {
		expect(roastAgeDays('2026-10-20', new Date('2026-11-03T08:00:00Z'), 'Europe/London')).toBe(14);
	});
	it('uses the brewer’s timezone, not UTC', () => {
		// 23:30 UTC on Nov 3 is already Nov 4 in Tokyo.
		const instant = new Date('2026-11-03T23:30:00Z');
		expect(roastAgeDays('2026-11-01', instant, 'UTC')).toBe(2);
		expect(roastAgeDays('2026-11-01', instant, 'Asia/Tokyo')).toBe(3);
	});
	it('is null without a roast date', () => {
		expect(roastAgeDays(null, new Date(), 'UTC')).toBeNull();
	});
	it('handles a DST boundary without off-by-one', () => {
		// UK clocks go back on 2026-10-25.
		expect(roastAgeDays('2026-10-24', new Date('2026-10-26T07:00:00Z'), 'Europe/London')).toBe(2);
	});
});

describe('zoned datetime-local conversion', () => {
	it('round-trips in a zone with an offset', () => {
		const utc = zonedLocalToUtc('2026-07-01T08:15', 'Europe/London');
		expect(utc?.toISOString()).toBe('2026-07-01T07:15:00.000Z');
		expect(utcToZonedLocal(utc!, 'Europe/London')).toBe('2026-07-01T08:15');
	});
	it('handles winter time and other zones', () => {
		expect(zonedLocalToUtc('2026-12-01T08:15', 'Europe/London')?.toISOString()).toBe(
			'2026-12-01T08:15:00.000Z'
		);
		expect(zonedLocalToUtc('2026-12-01T08:15', 'America/New_York')?.toISOString()).toBe(
			'2026-12-01T13:15:00.000Z'
		);
	});
	it('rejects malformed and out-of-range input', () => {
		expect(zonedLocalToUtc('yesterday', 'UTC')).toBeNull();
		expect(zonedLocalToUtc('2026-02-30T08:00', 'UTC')).toBeNull();
		expect(zonedLocalToUtc('2026-13-45T25:99', 'UTC')).toBeNull();
		expect(zonedLocalToUtc('2026-01-01T24:00', 'UTC')).toBeNull();
	});
	it('shifts times in a spring-forward gap forward, like a clock', () => {
		// London skips 01:00–02:00 on 2026-03-29; New York skips 02:00–03:00 on 2026-03-08.
		expect(zonedLocalToUtc('2026-03-29T01:30', 'Europe/London')?.toISOString()).toBe(
			'2026-03-29T01:30:00.000Z'
		);
		expect(
			utcToZonedLocal(zonedLocalToUtc('2026-03-29T01:30', 'Europe/London')!, 'Europe/London')
		).toBe('2026-03-29T02:30');
		expect(
			utcToZonedLocal(zonedLocalToUtc('2026-03-08T02:30', 'America/New_York')!, 'America/New_York')
		).toBe('2026-03-08T03:30');
	});
	it('picks the earlier instant in an autumn overlap, in every zone', () => {
		// 01:30 happens twice: London on 2026-10-25, New York on 2026-11-01.
		expect(zonedLocalToUtc('2026-10-25T01:30', 'Europe/London')?.toISOString()).toBe(
			'2026-10-25T00:30:00.000Z'
		);
		expect(zonedLocalToUtc('2026-11-01T01:30', 'America/New_York')?.toISOString()).toBe(
			'2026-11-01T05:30:00.000Z'
		);
	});
	it('formats local dates', () => {
		expect(localDate(new Date('2026-11-03T23:30:00Z'), 'Asia/Tokyo')).toBe('2026-11-04');
	});
	it('validates time zones', () => {
		expect(isValidTimeZone('Europe/London')).toBe(true);
		expect(isValidTimeZone('Mars/Olympus')).toBe(false);
	});
});

describe('bagLeft', () => {
	it('subtracts the doses used and counts whole brews left at the latest dose', () => {
		expect(bagLeft(250, 45, 15)).toEqual({ remainingG: 205, brewsLeft: 13, doseG: 15 });
		expect(bagLeft(250, 240, 15)).toEqual({ remainingG: 10, brewsLeft: 0, doseG: 15 });
		expect(bagLeft(250, 0.3 * 3, 0.3)).toEqual({ remainingG: 249.1, brewsLeft: 830, doseG: 0.3 });
	});

	it('never goes below empty', () => {
		expect(bagLeft(250, 262.5, 17.5)).toEqual({ remainingG: 0, brewsLeft: 0, doseG: 17.5 });
	});

	it('is null without a bag weight, and has no brew count without a dose', () => {
		expect(bagLeft(null, 30, 15)).toBeNull();
		expect(bagLeft(250, 0, null)).toEqual({ remainingG: 250, brewsLeft: null, doseG: null });
	});
});
