/**
 * Keeps a paired scale connected: tries at once, then every 20 seconds, so a scale turned on later
 * connects by itself. One attempt at a time, and none while the app is hidden.
 */
import type { ScaleListener, ScaleTransport } from './transport';

export const RETRY_MS = 20_000;
/** A connection to a scale that's off may never answer. */
export const ATTEMPT_TIMEOUT_MS = 15_000;

export type ConnectionStatus = 'searching' | 'connecting' | 'connected';

export interface ConnectionOptions {
	/** Finds the paired scale; null while the browser can't offer it. */
	locate: () => Promise<ScaleTransport | null>;
	isVisible: () => boolean;
	onStatus: (status: ConnectionStatus) => void;
	onData: ScaleListener['data'];
}

function withTimeout(work: Promise<void>): Promise<void> {
	let timer: ReturnType<typeof setTimeout>;
	const timedOut = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error('Timed out')), ATTEMPT_TIMEOUT_MS);
	});
	return Promise.race([work, timedOut]).finally(() => clearTimeout(timer));
}

export function createScaleConnection({ locate, isVisible, onStatus, onData }: ConnectionOptions) {
	let timer: ReturnType<typeof setInterval> | undefined;
	let transport: ScaleTransport | null = null;
	let unsubscribe: (() => void) | null = null;
	let status: ConnectionStatus = 'searching';
	let attempting = false;
	/** Moves on at each stop, so an attempt still running can tell it's out of date. */
	let generation = 0;

	function setStatus(next: ConnectionStatus) {
		status = next;
		onStatus(next);
	}

	function adopt(found: ScaleTransport) {
		transport = found;
		unsubscribe = found.subscribe({
			data: onData,
			disconnected() {
				if (status !== 'connected') return;
				setStatus('searching');
				attempt();
			}
		});
	}

	async function attempt() {
		if (timer === undefined || attempting || status === 'connected' || !isVisible()) return;
		attempting = true;
		const run = generation;
		setStatus('connecting');
		let connected = false;
		try {
			if (!transport) {
				const found = await locate();
				if (run !== generation) return;
				if (found) adopt(found);
			}
			if (transport) {
				const current: ScaleTransport = transport;
				await withTimeout(current.connect());
				if (run !== generation) {
					current.disconnect();
					return;
				}
				connected = true;
			}
		} catch {
			if (run === generation) transport?.disconnect();
		}
		if (run !== generation) return;
		attempting = false;
		setStatus(connected ? 'connected' : 'searching');
	}

	return {
		start() {
			if (timer !== undefined) return;
			timer = setInterval(attempt, RETRY_MS);
			attempt();
		},

		/** Tries now, for when the app comes back into view. */
		wake: attempt,

		send(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
			if (status !== 'connected' || !transport) return Promise.reject(new Error('Not connected'));
			return transport.send(bytes);
		},

		stop() {
			clearInterval(timer);
			timer = undefined;
			generation++;
			attempting = false;
			unsubscribe?.();
			unsubscribe = null;
			transport?.disconnect();
			transport = null;
			status = 'searching';
		}
	};
}
