import type { Page } from '@playwright/test';

interface FakeScale {
	setPower(on: boolean): void;
	isConnected(): boolean;
	connectAttempts(): number;
	sendReading(grams: number, flow: number, timerMs?: number): void;
	commands(): number[][];
}

declare global {
	interface Window {
		fakeScale: FakeScale;
	}
}

/**
 * Replaces Web Bluetooth with a simulated scale, so the real connection code runs. Permission for the
 * device survives a reload, as it does in a browser that remembers it.
 */
export async function installFakeScale(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const PERMITTED = 'fake-scale-permitted';
		let power = true;
		let attempts = 0;
		// As on iOS: after a restart the device must be heard before it can be connected.
		let heard = false;
		const commands: number[][] = [];

		class Characteristic extends EventTarget {
			value: DataView | null = null;
			properties: { notify: boolean; write: boolean };
			constructor(write: boolean) {
				super();
				this.properties = { notify: true, write };
			}
			async startNotifications() {
				return this;
			}
			async writeValueWithResponse(value: Uint8Array) {
				commands.push(Array.from(value));
			}
			async writeValueWithoutResponse(value: Uint8Array) {
				commands.push(Array.from(value));
			}
			emit(bytes: Uint8Array) {
				this.value = new DataView(bytes.buffer as ArrayBuffer);
				this.dispatchEvent(new Event('characteristicvaluechanged'));
			}
		}

		const weight = new Characteristic(false);
		const command = new Characteristic(true);
		const device = Object.assign(new EventTarget(), {
			id: 'fake-scale-id',
			name: 'BOOKOO_SC_FAKE',
			async watchAdvertisements() {
				if (!power) return;
				heard = true;
				queueMicrotask(() => device.dispatchEvent(new Event('advertisementreceived')));
			},
			gatt: {
				connected: false,
				async connect() {
					attempts++;
					if (!power || !heard) throw new DOMException('Unreachable', 'NetworkError');
					this.connected = true;
					return this;
				},
				disconnect() {
					if (!this.connected) return;
					this.connected = false;
					device.dispatchEvent(new Event('gattserverdisconnected'));
				},
				async getPrimaryService() {
					return {
						getCharacteristic: async (uuid: string) =>
							uuid.startsWith('0000ff11') ? weight : command
					};
				}
			}
		});

		Object.defineProperty(navigator, 'bluetooth', {
			value: {
				requestDevice: async () => {
					heard = true;
					localStorage.setItem(PERMITTED, '1');
					return device;
				},
				getDevices: async () => (localStorage.getItem(PERMITTED) ? [device] : []),
				getAvailability: async () => true
			}
		});

		window.fakeScale = {
			setPower(on) {
				power = on;
				if (!on) device.gatt.disconnect();
			},
			isConnected: () => device.gatt.connected,
			connectAttempts: () => attempts,
			commands: () => commands,
			sendReading(grams, flow, timerMs = 0) {
				const packet = new Uint8Array(20);
				const hundredths = Math.round(Math.abs(grams) * 100);
				const flowHundredths = Math.round(Math.abs(flow) * 100);
				const timer = [(timerMs >> 16) & 255, (timerMs >> 8) & 255, timerMs & 255];
				packet.set([0x03, 0x0b, ...timer, 1, grams < 0 ? 0x2d : 0x2b]);
				packet.set([(hundredths >> 16) & 255, (hundredths >> 8) & 255, hundredths & 255], 7);
				packet.set([flow < 0 ? 0x2d : 0x2b, (flowHundredths >> 8) & 255, flowHundredths & 255], 10);
				packet[19] = packet.subarray(0, 19).reduce((sum, b) => sum ^ b, 0);
				weight.emit(packet);
			}
		};
	});
}

export const setScalePower = (page: Page, on: boolean) =>
	page.evaluate((value) => window.fakeScale.setPower(value), on);

export const isScaleConnected = (page: Page) => page.evaluate(() => window.fakeScale.isConnected());

export const sendScaleReading = (page: Page, grams: number, flow = 0) =>
	page.evaluate(([g, f]) => window.fakeScale.sendReading(g, f), [grams, flow]);

/** Sends readings at once, each stamped with its own scale time: [timerMs, grams, flow]. */
export const playScaleReadings = (page: Page, readings: [number, number, number][]) =>
	page.evaluate((rows) => {
		for (const [timerMs, grams, flow] of rows) window.fakeScale.sendReading(grams, flow, timerMs);
	}, readings);

export const scaleConnectAttempts = (page: Page) =>
	page.evaluate(() => window.fakeScale.connectAttempts());

export const scaleCommandsSent = (page: Page) => page.evaluate(() => window.fakeScale.commands());
