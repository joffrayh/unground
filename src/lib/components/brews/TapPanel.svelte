<script lang="ts">
	/**
	 * Tap to pour (D53): Start at the first water, the big button as each later pour starts, Stop at the
	 * end of the drawdown. Each tap is handed to the pour editor, which writes the time into its row;
	 * Undo takes back the last one. Shows the clock, the pour under way with its target, and the
	 * countdown to the next pour when it has a time: beeps for its last three seconds, then a higher
	 * beep, a buzz and a pulsing button when it's due. JavaScript only.
	 */
	import { onDestroy, tick } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { formatDuration, pourName } from '#lib/domain/pours.ts';
	import { createBeeper } from '#lib/ui/beeper.ts';
	import { createWakeLock } from '#lib/ui/wake-lock.ts';
	import {
		IDLE_TAPS,
		countdownCue,
		tapElapsedMs,
		tapEnd,
		tapPhase,
		tapPour,
		tapStart,
		tapUndo,
		type TapPhase
	} from './tap-log.ts';

	let {
		targets,
		plannedStarts,
		onphase,
		onstart,
		onunstart,
		onpour,
		onunpour,
		onend
	}: {
		/** Each row's running total to reach (g), if it has one. */
		targets: readonly (number | null)[];
		/** Each row's start (s) typed or from the previous brew, for the countdown. */
		plannedStarts: readonly (number | null)[];
		onphase: (phase: TapPhase) => void;
		/** A new brew started. */
		onstart: () => void;
		/** The start was taken back. */
		onunstart: () => void;
		/** Pour `index` (from 1) started at `startS`. */
		onpour: (index: number, startS: number) => void;
		/** The tap that started pour `index` was taken back. */
		onunpour: (index: number) => void;
		/** The brew's total time, or null when the end was taken back. */
		onend: (totalS: number | null) => void;
	} = $props();

	const wakeLock = createWakeLock();
	const beeper = createBeeper();
	let log = $state.raw(IDLE_TAPS);
	let now = $state(0);
	let panel = $state<HTMLElement>();

	const phase = $derived(tapPhase(log));
	$effect(() => onphase(phase));

	// The clock ticks only while the brew runs.
	$effect(() => {
		if (phase !== 'running') return;
		now = performance.now();
		const timer = setInterval(() => (now = performance.now()), 250);
		return () => clearInterval(timer);
	});

	const elapsedMs = $derived(tapElapsedMs(log, now));
	/** The pour under way. */
	const current = $derived(Math.max(log.starts.length - 1, 0));
	const target = $derived(targets[current] ?? null);
	const dueS = $derived(plannedStarts[current + 1] ?? null);
	const untilMs = $derived(dueS === null ? null : dueS * 1000 - elapsedMs);
	const secondsLeft = $derived(untilMs === null ? null : Math.ceil(untilMs / 1000));
	const due = $derived(phase === 'running' && secondsLeft !== null && secondsLeft <= 0);

	/** The countdown last cued, so each second sounds once. */
	let cued: { pour: number; left: number | null } | null = null;
	$effect(() => {
		if (phase !== 'running') {
			cued = null;
			return;
		}
		const before = cued?.pour === current ? cued.left : null;
		cued = { pour: current, left: secondsLeft };
		const cue = countdownCue(before, secondsLeft);
		if (cue === 'tick') beeper.beep(880, 90);
		if (cue === 'go') {
			beeper.beep(1320, 400);
			navigator.vibrate?.([120, 80, 120]);
		}
	});

	const clock = (ms: number) => formatDuration(Math.floor(ms / 1000));
	/** Rounds up, so it reads 0:01 until the moment to pour. */
	const countdown = (ms: number) => formatDuration(Math.ceil(ms / 1000));

	function buzz() {
		navigator.vibrate?.(15);
	}

	async function start() {
		beeper.unlock();
		log = tapStart(performance.now());
		now = performance.now();
		onstart();
		wakeLock.hold();
		buzz();
		await tick();
		panel?.scrollIntoView({
			block: 'center',
			behavior: prefersReducedMotion.current ? 'auto' : 'smooth'
		});
	}

	function pour() {
		// Again on every tap, in case the browser suspended the sound meanwhile.
		beeper.unlock();
		log = tapPour(log, performance.now());
		buzz();
		onpour(log.starts.length - 1, log.starts.at(-1) ?? 0);
	}

	function stop() {
		log = tapEnd(log, performance.now());
		wakeLock.release();
		buzz();
		onend(log.totalS);
	}

	function undo() {
		const before = log;
		log = tapUndo(log);
		if (before.totalS !== null) {
			wakeLock.hold();
			onend(null);
		} else if (before.starts.length > 1) {
			onunpour(before.starts.length - 1);
		} else {
			wakeLock.release();
			onunstart();
		}
	}

	onDestroy(() => {
		wakeLock.release();
		beeper.close();
	});
</script>

<section class="tap" aria-label="Tap to pour" bind:this={panel}>
	{#if phase === 'idle'}
		<button type="button" class="btn btn-scale go" onclick={start}>Start</button>
	{:else}
		<p class="label">
			{#if phase === 'done'}Done{:else}{pourName(current)}{#if target !== null}
					<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true">
						<path d="M4 12h15M13 6l6 6-6 6" />
					</svg><span class="visually-hidden">target</span>
					<span class="num">{target} g</span>{/if}{/if}
		</p>
		<p class="clock num" role="timer">{clock(elapsedMs)}</p>

		{#if phase === 'running'}
			<button type="button" class="btn btn-scale go" class:now={due} onclick={pour}>
				{pourName(current + 1)}
				{#if due}
					<span class="due">now</span>
				{:else if untilMs !== null}
					<span class="due num" aria-hidden="true">{countdown(untilMs)}</span>
				{/if}
			</button>
		{/if}

		<div class="actions">
			<button type="button" class="btn" onclick={undo}>Undo</button>
			{#if phase === 'running'}
				<button type="button" class="btn" onclick={stop}>Stop</button>
			{/if}
		</div>
	{/if}
</section>

<style>
	.tap {
		margin: 0 0 0.75rem;
		text-align: center;
	}
	.tap p {
		margin: 0;
	}
	.label {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.arrow {
		flex: none;
		width: 1rem;
		height: 1rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.clock {
		font-family: var(--display);
		font-size: clamp(2.25rem, 12vw, 3.25rem);
		line-height: 1.2;
	}
	.go {
		width: 100%;
		min-height: 64px;
		font-size: 1.25rem;
		margin-top: 0.5rem;
		align-items: baseline;
		/* Baseline alignment drops centring: the padding does it instead. */
		padding-top: 1.05rem;
	}
	/* Due: a ring pulses out from the button until it's tapped. */
	.now {
		animation: due 1.2s ease-out infinite;
	}
	@keyframes due {
		from {
			box-shadow: 0 0 0 0 color-mix(in srgb, var(--scale) 70%, transparent);
		}
		to {
			box-shadow: 0 0 0 14px color-mix(in srgb, var(--scale) 0%, transparent);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.now {
			animation: none;
			box-shadow: 0 0 0 4px color-mix(in srgb, var(--scale) 45%, transparent);
		}
	}
	.due {
		font-family: var(--font);
		font-size: 1rem;
		font-weight: 700;
		opacity: 0.7;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	.actions .btn {
		flex: 1;
	}
</style>
