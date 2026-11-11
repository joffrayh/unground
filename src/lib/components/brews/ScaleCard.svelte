<script lang="ts">
	/**
	 * The paired scale under the pours, shown while it's connected. Enter opens it, centres it, tares the
	 * scale and guides the brew: the live reading against each pour's target, a countdown to the next
	 * pour, and the end when the brewer is lifted off (D49). When the brew finishes it hands over what
	 * was measured; leaving part-way with Exit discards it.
	 */
	import { onDestroy, tick } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { formatDuration, pourName } from '#lib/domain/pours.ts';
	import { scaleCommands } from '#lib/scale/bookoo.ts';
	import { createBrewGuide, type GuideCommand, type GuideState } from '#lib/scale/brew-guide.ts';
	import { formatReading } from '#lib/scale/format.ts';
	import { getScaleLink, type ScaleOption } from '#lib/scale/scale-link.svelte.ts';
	import { createWakeLock } from '#lib/ui/wake-lock.ts';
	import type { PourTarget } from './pour-rows.ts';

	let {
		scales,
		targets,
		open = $bindable(false),
		onfinish
	}: {
		scales: readonly ScaleOption[];
		targets: readonly PourTarget[];
		/** Guiding a brew. */
		open?: boolean;
		/** The brew has finished, with what was measured and the scale that measured it. */
		onfinish: (brew: GuideState, scaleId: string) => void;
	} = $props();

	const scaleLink = getScaleLink();
	const wakeLock = createWakeLock();
	const name = $derived(scales.find((s) => s.id === scaleLink.pairing?.scaleId)?.name ?? null);
	const connected = $derived(scaleLink.status === 'connected');

	let tareFailed = $state(false);
	let card = $state<HTMLElement>();
	let guide: ReturnType<typeof createBrewGuide> | null = null;
	let stopReading: (() => void) | null = null;
	let view = $state.raw<GuideState | null>(null);

	const phase = $derived(view?.phase ?? 'arming');
	const started = $derived(phase !== 'arming' && phase !== 'waiting');
	const brewing = $derived(started && phase !== 'done');
	const canSkip = $derived(phase === 'pouring' || phase === 'short' || phase === 'countdown');
	const live = $derived(formatReading(connected ? scaleLink.reading?.weight : undefined));

	function send(commands: GuideCommand[]) {
		for (const command of commands) scaleLink.send(scaleCommands[command]()).catch(() => {});
	}

	function apply(commands: GuideCommand[]) {
		const before = view?.phase;
		if (guide) view = guide.snapshot();
		send(commands);
		const scaleId = scaleLink.pairing?.scaleId;
		if (view?.phase === 'done' && before !== 'done' && scaleId) onfinish(view, scaleId);
	}

	// A target edited in the form shows at once.
	$effect(() => {
		if (targets && guide) view = guide.snapshot();
	});

	async function enter() {
		guide = createBrewGuide(() => targets);
		view = guide.snapshot();
		stopReading = scaleLink.onReading((reading, at) => apply(guide?.push(reading, at) ?? []));
		wakeLock.hold();
		open = true;
		tareFailed = false;
		await tick();
		card?.scrollIntoView({
			block: 'center',
			behavior: prefersReducedMotion.current ? 'auto' : 'smooth'
		});
		try {
			await scaleLink.send(scaleCommands.tare());
			await scaleLink.send(scaleCommands.resetTimer());
		} catch {
			tareFailed = true;
		}
	}

	function close() {
		stopReading?.();
		stopReading = null;
		guide = null;
		wakeLock.release();
	}
	onDestroy(close);

	function exit() {
		if (brewing && !confirm('Exit this brew?')) return;
		send(guide?.stop() ?? []);
		close();
		view = null;
		open = false;
	}

	const clock = (ms: number) => formatDuration(Math.floor(ms / 1000));
	/** Rounds up, so it reads 0:01 until the moment to pour. */
	const countdown = (ms: number) => formatDuration(Math.ceil(ms / 1000));
</script>

{#if name && (connected || open)}
	<section class="card scale" aria-label="Scale" bind:this={card}>
		<div class="head">
			<span class="dot" class:live={connected} aria-hidden="true"></span>
			<span class="name">{name}</span>
			{#if open}
				<button type="button" class="btn" onclick={exit}>Exit</button>
			{:else}
				<button type="button" class="btn btn-scale" onclick={enter}>Enter</button>
			{/if}
		</div>

		{#if open && view}
			<div class="body">
				{#if started}<p class="elapsed">{clock(view.elapsedMs)}</p>{/if}

				<p class="label">
					{#if phase === 'drawdown'}Drawdown{:else if phase === 'done'}Done{:else}{pourName(
							view.pour
						)}{/if}
				</p>
				<p class="readout num">
					<span class="current">{live}</span>
					{#if view.target !== null}
						<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true">
							<path d="M4 12h15M13 6l6 6-6 6" />
						</svg>
						<span class="visually-hidden">target</span>
						<span class="target">{formatReading(view.target)}</span>
					{/if}
				</p>

				{#if phase === 'drawdown'}
					<p class="status">Lift to finish</p>
				{:else if phase === 'short' && view.target !== null}
					<p class="status short">{formatReading(view.target - view.weight)} short</p>
				{:else if phase === 'countdown' && view.countdownMs !== null}
					<p class="status countdown">
						{view.countdownMs > 0 ? countdown(view.countdownMs) : 'Pour'}
					</p>
				{:else if phase === 'countdown'}
					<p class="status">Pour when ready</p>
				{/if}

				{#if tareFailed}<p class="error" role="alert">Couldn't tare</p>{/if}

				{#if brewing}
					<div class="actions">
						{#if canSkip}
							<button type="button" class="btn" onclick={() => apply(guide?.next() ?? [])}
								>Next</button
							>
						{/if}
						<button type="button" class="btn" onclick={() => apply(guide?.stop() ?? [])}
							>Stop</button
						>
					</div>
				{/if}
			</div>
		{/if}
	</section>
{/if}

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.dot {
		flex: none;
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		background: var(--muted);
	}
	.dot.live {
		background: var(--ok);
	}
	.name {
		flex: 1;
		min-width: 0;
		font-family: var(--display);
		overflow-wrap: anywhere;
	}
	.body {
		margin-top: 0.75rem;
		text-align: center;
	}
	.body p {
		margin: 0;
	}
	.elapsed,
	.label {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.elapsed {
		font-family: var(--display);
		font-size: 1.1rem;
	}
	.body .readout {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin: 0.25rem 0;
		white-space: nowrap;
	}
	.current {
		font-size: clamp(2rem, 11vw, 3rem);
		font-weight: 700;
	}
	.target {
		color: var(--muted);
		font-size: clamp(1.1rem, 6vw, 1.6rem);
	}
	.arrow {
		flex: none;
		width: clamp(1.1rem, 6vw, 1.5rem);
		height: clamp(1.1rem, 6vw, 1.5rem);
		fill: none;
		stroke: var(--muted);
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.status {
		font-size: 1.1rem;
	}
	.short {
		color: var(--danger);
	}
	.countdown {
		color: var(--scale);
		font-family: var(--display);
		font-size: clamp(2rem, 12vw, 3.25rem);
	}
	.error {
		color: var(--danger);
		font-size: 0.875rem;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.actions .btn {
		flex: 1;
	}
</style>
