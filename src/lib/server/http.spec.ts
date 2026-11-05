import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './http';

describe('safeReturnPath', () => {
	it('keeps same-origin paths with query and hash', () => {
		expect(safeReturnPath('/brews/new?bean=1#pours', '/')).toBe('/brews/new?bean=1#pours');
	});

	it.each([
		null,
		'',
		'brews',
		'https://evil.example/',
		'//evil.example',
		'/\\evil.example',
		'/\t/evil.example',
		'/\n/evil.example',
		'javascript:alert(1)'
	])('rejects %j', (value) => {
		expect(safeReturnPath(value, '/fallback')).toBe('/fallback');
	});
});
