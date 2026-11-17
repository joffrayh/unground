<script lang="ts">
	/**
	 * Pour timer (D62): Start at the first water, Stop at the end of the drawdown. The pours are the
	 * plan already in the rows; the timer only says when each is due: beeps for the last three seconds,
	 * then a higher beep, a buzz and a pulsing "now". Stop hands the total time to the form; Undo takes
	 * it back and the clock runs on. Reset goes back to before Start. JavaScript only.
	 */
	import { onDestroy, tick } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { formatDuration, pourName } from '#lib/domain/pours.ts';
	import { createBeeper } from '#lib/ui/beeper.ts';
	import { createWakeLock } from '#lib/ui/wake-lock.ts';
	import {
		IDLE_CLOCK,
		currentPour,
		nextPour,
		timerCue,
		timerElapsedMs,
		timerPhase,
		timerResume,
		timerStart,
		timerStop,
		type TimerPhase
	} from './pour-timer.ts';

	let {
		targets,
		starts,
		onphase,
		onend
	}: {
		/** Each row's running total to reach (g), if it has one. */
		targets: readonly (number | null)[];
		/** Each row's start (s), typed or its placeholder; pour 0 is 0. */
		starts: readonly (number | null)[];
		onphase: (phase: TimerPhase) => void;
		/** The brew's total time, or null when Stop was taken back. */
		onend: (totalS: number | null) => void;
	} = $props();

	/** "now" pulses this long after a pour comes due. */
	const NOW_MS = 5000;

	const wakeLock = createWakeLock();
	const beeper = createBeeper();
	let clock = $state.raw(IDLE_CLOCK);
	let now = $state(0);
	let panel = $state<HTMLElement>();

	const phase = $derived(timerPhase(clock));
	$effect(() => onphase(phase));

	// The clock ticks only while the brew runs.
	$effect(() => {
		if (phase !== 'running') return;
		now = performance.now();
		const timer = setInterval(() => (now = performance.now()), 250);
		return () => clearInterval(timer);
	});

	const elapsedMs = $derived(timerElapsedMs(clock, now));
	const current = $derived(currentPour(starts, elapsedMs));
	const target = $derived(targets[current] ?? null);
	const next = $derived(nextPour(starts, elapsedMs));
	const untilMs = $derived(next === null ? null : (starts[next] ?? 0) * 1000 - elapsedMs);
	/** The pour under way has just come due. */
	const due = $derived(
		phase === 'running' && current > 0 && elapsedMs - (starts[current] ?? 0) * 1000 < NOW_MS
	);

	/** Where the clock was at the last cue check, so each cue sounds once. */
	let cuedAt: number | null = null;
	$effect(() => {
		if (phase !== 'running') {
			cuedAt = null;
			return;
		}
		const cue = cuedAt === null ? null : timerCue(starts, cuedAt, elapsedMs);
		cuedAt = elapsedMs;
		if (cue === 'tick') beeper.beep(880, 90);
		if (cue === 'go') {
			beeper.beep(1320, 400);
			navigator.vibrate?.([120, 80, 120]);
		}
	});

	const clockText = (ms: number) => formatDuration(Math.floor(ms / 1000));
	/** Rounds up, so it reads 0:01 until the moment to pour. */
	const countdown = (ms: number) => formatDuration(Math.ceil(ms / 1000));

	function buzz() {
		navigator.vibrate?.(15);
	}

	async function start() {
		// The tap on Start is what lets the browser play the beeps.
		beeper.unlock();
		clock = timerStart(performance.now());
		now = performance.now();
		wakeLock.hold();
		buzz();
		await tick();
		panel?.scrollIntoView({
			block: 'center',
			behavior: prefersReducedMotion.current ? 'auto' : 'smooth'
		});
	}

	function stop() {
		const at = performance.now();
		clock = timerStop(clock, at, starts[currentPour(starts, at - (clock.startedAt ?? at))] ?? 0);
		wakeLock.release();
		buzz();
		onend(clock.totalS);
	}

	function undo() {
		clock = timerResume(clock);
		wakeLock.hold();
		onend(null);
	}

	function reset() {
		clock = IDLE_CLOCK;
		wakeLock.release();
	}

	onDestroy(() => {
		wakeLock.release();
		beeper.close();
	});
</script>

<section class="timer" aria-label="Pour timer" bind:this={panel}>
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
		<p class="clock num" role="timer">{clockText(elapsedMs)}</p>

		{#if phase === 'running'}
			{#if due}
				<p class="next now" role="status">{pourName(current)} <span class="due">now</span></p>
			{:else if next !== null && untilMs !== null}
				<p class="next">
					{pourName(next)} <span class="due num">{countdown(untilMs)}</span>
				</p>
			{/if}
		{/if}

		<div class="actions">
			{#if phase === 'running'}
				<button type="button" class="btn" onclick={reset}>Reset</button>
				<button type="button" class="btn" onclick={stop}>Stop</button>
			{:else}
				<button type="button" class="btn" onclick={undo}>Undo</button>
			{/if}
		</div>
	{/if}
</section>

<style>
	.timer {
		margin: 0 0 0.75rem;
		text-align: center;
	}
	.timer p {
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
	}
	.timer .next {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-height: 64px;
		margin-top: 0.5rem;
		border: 2px solid var(--scale);
		border-radius: var(--radius-sm);
		font-size: 1.25rem;
		font-weight: 700;
	}
	/* Due: the box fills and a ring pulses out from it. */
	.now {
		background: var(--scale);
		color: var(--accent-text);
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
