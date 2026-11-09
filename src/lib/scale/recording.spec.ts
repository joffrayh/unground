import { describe, expect, it } from 'vitest';
import { xorChecksum } from './bookoo';
import { MAX_RECORDING_SAMPLES, createRecorder, peakWeight } from './recording';

function weightPacket(timerMs: number, hundredths: number, flowHundredths: number, smoothing = 1) {
	const b = new Uint8Array(20);
	b.set([0x03, 0x0b, (timerMs >> 16) & 255, (timerMs >> 8) & 255, timerMs & 255, 1]);
	b.set([0x2b, (hundredths >> 16) & 255, (hundredths >> 8) & 255, hundredths & 255], 6);
	b.set([0x2b, (flowHundredths >> 8) & 255, flowHundredths & 255], 10);
	b[17] = smoothing;
	b[19] = xorChecksum(b.subarray(0, 19));
	return b;
}

const start = () =>
	createRecorder({
		label: 'pulse',
		scale: 'BOOKOO',
		startedAt: new Date('2026-11-09T10:00:00.000Z'),
		at: 1000
	});

describe('createRecorder', () => {
	it('keeps weight packets as samples, timed from the start', () => {
		const r = start();
		expect(r.data('weight', weightPacket(500, 1234, 250), 1100.4)).toBe(true);
		const out = r.finish(1500);
		expect(out.samples).toEqual([[100, 500, 12.34, 2.5]]);
		expect(out.durationMs).toBe(500);
		expect(out).toMatchObject({
			version: 1,
			label: 'pulse',
			scale: 'BOOKOO',
			startedAt: '2026-11-09T10:00:00.000Z'
		});
	});

	it('takes the smoothing setting from the first reading', () => {
		const r = start();
		r.data('weight', weightPacket(0, 0, 0, 0), 1000);
		r.data('weight', weightPacket(0, 0, 0, 1), 1100);
		expect(r.finish(1200).flowSmoothing).toBe(false);
	});

	it('has no smoothing setting without a reading', () => {
		expect(start().finish(1000).flowSmoothing).toBeNull();
	});

	it('keeps other packets, marks and events in raw form', () => {
		const r = start();
		r.data('command', Uint8Array.of(0x03, 0x0d, 0x01), 1200);
		r.event('command', '03 0A 01 00 00 08', 1300);
		r.mark('Swirl', 1400);
		const out = r.finish(1500);
		expect(out.samples).toEqual([]);
		expect(out.events).toEqual([
			{ atMs: 200, kind: 'packet', detail: 'command 03 0D 01' },
			{ atMs: 300, kind: 'command', detail: '03 0A 01 00 00 08' }
		]);
		expect(out.marks).toEqual([{ atMs: 400, label: 'Swirl' }]);
	});

	it('says when it is full', () => {
		const r = start();
		const packet = weightPacket(0, 0, 0);
		for (let i = 1; i < MAX_RECORDING_SAMPLES; i++) r.data('weight', packet, 1000 + i);
		expect(r.sampleCount).toBe(MAX_RECORDING_SAMPLES - 1);
		expect(r.data('weight', packet, 99_999)).toBe(false);
	});
});

describe('peakWeight', () => {
	it('is the highest weight, and 0 for an empty recording', () => {
		const r = start();
		expect(peakWeight(r.finish(1000))).toBe(0);
		r.data('weight', weightPacket(0, 4500, 0), 1000);
		r.data('weight', weightPacket(0, 12000, 0), 1100);
		r.data('weight', weightPacket(0, 500, 0), 1200);
		expect(peakWeight(r.finish(1300))).toBe(120);
	});
});
