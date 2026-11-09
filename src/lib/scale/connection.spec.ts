import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ATTEMPT_TIMEOUT_MS,
	RETRY_MS,
	createScaleConnection,
	type ConnectionStatus
} from './connection';
import type { ScaleListener, ScaleTransport } from './transport';

/** A scale that answers according to `power`: on, off (refuses) or silent (never answers). */
function fakeScale() {
	const listeners = new Set<ScaleListener>();
	const scale = {
		power: 'on' as 'on' | 'off' | 'silent',
		connects: 0,
		disconnects: 0,
		connected: false,
		name: 'Fake',
		async connect() {
			scale.connects++;
			if (scale.power === 'off') throw new Error('Unreachable');
			if (scale.power === 'silent') await new Promise(() => {});
			scale.connected = true;
		},
		disconnect() {
			scale.disconnects++;
			scale.connected = false;
		},
		async send() {},
		subscribe(listener: ScaleListener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		drop() {
			scale.connected = false;
			for (const l of listeners) l.disconnected();
		}
	};
	return scale satisfies ScaleTransport & Record<string, unknown>;
}

function setup(scale: ReturnType<typeof fakeScale> | null = fakeScale()) {
	const statuses: ConnectionStatus[] = [];
	const state = { visible: true, available: scale };
	const locate = vi.fn(async () => state.available);
	const connection = createScaleConnection({
		locate,
		isVisible: () => state.visible,
		onStatus: (s) => statuses.push(s)
	});
	return { connection, statuses, state, locate, last: () => statuses.at(-1) };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

describe('createScaleConnection', () => {
	it('connects straight away', async () => {
		const scale = fakeScale();
		const { connection, statuses } = setup(scale);
		connection.start();
		await flush();
		expect(statuses).toEqual(['connecting', 'connected']);
		expect(scale.connects).toBe(1);
	});

	it('connects a scale turned on later, at the next retry', async () => {
		const scale = fakeScale();
		scale.power = 'off';
		const { connection, last } = setup(scale);
		connection.start();
		await flush();
		expect(last()).toBe('searching');

		scale.power = 'on';
		await vi.advanceTimersByTimeAsync(RETRY_MS - 1);
		expect(last()).toBe('searching');
		await vi.advanceTimersByTimeAsync(1);
		expect(last()).toBe('connected');
		expect(scale.connects).toBe(2);
	});

	it('finds a device the browser only offers later', async () => {
		const { connection, state, locate, last } = setup(null);
		connection.start();
		await flush();
		expect(last()).toBe('searching');
		state.available = fakeScale();
		await vi.advanceTimersByTimeAsync(RETRY_MS);
		expect(last()).toBe('connected');
		expect(locate).toHaveBeenCalledTimes(2);
	});

	it('stops retrying once connected', async () => {
		const scale = fakeScale();
		const { connection } = setup(scale);
		connection.start();
		await vi.advanceTimersByTimeAsync(RETRY_MS * 5);
		expect(scale.connects).toBe(1);
	});

	it('gives up on an attempt that never answers, without overlapping it', async () => {
		const scale = fakeScale();
		scale.power = 'silent';
		const { connection, last } = setup(scale);
		connection.start();
		connection.wake();
		await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS - 1);
		connection.wake();
		await flush();
		expect(scale.connects).toBe(1);
		expect(last()).toBe('connecting');

		await vi.advanceTimersByTimeAsync(1);
		expect(last()).toBe('searching');
		expect(scale.disconnects).toBe(1);
	});

	it('retries at once when a connected scale drops', async () => {
		const scale = fakeScale();
		const { connection, statuses } = setup(scale);
		connection.start();
		await flush();
		scale.drop();
		await flush();
		expect(statuses).toEqual(['connecting', 'connected', 'searching', 'connecting', 'connected']);
		expect(scale.connects).toBe(2);
	});

	it('uses the same transport for every attempt', async () => {
		const scale = fakeScale();
		const { connection, locate } = setup(scale);
		connection.start();
		await flush();
		scale.drop();
		await flush();
		expect(locate).toHaveBeenCalledTimes(1);
	});

	it('does not try while hidden, and tries on waking', async () => {
		const scale = fakeScale();
		const { connection, state, last } = setup(scale);
		state.visible = false;
		connection.start();
		await vi.advanceTimersByTimeAsync(RETRY_MS * 3);
		expect(scale.connects).toBe(0);

		state.visible = true;
		connection.wake();
		await flush();
		expect(last()).toBe('connected');
	});

	it('stays connected while hidden', async () => {
		const scale = fakeScale();
		const { connection, state } = setup(scale);
		connection.start();
		await flush();
		state.visible = false;
		await vi.advanceTimersByTimeAsync(RETRY_MS * 3);
		expect(scale.connected).toBe(true);
	});

	it('disconnects and stops trying when stopped', async () => {
		const scale = fakeScale();
		const { connection } = setup(scale);
		connection.start();
		await flush();
		connection.stop();
		expect(scale.connected).toBe(false);
		await vi.advanceTimersByTimeAsync(RETRY_MS * 3);
		expect(scale.connects).toBe(1);
	});

	it('abandons an attempt that finishes after stopping', async () => {
		const scale = fakeScale();
		let finish = () => {};
		scale.connect = async () => {
			scale.connects++;
			await new Promise<void>((resolve) => (finish = resolve));
			scale.connected = true;
		};
		const { connection, statuses } = setup(scale);
		connection.start();
		await flush();
		connection.stop();
		finish();
		await flush();
		expect(scale.disconnects).toBeGreaterThanOrEqual(2);
		expect(statuses).toEqual(['connecting']);
	});
});
