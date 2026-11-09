/** The link to a scale. Everything above it can run on a simulated scale instead of Bluetooth. */

/** `weight` carries the readings; `command` takes commands and may send events back. */
export type ScaleChannel = 'weight' | 'command';

export interface ScaleListener {
	/** `at` is `performance.now()` when the bytes arrived. */
	data(channel: ScaleChannel, bytes: Uint8Array, at: number): void;
	disconnected(): void;
}

export interface ScaleTransport {
	readonly name: string | null;
	readonly connected: boolean;
	connect(): Promise<void>;
	disconnect(): void;
	send(bytes: Uint8Array<ArrayBuffer>): Promise<void>;
	/** Returns the function that stops listening. */
	subscribe(listener: ScaleListener): () => void;
}
