import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADVERTISEMENT_WAIT_MS, WebBluetoothTransport } from './web-bluetooth';

const REFUSED = 2;

function fakeDevice(failures: number) {
	const characteristic = () =>
		Object.assign(new EventTarget(), {
			properties: { notify: true, write: true },
			startNotifications: vi.fn(async () => {})
		});
	const server = {
		connected: false,
		disconnect: vi.fn(),
		getPrimaryService: async () => ({ getCharacteristic: async () => characteristic() }),
		connect: vi.fn(async () => {
			if (failures-- > 0) throw REFUSED;
			server.connected = true;
			return server;
		})
	};
	const signals: AbortSignal[] = [];
	const device = Object.assign(new EventTarget(), {
		id: 'id',
		name: 'BOOKOO',
		gatt: server,
		watchAdvertisements: vi.fn(async (options: { signal: AbortSignal }) => {
			signals.push(options.signal);
		})
	});
	const advertise = () => device.dispatchEvent(new Event('advertisementreceived'));
	return {
		device,
		server,
		signals,
		advertise,
		transport: new WebBluetoothTransport(device as unknown as BluetoothDevice)
	};
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

describe('WebBluetoothTransport.connect', () => {
	it('connects directly without listening when it can', async () => {
		const { transport, device, server } = fakeDevice(0);
		await transport.connect();
		expect(server.connected).toBe(true);
		expect(device.watchAdvertisements).not.toHaveBeenCalled();
	});

	it('retries once the refused device is heard', async () => {
		const { transport, server, advertise, signals } = fakeDevice(1);
		const connecting = transport.connect();
		await flush();
		expect(server.connect).toHaveBeenCalledTimes(1);

		advertise();
		await connecting;
		expect(server.connect).toHaveBeenCalledTimes(2);
		expect(server.connected).toBe(true);
		expect(signals[0].aborted).toBe(true);
	});

	it('gives up with the original error if nothing is heard', async () => {
		const { transport, server, signals } = fakeDevice(1);
		const connecting = transport.connect();
		const outcome = expect(connecting).rejects.toBe(REFUSED);
		await vi.advanceTimersByTimeAsync(ADVERTISEMENT_WAIT_MS);
		await outcome;
		expect(server.connect).toHaveBeenCalledTimes(1);
		expect(signals[0].aborted).toBe(true);
	});

	it('gives up at once in a browser that cannot listen', async () => {
		const { transport, device } = fakeDevice(1);
		Object.assign(device, { watchAdvertisements: undefined });
		await expect(transport.connect()).rejects.toBe(REFUSED);
	});

	it('gives up with the original error if listening fails', async () => {
		const { transport, device } = fakeDevice(1);
		device.watchAdvertisements.mockRejectedValue(new Error('Not allowed'));
		await expect(transport.connect()).rejects.toBe(REFUSED);
	});

	it('reports each step', async () => {
		const { transport, advertise } = fakeDevice(1);
		const notes: string[] = [];
		transport.onNote = (line) => notes.push(line);
		const connecting = transport.connect();
		await flush();
		advertise();
		await connecting;
		expect(notes).toEqual(['direct connect failed: 2', 'advertisement heard']);
	});
});
