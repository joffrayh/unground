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
	it('falls back to the only device, for a browser that changes both', () => {
		const only = { id: 'restarted' };
		expect(matchDevice([only], pairing)).toBe(only);
	});
	it("won't guess between several devices", () => {
		const devices = [
			{ id: 'x', name: 'Other' },
			{ id: 'y', name: 'Another' }
		];
		expect(matchDevice(devices, pairing)).toBeNull();
	});
	it('finds nothing when the browser remembers nothing', () => {
		expect(matchDevice([], pairing)).toBeNull();
	});
	it('never matches nameless devices on a missing name', () => {
		const devices = [{ id: 'x' }, { id: 'y' }];
		expect(matchDevice(devices, { ...pairing, deviceName: null })).toBeNull();
	});
});
