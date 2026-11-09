<script lang="ts">
	/**
	 * Scale test page: live readings, raw bytes, every command and the reconnection checks, with a
	 * report to copy out. Not linked from anywhere. Bluefy has no developer tools, so all the findings
	 * have to be on the page.
	 */
	import { onMount } from 'svelte';
	import { bytesToHex, scaleCommands } from '#lib/scale/bookoo.ts';
	import type { ScaleChannel } from '#lib/scale/transport.ts';
	import { WebBluetoothTransport, requestScale } from '#lib/scale/web-bluetooth.ts';
	import { createProbe } from './probe.ts';

	/** Longer than a tap's permission lasts, so what follows really runs without one. */
	const NO_TAP_DELAY_MS = 6000;
	const MAX_LOG_LINES = 500;

	interface Command {
		label: string;
		bytes: Uint8Array<ArrayBuffer>;
	}

	const COMMAND_GROUPS: { title: string; commands: Command[] }[] = [
		{
			title: 'Commands',
			commands: [
				{ label: 'Tare', bytes: scaleCommands.tare() },
				{ label: 'Start', bytes: scaleCommands.startTimer() },
				{ label: 'Stop', bytes: scaleCommands.stopTimer() },
				{ label: 'Reset', bytes: scaleCommands.resetTimer() },
				{ label: 'Tare + start', bytes: scaleCommands.tareAndStart() }
			]
		},
		{
			// The checksums Beanconqueror sends, which differ from Bookoo's documented rule.
			title: 'Alternative checksums',
			commands: [
				{ label: 'Start', bytes: Uint8Array.of(0x03, 0x0a, 0x04, 0, 0, 0x0a) },
				{ label: 'Stop', bytes: Uint8Array.of(0x03, 0x0a, 0x05, 0, 0, 0x0d) },
				{ label: 'Reset', bytes: Uint8Array.of(0x03, 0x0a, 0x06, 0, 0, 0x0c) },
				{ label: 'Tare + start', bytes: Uint8Array.of(0x03, 0x0a, 0x07, 0, 0, 0x00) }
			]
		},
		{
			title: 'Timing mode stops on',
			commands: [
				{ label: 'Flow', bytes: scaleCommands.timingStopCondition('flow') },
				{ label: 'Filter removed', bytes: scaleCommands.timingStopCondition('filterRemoved') },
				{ label: 'Server removed', bytes: scaleCommands.timingStopCondition('serverRemoved') }
			]
		},
		{
			title: 'Flow smoothing',
			commands: [
				{ label: 'On', bytes: scaleCommands.flowSmoothing(true) },
				{ label: 'Off', bytes: scaleCommands.flowSmoothing(false) }
			]
		}
	];

	const probe = createProbe();
	const startedAt = typeof performance === 'undefined' ? 0 : performance.now();

	let transport: WebBluetoothTransport | null = null;
	let unsubscribe: (() => void) | null = null;
	let noTapTimer: ReturnType<typeof setTimeout> | undefined;
	let wakeLock: WakeLockSentinel | null = null;

	let hydrated = $state(false);
	let status = $state<'idle' | 'connecting' | 'connected' | 'disconnected'>('idle');
	let scaleName = $state('');
	let stats = $state.raw(probe.snapshot());
	let environment = $state.raw<Record<string, unknown>>({});
	let log = $state.raw<string[]>([]);
	let keepingAwake = $state(false);
	let copied = $state(false);

	const connected = $derived(status === 'connected');
	const live = $derived(stats.latest);
	const report = $derived(JSON.stringify({ environment, scaleName, stats, log }, null, 1));

	function note(line: string) {
		const seconds = ((performance.now() - startedAt) / 1000).toFixed(2);
		log = [...log.slice(1 - MAX_LOG_LINES), `+${seconds}s ${line}`];
	}

	function describeError(e: unknown): string {
		return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
	}

	function onData(channel: ScaleChannel, bytes: Uint8Array, at: number) {
		probe.record(channel, bytes, at).forEach(note);
		stats = probe.snapshot();
	}

	async function open(t: WebBluetoothTransport) {
		status = 'connecting';
		const begun = performance.now();
		try {
			await t.connect();
			status = 'connected';
			note(`connected in ${Math.round(performance.now() - begun)} ms`);
			note(`command notifications: ${t.commandNotifications}`);
			note(`firmware: ${(await t.firmware()) ?? 'not exposed'}`);
		} catch (e) {
			status = 'disconnected';
			note(`connect failed: ${describeError(e)}`);
		}
	}

	function detach() {
		unsubscribe?.();
		unsubscribe = null;
		transport?.disconnect();
		transport = null;
	}

	async function attach(device: BluetoothDevice) {
		detach();
		const t = new WebBluetoothTransport(device);
		transport = t;
		scaleName = device.name ?? device.id;
		note(`device: ${device.name ?? 'no name'} (${device.id})`);
		note(`watchAdvertisements: ${'watchAdvertisements' in device}`);
		unsubscribe = t.subscribe({
			data: onData,
			disconnected: () => {
				status = 'disconnected';
				note('disconnected');
			}
		});
		await open(t);
	}

	async function choose(anyDevice = false) {
		try {
			await attach(await requestScale(anyDevice));
		} catch (e) {
			note(`chooser: ${describeError(e)}`);
		}
	}

	async function send(group: string, command: Command) {
		const hex = bytesToHex(command.bytes);
		try {
			await transport?.send(command.bytes);
			note(`sent ${group} / ${command.label}: ${hex}`);
		} catch (e) {
			note(`send failed (${hex}): ${describeError(e)}`);
		}
	}

	async function checkRememberedDevices() {
		if (!navigator.bluetooth?.getDevices) {
			note('getDevices: not available');
			return;
		}
		try {
			const devices = await navigator.bluetooth.getDevices();
			note(`getDevices: ${devices.length} device(s)`);
			if (devices[0]) await attach(devices[0]);
		} catch (e) {
			note(`getDevices failed: ${describeError(e)}`);
		}
	}

	function afterDelay(what: string, action: () => void) {
		clearTimeout(noTapTimer);
		note(`${what} in ${NO_TAP_DELAY_MS / 1000} s`);
		noTapTimer = setTimeout(action, NO_TAP_DELAY_MS);
	}

	function reconnectWithoutTap() {
		const t = transport;
		if (!t) return;
		t.disconnect();
		afterDelay('reconnecting without a tap', () => open(t));
	}

	function chooserWithoutTap() {
		afterDelay('opening the chooser without a tap', () => choose());
	}

	async function toggleWakeLock() {
		if (wakeLock) {
			await wakeLock.release();
			return;
		}
		try {
			const lock = await navigator.wakeLock.request('screen');
			wakeLock = lock;
			keepingAwake = true;
			note('wake lock: on');
			lock.addEventListener('release', () => {
				wakeLock = null;
				keepingAwake = false;
				note('wake lock: released');
			});
		} catch (e) {
			note(`wake lock failed: ${describeError(e)}`);
		}
	}

	async function copyReport() {
		try {
			await navigator.clipboard.writeText(report);
			copied = true;
		} catch (e) {
			note(`copy failed: ${describeError(e)}`);
		}
	}

	onMount(() => {
		hydrated = true;
		const bluetooth = navigator.bluetooth;
		environment = {
			userAgent: navigator.userAgent,
			secureContext: window.isSecureContext,
			webBluetooth: !!bluetooth,
			getDevices: !!bluetooth?.getDevices,
			wakeLock: 'wakeLock' in navigator
		};
		bluetooth
			?.getAvailability?.()
			.then((available) => (environment = { ...environment, adapterAvailable: available }))
			.catch((e) => note(`getAvailability failed: ${describeError(e)}`));
		if (bluetooth) checkRememberedDevices();
		return () => {
			clearTimeout(noTapTimer);
			detach();
			wakeLock?.release();
		};
	});

	const hasBluetooth = $derived(hydrated && environment.webBluetooth === true);
	const fixed = (n: number | undefined, digits: number) =>
		n === undefined ? '—' : n.toFixed(digits);
