/**
 * Keeps the screen on while held. The browser drops the lock whenever the app is hidden, so it's taken
 * again on coming back. Does nothing where the browser can't.
 */
export function createWakeLock() {
	let wanted = false;
	let lock: WakeLockSentinel | null = null;

	async function acquire() {
		if (!wanted || lock || document.visibilityState !== 'visible') return;
		try {
			const taken = await navigator.wakeLock.request('screen');
			if (!wanted) {
				await taken.release();
				return;
			}
			lock = taken;
			taken.addEventListener('release', () => {
				if (lock === taken) lock = null;
			});
		} catch {
			// Refused (low battery, say). The screen just follows its usual timeout.
		}
	}

	return {
		hold() {
			if (wanted || !('wakeLock' in navigator)) return;
			wanted = true;
			document.addEventListener('visibilitychange', acquire);
			acquire();
		},

		release() {
			if (!wanted) return;
			wanted = false;
			document.removeEventListener('visibilitychange', acquire);
			lock?.release();
			lock = null;
		}
	};
}
