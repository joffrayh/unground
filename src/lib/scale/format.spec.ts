import { describe, expect, it } from 'vitest';
import { formatReading } from './format';

describe('formatReading', () => {
	it.each([
		[0, '0.0g'],
		[45, '45.0g'],
		[12.34, '12.3g'],
		[12.36, '12.4g'],
		[-3.21, '-3.2g'],
		[-0.04, '0.0g']
	])('%d', (grams, text) => {
		expect(formatReading(grams)).toBe(text);
	});

	it('shows a dash without a reading', () => {
		expect(formatReading(null)).toBe('—');
		expect(formatReading(undefined)).toBe('—');
	});
});
