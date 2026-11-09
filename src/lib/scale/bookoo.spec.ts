import { describe, expect, it } from 'vitest';
import { bytesToHex, decodePacket, scaleCommands, xorChecksum } from './bookoo';

/** A 20-byte packet from its first 19 bytes (the rest padded with zeros), with a valid checksum. */
function packet(...head: number[]): Uint8Array {
	const bytes = new Uint8Array(20);
	bytes.set(head);
	bytes[19] = xorChecksum(bytes.subarray(0, 19));
	return bytes;
}

// prettier-ignore
const WEIGHT = [
	0x03, 0x0b,
	0x01, 0x02, 0x03, // 66051 ms
	0x01, // grams
	0x2b, 0x00, 0x30, 0x39, // +123.45
	0x2b, 0x01, 0xf4, // +5.00
	0x5a, // 90 %
	0x00, 0x96, // 15 min
	0x03, // buzzer
	0x01 // smoothing on
];

const decoded = (bytes: Uint8Array) => {
	const result = decodePacket(bytes);
	if (!result.ok) throw new Error(result.reason);
	return result.packet;
};

describe('decodePacket', () => {
	it('reads every field of a weight packet', () => {
		expect(decoded(packet(...WEIGHT))).toEqual({
			type: 'weight',
			timerMs: 66051,
			unit: 1,
			weightSign: 0x2b,
			weight: 123.45,
			flowSign: 0x2b,
			flow: 5,
			batteryPct: 90,
			standbyMin: 15,
			buzzer: 3,
			flowSmoothing: true
		});
	});

	it('reads negative weight and flow', () => {
		const bytes = [...WEIGHT];
		bytes[6] = 0x2d;
		bytes[10] = 0x2d;
		expect(decoded(packet(...bytes))).toMatchObject({ weight: -123.45, flow: -5 });
	});

	it('never returns negative zero', () => {
		const bytes = [...WEIGHT];
		bytes.splice(6, 7, 0x2d, 0, 0, 0, 0x2d, 0, 0);
		const p = decoded(packet(...bytes));
		expect(p).toMatchObject({ weight: 0, flow: 0 });
		expect(Object.is(p.type === 'weight' && p.weight, -0)).toBe(false);
	});

	it('reads the largest timer and weight', () => {
		const bytes = [...WEIGHT];
		bytes.splice(2, 3, 0xff, 0xff, 0xff);
		bytes.splice(7, 3, 0xff, 0xff, 0xff);
		expect(decoded(packet(...bytes))).toMatchObject({ timerMs: 16777215, weight: 167772.15 });
	});

	it('reads an event packet', () => {
		// prettier-ignore
		const p = decoded(packet(0x03, 0x0d, 0x01, 0x00, 0x27, 0x10, 0x2b, 0x00, 0x03, 0xe8, 0x2b, 0x00, 0xc8));
		expect(p).toEqual({
			type: 'event',
			state: 'started',
			stateCode: 1,
			timerMs: 10000,
			weight: 10,
			result: 2
		});
	});

	it('keeps an event state it does not know', () => {
		expect(decoded(packet(0x03, 0x0d, 0x09))).toMatchObject({ state: null, stateCode: 9 });
	});

	it('reads a powder packet', () => {
		expect(decoded(packet(0x03, 0x0f, 0x2b, 0x00, 0x05, 0xdc))).toEqual({
			type: 'powder',
			powder: 15
		});
	});

	it('rejects a wrong length', () => {
		expect(decodePacket(new Uint8Array(19))).toEqual({ ok: false, reason: 'length' });
	});

	it('rejects a bad checksum', () => {
		const bytes = packet(...WEIGHT);
		bytes[19] ^= 0xff;
		expect(decodePacket(bytes)).toEqual({ ok: false, reason: 'checksum' });
	});

	it('rejects an unknown product or type', () => {
		expect(decodePacket(packet(0x04, 0x0b))).toEqual({ ok: false, reason: 'header' });
		expect(decodePacket(packet(0x03, 0x77))).toEqual({ ok: false, reason: 'header' });
	});
});

describe('scaleCommands', () => {
	it.each([
		['tare', scaleCommands.tare(), '03 0A 01 00 00 08'],
		['start', scaleCommands.startTimer(), '03 0A 04 00 00 0D'],
		['stop', scaleCommands.stopTimer(), '03 0A 05 00 00 0C'],
		['reset', scaleCommands.resetTimer(), '03 0A 06 00 00 0F'],
		['tare and start', scaleCommands.tareAndStart(), '03 0A 07 00 00 0E'],
		['smoothing off', scaleCommands.flowSmoothing(false), '03 0A 08 00 00 01'],
		['smoothing on', scaleCommands.flowSmoothing(true), '03 0A 08 01 00 00'],
		['stop on flow', scaleCommands.timingStopCondition('flow'), '03 0A 0B 01 00 03'],
		['stop on filter', scaleCommands.timingStopCondition('filterRemoved'), '03 0A 0B 01 01 02'],
		['stop on server', scaleCommands.timingStopCondition('serverRemoved'), '03 0A 0B 01 02 01']
	])('%s', (_name, bytes, hex) => {
		expect(bytesToHex(bytes)).toBe(hex);
	});
});
