import { describe, expect, it } from 'vitest';
import { matchDevice, type ScalePairing } from './pairing';

const pairing: ScalePairing = { scaleId: 's1', deviceId: 'abc', deviceName: 'BOOKOO 1' };

describe('matchDevice', () => {
	it('prefers the id', () => {
		const byId = { id: 'abc', name: 'Renamed' };
		expect(matchDevice([{ id: 'x', name: 'BOOKOO 1' }, byId], pairing)).toBe(byId);
	});
	it('falls back to the name', () => {
		const byName = { id: 'new-id', name: 'BOOKOO 1' };
		expect(matchDevice([{ id: 'x', name: 'Other' }, byName], pairing)).toBe(byName);
	});
	it('finds nothing else', () => {
		expect(matchDevice([{ id: 'x', name: 'Other' }], pairing)).toBeNull();
		expect(matchDevice([], pairing)).toBeNull();
	});
	it('never matches a nameless device on a missing name', () => {
		expect(matchDevice([{ id: 'x' }], { ...pairing, deviceName: null })).toBeNull();
	});
});
