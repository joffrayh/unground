/**
 * What the scale test page measures from the raw packets: the things the protocol docs leave out,
 * such as the update rate and the sign bytes. Pure, so it can be tested without a scale.
 */
import { bytesToHex, decodePacket, type WeightPacket } from '#lib/scale/bookoo.ts';
import type { ScaleChannel } from '#lib/scale/transport.ts';

const GAP_WINDOW = 200;
/** Weight packets with an unchanged timer before it counts as stopped. */
const STOPPED_AFTER = 3;

export interface ProbeSnapshot {
	packets: Record<ScaleChannel, number>;
	/** Packets seen per channel and first two bytes, e.g. "weight 03 0B". */
	headers: Record<string, number>;
	badChecksums: number;
	badLengths: number;
	weightSigns: string[];
	flowSigns: string[];
	units: number[];
	/** From the median gap, so a reconnect doesn't skew it. */
	rateHz: number | null;
	gapMs: { min: number; median: number; max: number } | null;
	latest: WeightPacket | null;
	lastRaw: Record<ScaleChannel, string>;
}

const hexByte = (b: number) => `0x${b.toString(16).padStart(2, '0').toUpperCase()}`;

export function createProbe() {
	const packets = { weight: 0, command: 0 };
	const lastRaw = { weight: '', command: '' };
	const headers: Record<string, number> = {};
	const weightSigns = new Set<number>();
	const flowSigns = new Set<number>();
	const units = new Set<number>();
	const gaps: number[] = [];
	let badChecksums = 0;
	let badLengths = 0;
	let latest: WeightPacket | null = null;
	let lastAt: number | null = null;
	let running = false;
	let unchanged = 0;

	function trackTimer(p: WeightPacket, notes: string[]) {
		const previous = latest?.timerMs;
		if (previous === undefined) return;
		if (p.timerMs < previous) notes.push(`timer reset (${p.timerMs} ms)`);
		if (p.timerMs === previous) {
			unchanged++;
			if (running && unchanged === STOPPED_AFTER) {
				running = false;
				notes.push(`timer stopped at ${p.timerMs} ms`);
			}
			return;
		}
		unchanged = 0;
		if (!running && p.timerMs > previous) {
			running = true;
			notes.push(`timer running from ${previous} ms`);
		}
	}

	function trackWeight(p: WeightPacket, at: number, notes: string[]) {
		if (!weightSigns.has(p.weightSign)) notes.push(`new weight sign ${hexByte(p.weightSign)}`);
		if (!flowSigns.has(p.flowSign)) notes.push(`new flow sign ${hexByte(p.flowSign)}`);
		weightSigns.add(p.weightSign);
		flowSigns.add(p.flowSign);
		units.add(p.unit);
		trackTimer(p, notes);
		if (lastAt !== null) {
			gaps.push(at - lastAt);
			if (gaps.length > GAP_WINDOW) gaps.shift();
		}
		lastAt = at;
		latest = p;
	}

	return {
		/** Takes in one packet and returns anything worth logging. */
		record(channel: ScaleChannel, bytes: Uint8Array, at: number): string[] {
			const notes: string[] = [];
			const hex = bytesToHex(bytes);
			packets[channel]++;
			lastRaw[channel] = hex;
			const header = `${channel} ${hex.slice(0, 5)}`;
			headers[header] = (headers[header] ?? 0) + 1;

			const result = decodePacket(bytes);
			if (!result.ok) {
				if (result.reason === 'checksum') badChecksums++;
				if (result.reason === 'length') badLengths++;
				notes.push(`${channel}: ${result.reason} problem: ${hex}`);
			} else if (result.packet.type === 'weight') {
				trackWeight(result.packet, at, notes);
			} else {
				notes.push(`${channel}: ${JSON.stringify(result.packet)} (${hex})`);
			}
			return notes;
		},

		snapshot(): ProbeSnapshot {
			const sorted = gaps.toSorted((a, b) => a - b);
			const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : null;
			return {
				packets: { ...packets },
				headers: { ...headers },
				badChecksums,
				badLengths,
				weightSigns: [...weightSigns].map(hexByte),
				flowSigns: [...flowSigns].map(hexByte),
				units: [...units],
				rateHz: median ? Math.round(10_000 / median) / 10 : null,
				gapMs:
					median === null
						? null
						: {
								min: Math.round(sorted[0]),
								median: Math.round(median),
								max: Math.round(sorted.at(-1)!)
							},
				latest,
				lastRaw: { ...lastRaw }
			};
		}
	};
}
