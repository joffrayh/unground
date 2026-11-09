import { describe, expect, it } from 'vitest';
import { xorChecksum } from '#lib/scale/bookoo.ts';
import { createProbe } from './probe';

function weightPacket(timerMs: number, opts: { weightSign?: number; flowSign?: number } = {}) {
	const bytes = new Uint8Array(20);
	bytes.set([0x03, 0x0b, (timerMs >> 16) & 0xff, (timerMs >> 8) & 0xff, timerMs & 0xff, 0x01]);
	bytes[6] = opts.weightSign ?? 0x2b;
	bytes[10] = opts.flowSign ?? 0x2b;
	bytes[19] = xorChecksum(bytes.subarray(0, 19));
	return bytes;
}

describe('createProbe', () => {
	it('takes the rate from the median gap, ignoring one long gap', () => {
		const probe = createProbe();
		[0, 100, 200, 300, 5000].forEach((at) => probe.record('weight', weightPacket(0), at));
		const { rateHz, gapMs } = probe.snapshot();
		expect(rateHz).toBe(10);
		expect(gapMs).toEqual({ min: 100, median: 100, max: 4700 });
	});

	it('has no rate before two weight packets', () => {
		const probe = createProbe();
		probe.record('weight', weightPacket(0), 0);
		expect(probe.snapshot().rateHz).toBeNull();
	});

	it('collects each sign byte, noting new ones once', () => {
		const probe = createProbe();
		expect(probe.record('weight', weightPacket(0), 0)).toEqual([
			'new weight sign 0x2B',
			'new flow sign 0x2B'
		]);
		expect(probe.record('weight', weightPacket(0), 100)).toEqual([]);
		expect(probe.record('weight', weightPacket(0, { flowSign: 0x2d }), 200)).toEqual([
			'new flow sign 0x2D'
		]);
		const snapshot = probe.snapshot();
		expect(snapshot.weightSigns).toEqual(['0x2B']);
		expect(snapshot.flowSigns).toEqual(['0x2B', '0x2D']);
		expect(snapshot.units).toEqual([1]);
	});

	it('notes the timer starting, stopping and resetting', () => {
		const probe = createProbe();
		const timer = (ms: number, at: number) =>
			probe.record('weight', weightPacket(ms), at).filter((n) => n.includes('timer'));
		expect(timer(0, 0)).toEqual([]);
		expect(timer(100, 100)).toEqual(['timer running from 0 ms']);
		expect(timer(200, 200)).toEqual([]);
		expect(timer(200, 300)).toEqual([]);
		expect(timer(200, 400)).toEqual([]);
		expect(timer(200, 500)).toEqual(['timer stopped at 200 ms']);
		expect(timer(200, 600)).toEqual([]);
		expect(timer(0, 700)).toEqual(['timer reset (0 ms)']);
	});

	it('counts bad packets and every header', () => {
		const probe = createProbe();
		const bad = weightPacket(0);
		bad[19] ^= 0xff;
		expect(probe.record('weight', bad, 0)[0]).toMatch(/^weight: checksum problem: 03 0B/);
		expect(probe.record('command', Uint8Array.of(0x03, 0x0a, 0x01), 1)[0]).toMatch(
			/^command: length problem/
		);
		const snapshot = probe.snapshot();
		expect(snapshot.badChecksums).toBe(1);
		expect(snapshot.badLengths).toBe(1);
		expect(snapshot.headers).toEqual({ 'weight 03 0B': 1, 'command 03 0A': 1 });
		expect(snapshot.packets).toEqual({ weight: 1, command: 1 });
		expect(snapshot.lastRaw.command).toBe('03 0A 01');
	});

	it('logs an event packet in full', () => {
		const probe = createProbe();
		const event = new Uint8Array(20);
		event.set([0x03, 0x0d, 0x02]);
		event[19] = xorChecksum(event.subarray(0, 19));
		expect(probe.record('command', event, 0)[0]).toContain('"state":"ready"');
	});
});
