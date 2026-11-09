/**
 * A recording of everything a scale sent during a brew, for tuning the pour detector offline. Pure, so
 * a recording can be replayed in a test exactly as the scale sent it.
 */
import { bytesToHex, decodePacket } from './bookoo';
import type { ScaleChannel } from './transport';

export const RECORDING_VERSION = 1;
/** About 30 minutes at 10 Hz, and within the server's default request size. */
export const MAX_RECORDING_SAMPLES = 20_000;

/** Milliseconds since recording began, the scale's timer (ms), weight and flow. */
export type RecordedSample = [atMs: number, timerMs: number, weight: number, flow: number];

export const RECORDING_EVENT_KINDS = ['command', 'packet', 'connected', 'disconnected'] as const;
export type RecordingEventKind = (typeof RECORDING_EVENT_KINDS)[number];

export interface RecordingEvent {
	atMs: number;
	kind: RecordingEventKind;
	/** Raw bytes in hex for commands and packets. */
	detail: string;
}

/** Something the brewer flagged while it happened, such as a swirl. */
export interface RecordingMark {
	atMs: number;
	label: string;
}

export interface ScaleRecording {
	version: typeof RECORDING_VERSION;
	label: string;
	/** ISO 8601. */
	startedAt: string;
	durationMs: number;
	scale: string;
	/** The scale's setting when recording began; null if no reading arrived. */
	flowSmoothing: boolean | null;
	samples: RecordedSample[];
	marks: RecordingMark[];
	events: RecordingEvent[];
}

export function createRecorder(opts: {
	label: string;
	scale: string;
	startedAt: Date;
	/** `performance.now()` when recording began. */
	at: number;
}) {
	const samples: RecordedSample[] = [];
	const marks: RecordingMark[] = [];
	const events: RecordingEvent[] = [];
	let flowSmoothing: boolean | null = null;
	const since = (at: number) => Math.round(at - opts.at);

	return {
		get sampleCount() {
			return samples.length;
		},

		/** Takes in one packet. Returns false once the recording is full. */
		data(channel: ScaleChannel, bytes: Uint8Array, at: number): boolean {
			const result = decodePacket(bytes);
			if (result.ok && result.packet.type === 'weight') {
				const p = result.packet;
				flowSmoothing ??= p.flowSmoothing;
				samples.push([since(at), p.timerMs, p.weight, p.flow]);
			} else {
				events.push({ atMs: since(at), kind: 'packet', detail: `${channel} ${bytesToHex(bytes)}` });
			}
			return samples.length < MAX_RECORDING_SAMPLES;
		},

		event(kind: RecordingEventKind, detail: string, at: number) {
			events.push({ atMs: since(at), kind, detail });
		},

		mark(label: string, at: number) {
			marks.push({ atMs: since(at), label });
		},

		finish(at: number): ScaleRecording {
			return {
				version: RECORDING_VERSION,
				label: opts.label,
				startedAt: opts.startedAt.toISOString(),
				durationMs: since(at),
				scale: opts.scale,
				flowSmoothing,
				samples,
				marks,
				events
			};
		}
	};
}

export type Recorder = ReturnType<typeof createRecorder>;

export function peakWeight(recording: ScaleRecording): number {
	return recording.samples.reduce((peak, s) => Math.max(peak, s[2]), 0);
}