</script>

<svelte:head><title>Scale test · Unground</title></svelte:head>

<div class="page-header">
	<h1>Scale test</h1>
</div>

<div class="stack">
	<section class="card stack" aria-label="Connection">
		<p class="status" data-status={status}>
			<span class="dot" aria-hidden="true"></span>
			{status}{scaleName ? ` · ${scaleName}` : ''}
		</p>
		{#if hydrated && !hasBluetooth}
			<p class="error-text">Web Bluetooth isn't available here.</p>
		{/if}
		<div class="buttons">
			<button class="btn btn-primary" disabled={!hasBluetooth} onclick={() => choose()}
				>Connect</button
			>
			<button class="btn" disabled={!hasBluetooth} onclick={() => choose(true)}>Any device</button>
			<button class="btn" disabled={!connected} onclick={() => transport?.disconnect()}
				>Disconnect</button
			>
		</div>
	</section>

	<section class="card" aria-label="Live readings">
		<dl class="readings num">
			<div>
				<dt>Weight</dt>
				<dd class="big">{fixed(live?.weight, 2)}</dd>
			</div>
			<div>
				<dt>Flow</dt>
				<dd class="big">{fixed(live?.flow, 2)}</dd>
			</div>
			<div>
				<dt>Timer (s)</dt>
				<dd class="big">{live ? (live.timerMs / 1000).toFixed(2) : '—'}</dd>
			</div>
			<div>
				<dt>Rate (Hz)</dt>
				<dd>{stats.rateHz ?? '—'}</dd>
			</div>
			<div>
				<dt>Battery</dt>
				<dd>{live ? `${live.batteryPct}%` : '—'}</dd>
			</div>
			<div>
				<dt>Smoothing</dt>
				<dd>{live ? (live.flowSmoothing ? 'on' : 'off') : '—'}</dd>
			</div>
		</dl>
		<p class="raw num">{stats.lastRaw.weight || '—'}</p>
	</section>

	{#each COMMAND_GROUPS as group (group.title)}
		<section class="card stack" aria-label={group.title}>
			<h2>{group.title}</h2>
			<div class="buttons">
				{#each group.commands as command (command.label)}
					<button class="btn" disabled={!connected} onclick={() => send(group.title, command)}
						>{command.label}</button
					>
				{/each}
			</div>
		</section>
	{/each}

	<section class="card stack" aria-label="Checks">
		<h2>Checks</h2>
		<div class="buttons">
			<button class="btn" disabled={!connected} onclick={reconnectWithoutTap}
				>Reconnect, no tap</button
			>
			<button class="btn" disabled={!hasBluetooth} onclick={chooserWithoutTap}
				>Chooser, no tap</button
			>
			<button class="btn" disabled={!hydrated} onclick={toggleWakeLock}
				>{keepingAwake ? 'Let screen sleep' : 'Keep screen on'}</button
			>
		</div>
	</section>

	<section class="card stack" aria-label="Report">
		<div class="report-head">
			<h2>Report</h2>
			<button class="btn btn-sm" disabled={!hydrated} onclick={copyReport}
				>{copied ? 'Copied' : 'Copy'}</button
			>
		</div>
		<label class="visually-hidden" for="scale-report">Report</label>
		<textarea id="scale-report" readonly rows="10" value={report}></textarea>
	</section>
</div>

<style>
	h2 {
		margin: 0;
	}
	.status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
	}
	.dot {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		background: var(--muted);
	}
	[data-status='connected'] .dot {
		background: var(--ok);
	}
	[data-status='connecting'] .dot {
		background: var(--accent);
	}
	.error-text {
		margin: 0;
		color: var(--danger);
	}
	.buttons {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
		gap: 0.5rem;
	}
	.readings {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
		margin: 0;
	}
	dt {
		font-size: 0.75rem;
		color: var(--muted);
	}
	dd {
		margin: 0;
		font-size: 1.1rem;
	}
	.big {
		font-size: 1.6rem;
	}
	.raw {
		margin: 0.75rem 0 0;
		font-size: 0.75rem;
		color: var(--muted);
		overflow-wrap: anywhere;
	}
	.report-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	textarea {
		font-size: 0.75rem;
	}
</style>
