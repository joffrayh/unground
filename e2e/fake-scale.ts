import type { Page } from '@playwright/test';

interface FakeScale {
	setPower(on: boolean): void;
	isConnected(): boolean;
	connectAttempts(): number;
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
			async writeValueWithResponse() {}
			async writeValueWithoutResponse() {}
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
			connectAttempts: () => attempts
		};
	});
}

export const setScalePower = (page: Page, on: boolean) =>
	page.evaluate((value) => window.fakeScale.setPower(value), on);

export const isScaleConnected = (page: Page) => page.evaluate(() => window.fakeScale.isConnected());
