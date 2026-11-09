/**
 * The Bookoo Themis Bluetooth protocol: packet decoding and command bytes. Pure, so it can be tested
 * without a scale. Reference: github.com/BooKooCode/OpenSource (bookoo_ultra_scale/protocols.md).
 *
 * Every packet ends in a checksum, the XOR of all the bytes before it.
 */

export const BOOKOO_SERVICE = '00000ffe-0000-1000-8000-00805f9b34fb';
export const BOOKOO_WEIGHT_CHARACTERISTIC = '0000ff11-0000-1000-8000-00805f9b34fb';
export const BOOKOO_COMMAND_CHARACTERISTIC = '0000ff12-0000-1000-8000-00805f9b34fb';

const PRODUCT = 0x03;
const TYPE_COMMAND = 0x0a;
const TYPE_WEIGHT = 0x0b;
const TYPE_EVENT = 0x0d;
const TYPE_POWDER = 0x0f;
const PACKET_LENGTH = 20;
/** ASCII "-". The docs only say "+/-", so anything else counts as positive. */
const NEGATIVE = 0x2d;

export interface WeightPacket {
	type: 'weight';
	timerMs: number;
	/** The scale's raw unit code: 1 is grams, 2 is ounces. */
	unit: number;
	/** In the scale's unit. */
	weight: number;
	/** Per second, in the scale's unit. */
	flow: number;
	batteryPct: number;
	standbyMin: number;
	buzzer: number;
	flowSmoothing: boolean;
	/** The raw sign bytes, because the docs don't give their values. */
	weightSign: number;
	flowSign: number;
}

export const SCALE_EVENT_STATES = ['stopped', 'started', 'ready', 'exitReady', 'exitDone'] as const;
export type ScaleEventState = (typeof SCALE_EVENT_STATES)[number];

/** A change of the scale's automatic mode (Ultra firmware 4.0.0 and later). */
export interface EventPacket {
	type: 'event';
	state: ScaleEventState | null;
	stateCode: number;
	timerMs: number;
	weight: number;
	/** Average flow in timing mode, or the liquid to powder ratio in ratio mode. */
	result: number;
}

export interface PowderPacket {
	type: 'powder';
	powder: number;
}

export type ScalePacket = WeightPacket | EventPacket | PowderPacket;

export type DecodeResult =
	{ ok: true; packet: ScalePacket } | { ok: false; reason: 'length' | 'checksum' | 'header' };

export function xorChecksum(bytes: Uint8Array): number {
	return bytes.reduce((sum, b) => sum ^ b, 0);
}

export function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

const uint16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const uint24 = (b: Uint8Array, at: number) => (b[at] << 16) | uint16(b, at + 1);

/** Hundredths with a sign byte in front; a negative zero is just zero. */
function signed(sign: number, hundredths: number): number {
	return sign === NEGATIVE && hundredths !== 0 ? -hundredths / 100 : hundredths / 100;
}

function decodeWeight(b: Uint8Array): WeightPacket {
	return {
		type: 'weight',
		timerMs: uint24(b, 2),
		unit: b[5],
		weightSign: b[6],
		weight: signed(b[6], uint24(b, 7)),
		flowSign: b[10],
		flow: signed(b[10], uint16(b, 11)),
		batteryPct: b[13],
		standbyMin: uint16(b, 14) / 10,
		buzzer: b[16],
		flowSmoothing: b[17] !== 0
	};
}

function decodeEvent(b: Uint8Array): EventPacket {
	return {
		type: 'event',
		state: SCALE_EVENT_STATES[b[2]] ?? null,
		stateCode: b[2],
		timerMs: uint24(b, 3),
		weight: signed(b[6], uint24(b, 7)),
		result: signed(b[10], uint16(b, 11))
	};
}

export function decodePacket(bytes: Uint8Array): DecodeResult {
	if (bytes.length !== PACKET_LENGTH) return { ok: false, reason: 'length' };
	if (xorChecksum(bytes.subarray(0, -1)) !== bytes[PACKET_LENGTH - 1]) {
		return { ok: false, reason: 'checksum' };
	}
	if (bytes[0] !== PRODUCT) return { ok: false, reason: 'header' };
	switch (bytes[1]) {
		case TYPE_WEIGHT:
			return { ok: true, packet: decodeWeight(bytes) };
		case TYPE_EVENT:
			return { ok: true, packet: decodeEvent(bytes) };
		case TYPE_POWDER:
			return { ok: true, packet: { type: 'powder', powder: signed(bytes[2], uint24(bytes, 3)) } };
		default:
			return { ok: false, reason: 'header' };
	}
}

function command(code: number, data1 = 0, data2 = 0): Uint8Array<ArrayBuffer> {
	const frame = Uint8Array.of(PRODUCT, TYPE_COMMAND, code, data1, data2, 0);
	frame[5] = xorChecksum(frame.subarray(0, 5));
	return frame;
}

export const STOP_CONDITIONS = { flow: 0, filterRemoved: 1, serverRemoved: 2 } as const;
export type StopCondition = keyof typeof STOP_CONDITIONS;

const TIMING_MODE = 1;

export const scaleCommands = {
	tare: () => command(0x01),
	startTimer: () => command(0x04),
	stopTimer: () => command(0x05),
	resetTimer: () => command(0x06),
	tareAndStart: () => command(0x07),
	flowSmoothing: (on: boolean) => command(0x08, on ? 1 : 0),
	/** What ends the timer in timing mode (Ultra firmware 4.0.0 and later). */
	timingStopCondition: (stop: StopCondition) => command(0x0b, TIMING_MODE, STOP_CONDITIONS[stop])
};
