/**
 * Which scale this phone is paired with (D47). Kept in the browser because Bluetooth device ids only
 * mean something to the browser that issued them.
 */

export interface ScalePairing {
	scaleId: string;
	deviceId: string;
	deviceName: string | null;
}

const storageKey = (owner: string) => `unground:scale-pairing:${owner}`;

export function readPairing(owner: string): ScalePairing | null {
	try {
		const stored = JSON.parse(localStorage.getItem(storageKey(owner)) ?? 'null');
		return typeof stored?.scaleId === 'string' && typeof stored?.deviceId === 'string'
			? (stored as ScalePairing)
			: null;
	} catch {
		return null;
	}
}

export function writePairing(owner: string, pairing: ScalePairing): void {
	try {
		localStorage.setItem(storageKey(owner), JSON.stringify(pairing));
	} catch {
		// Storage can be full or blocked; it will just need pairing again.
	}
}

export function clearPairing(owner: string): void {
	try {
		localStorage.removeItem(storageKey(owner));
	} catch {
		// As above.
	}
}

/** The paired device among those the browser remembers. Falls back to its name if the id changed. */
export function matchDevice<T extends { id: string; name?: string }>(
	devices: readonly T[],
	pairing: ScalePairing
): T | null {
	return (
		devices.find((d) => d.id === pairing.deviceId) ??
		devices.find((d) => pairing.deviceName !== null && d.name === pairing.deviceName) ??
		null
	);
}
