import { createContext } from 'svelte';
import { decodePacket, type WeightPacket } from './bookoo';
import { createScaleConnection, type ConnectionStatus } from './connection';
import { clearPairing, matchDevice, readPairing, writePairing, type ScalePairing } from './pairing';
import type { ScaleTransport } from './transport';
import { WebBluetoothTransport, requestScale } from './web-bluetooth';

export interface ScaleOption {
	id: string;
	name: string;
}

/** This phone's link to its paired scale, for every page. Lives in the root layout. */
export class ScaleLink {
	/** The browser has Web Bluetooth. False until `start`. */
	available = $state(false);
	pairing = $state.raw<ScalePairing | null>(null);
	status = $state<ConnectionStatus>('searching');
	/** The latest reading; null while not connected. */
	reading = $state.raw<WeightPacket | null>(null);

	#owner: string | null = null;
	#suspended = false;
	#chosen: BluetoothDevice | null = null;
	#connection: ReturnType<typeof createScaleConnection> | null = null;

	#onVisibility = () => this.#connection?.wake();

	/** Finds the device picked just now, or else the one the browser remembers. */
	#locate = async (): Promise<ScaleTransport | null> => {
		if (this.#chosen) return new WebBluetoothTransport(this.#chosen);
		if (!this.pairing || !navigator.bluetooth.getDevices) return null;
		const device = matchDevice(await navigator.bluetooth.getDevices(), this.pairing);
		return device ? new WebBluetoothTransport(device) : null;
	};

	#connect() {
		this.#connection?.stop();
		this.#connection = null;
		this.status = 'searching';
		this.reading = null;
		if (!this.available || !this.pairing || this.#suspended) return;
		this.#connection = createScaleConnection({
			locate: this.#locate,
			isVisible: () => document.visibilityState === 'visible',
			onStatus: (status) => {
				this.status = status;
				if (status !== 'connected') this.reading = null;
			},
			onData: (_channel, bytes) => {
				const decoded = decodePacket(bytes);
				if (decoded.ok && decoded.packet.type === 'weight') this.reading = decoded.packet;
			}
		});
		this.#connection.start();
	}

	start(owner: string) {
		this.#owner = owner;
		this.available = !!navigator.bluetooth;
		this.pairing = readPairing(owner);
		document.addEventListener('visibilitychange', this.#onVisibility);
		this.#connect();
	}

	stop() {
		document.removeEventListener('visibilitychange', this.#onVisibility);
		this.#connection?.stop();
		this.#connection = null;
		this.#owner = null;
	}

	send(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
		return this.#connection?.send(bytes) ?? Promise.reject(new Error('Not connected'));
	}

	/** Opens the device chooser, so it must be called from a tap. Cancelling changes nothing. */
	async pair(scaleId: string) {
		if (!this.#owner) return;
		let device: BluetoothDevice;
		try {
			device = await requestScale();
		} catch {
			return;
		}
		this.#chosen = device;
		this.pairing = { scaleId, deviceId: device.id, deviceName: device.name ?? null };
		writePairing(this.#owner, this.pairing);
		this.#connect();
	}

	unpair() {
		if (this.#owner) clearPairing(this.#owner);
		this.#chosen = null;
		this.pairing = null;
		this.#connect();
	}

	/** Forgets the pairing if its scale was archived or deleted. */
	keepOnly(activeScaleIds: readonly string[]) {
		if (this.pairing && !activeScaleIds.includes(this.pairing.scaleId)) this.unpair();
	}

	/** Lets go of the scale for a page that talks to it directly. */
	suspend() {
		this.#suspended = true;
		this.#connect();
	}

	resume() {
		this.#suspended = false;
		this.#connect();
	}
}

export const [getScaleLink, setScaleLink] = createContext<ScaleLink>();
