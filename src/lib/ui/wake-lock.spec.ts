import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWakeLock } from './wake-lock';

const flush = () => new Promise((resolve) => setTimeout(resolve));

function fakeBrowser({ supported = true } = {}) {
	const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
	const locks: (EventTarget & { release: () => Promise<void> })[] = [];
	const request = vi.fn(async () => {
		const lock = Object.assign(new EventTarget(), {
			release: vi.fn(async () => {
				lock.dispatchEvent(new Event('release'));
			})
		});
		locks.push(lock);
		return lock;
	});
	vi.stubGlobal('document', document);
	vi.stubGlobal('navigator', supported ? { wakeLock: { request } } : {});
	return { document, locks, request };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('createWakeLock', () => {
	it('takes the lock when held, once', async () => {
		const { request } = fakeBrowser();
		const wake = createWakeLock();
		wake.hold();
		wake.hold();
		await flush();
		expect(request).toHaveBeenCalledTimes(1);
	});

	it('gives the lock back on release', async () => {
		const { locks } = fakeBrowser();
		const wake = createWakeLock();
		wake.hold();
		await flush();
		wake.release();
		expect(locks[0].release).toHaveBeenCalledTimes(1);
	});

	it('takes it again on coming back, after the browser dropped it', async () => {
		const { document, locks, request } = fakeBrowser();
		const wake = createWakeLock();
		wake.hold();
		await flush();
		locks[0].dispatchEvent(new Event('release'));
		document.dispatchEvent(new Event('visibilitychange'));
		await flush();
		expect(request).toHaveBeenCalledTimes(2);
	});

	it('does not take it while hidden', async () => {
		const { document, request } = fakeBrowser();
		document.visibilityState = 'hidden';
		createWakeLock().hold();
		await flush();
		expect(request).not.toHaveBeenCalled();
	});

	it('stops taking it after release', async () => {
		const { document, request } = fakeBrowser();
		const wake = createWakeLock();
		wake.hold();
		await flush();
		wake.release();
		document.dispatchEvent(new Event('visibilitychange'));
		await flush();
		expect(request).toHaveBeenCalledTimes(1);
	});

	it('gives back a lock granted after release', async () => {
		const { locks } = fakeBrowser();
		const wake = createWakeLock();
		wake.hold();
		wake.release();
		await flush();
		expect(locks[0].release).toHaveBeenCalledTimes(1);
	});

	it('survives being refused', async () => {
		const { request } = fakeBrowser();
		request.mockRejectedValueOnce(new Error('Low battery'));
		const wake = createWakeLock();
		wake.hold();
		await flush();
		expect(() => wake.release()).not.toThrow();
	});

	it('does nothing in a browser without it', () => {
		fakeBrowser({ supported: false });
		const wake = createWakeLock();
		expect(() => {
			wake.hold();
			wake.release();
		}).not.toThrow();
	});
});
