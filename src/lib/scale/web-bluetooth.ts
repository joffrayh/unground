import {
	BOOKOO_COMMAND_CHARACTERISTIC,
	BOOKOO_SERVICE,
	BOOKOO_WEIGHT_CHARACTERISTIC
} from './bookoo';
import type { ScaleChannel, ScaleListener, ScaleTransport } from './transport';

const DEVICE_INFORMATION = 'device_information';
const OPTIONAL_SERVICES = [BOOKOO_SERVICE, DEVICE_INFORMATION];

/**
 * Opens the browser's device chooser, which needs a tap. `anyDevice` lists everything nearby, for a
 * scale the filters miss: its advertised name isn't documented.
 */
export function requestScale(anyDevice = false): Promise<BluetoothDevice> {
	return navigator.bluetooth.requestDevice(
		anyDevice
			? { acceptAllDevices: true, optionalServices: OPTIONAL_SERVICES }
			: {
					filters: [
						{ namePrefix: 'BOOKOO' },
						{ namePrefix: 'Bookoo' },
						{ namePrefix: 'bookoo' },
						{ services: [BOOKOO_SERVICE] }
					],
					optionalServices: OPTIONAL_SERVICES
				}
	);
}

export class WebBluetoothTransport implements ScaleTransport {
	readonly device: BluetoothDevice;
	/** Whether the scale can send events on the command characteristic. */
	commandNotifications = false;

	#listeners = new Set<ScaleListener>();
	#weight: BluetoothRemoteGATTCharacteristic | null = null;
	#command: BluetoothRemoteGATTCharacteristic | null = null;

	constructor(device: BluetoothDevice) {
		this.device = device;
		device.addEventListener('gattserverdisconnected', this.#onDisconnected);
	}

	get name(): string | null {
		return this.device.name ?? null;
	}

	get connected(): boolean {
		return this.device.gatt?.connected ?? false;
	}

	async connect(): Promise<void> {
		const gatt = this.device.gatt;
		if (!gatt) throw new Error('This device has no GATT server');
		const server = await gatt.connect();
		try {
			const service = await server.getPrimaryService(BOOKOO_SERVICE);
			const weight = await service.getCharacteristic(BOOKOO_WEIGHT_CHARACTERISTIC);
			const command = await service.getCharacteristic(BOOKOO_COMMAND_CHARACTERISTIC);
			this.#release();
			this.#weight = weight;
			this.#command = command;
			weight.addEventListener('characteristicvaluechanged', this.#onWeight);
			await weight.startNotifications();
			this.commandNotifications = command.properties.notify;
			if (command.properties.notify) {
				command.addEventListener('characteristicvaluechanged', this.#onCommand);
				await command.startNotifications();
			}
		} catch (e) {
			gatt.disconnect();
			throw e;
		}
	}

	disconnect(): void {
		this.device.gatt?.disconnect();
	}

	async send(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
		const c = this.#command;
		if (!c) throw new Error('Not connected');
		if (c.properties.write) await c.writeValueWithResponse(bytes);
		else await c.writeValueWithoutResponse(bytes);
	}

	subscribe(listener: ScaleListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/** The firmware version, if the scale exposes the standard service for it. */
	async firmware(): Promise<string | null> {
		const server = this.device.gatt;
		if (!server?.connected) return null;
		try {
			const service = await server.getPrimaryService(DEVICE_INFORMATION);
			const c = await service.getCharacteristic('firmware_revision_string');
			return new TextDecoder().decode(await c.readValue());
		} catch {
			return null;
		}
	}

	#release() {
		this.#weight?.removeEventListener('characteristicvaluechanged', this.#onWeight);
		this.#command?.removeEventListener('characteristicvaluechanged', this.#onCommand);
		this.#weight = null;
		this.#command = null;
	}

	#emit(channel: ScaleChannel, event: Event) {
		const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
		if (!value) return;
		// The browser may reuse the buffer, so keep a copy.
		const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
		const at = performance.now();
		for (const listener of this.#listeners) listener.data(channel, bytes, at);
	}

	#onWeight = (event: Event) => this.#emit('weight', event);
	#onCommand = (event: Event) => this.#emit('command', event);

	#onDisconnected = () => {
		this.#release();
		for (const listener of this.#listeners) listener.disconnected();
	};
}
