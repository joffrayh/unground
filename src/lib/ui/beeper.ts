/**
 * Short beeps from Web Audio. Browsers only let sound start from a tap, so `unlock` must be called from
 * one before `beep` makes a sound. Does nothing where the browser can't.
 */
export function createBeeper() {
	let ctx: AudioContext | null = null;

	return {
		/** Call from a tap. */
		unlock() {
			try {
				ctx ??= new AudioContext();
				if (ctx.state !== 'running') void ctx.resume();
			} catch {
				ctx = null;
			}
		},

		beep(hz: number, ms: number) {
			if (!ctx || ctx.state !== 'running') return;
			const at = ctx.currentTime;
			const end = at + ms / 1000;
			const tone = ctx.createOscillator();
			const gain = ctx.createGain();
			tone.frequency.value = hz;
			// A quick fade in and out, so it doesn't click.
			gain.gain.setValueAtTime(0.0001, at);
			gain.gain.exponentialRampToValueAtTime(0.3, at + 0.01);
			gain.gain.exponentialRampToValueAtTime(0.0001, end);
			tone.connect(gain).connect(ctx.destination);
			tone.start(at);
			tone.stop(end + 0.02);
		},

		close() {
			void ctx?.close();
			ctx = null;
		}
	};
}
