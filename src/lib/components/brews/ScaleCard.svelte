<script lang="ts">
	/**
	 * The paired scale under the pours, shown while it's connected. Enter opens it, centres it, tares the
	 * scale and shows the live reading against pour 0's target. It only reads: nothing here is posted.
	 */
	import { tick } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { pourName } from '#lib/domain/pours.ts';
	import { scaleCommands } from '#lib/scale/bookoo.ts';
	import { formatReading } from '#lib/scale/format.ts';
	import { getScaleLink, type ScaleOption } from '#lib/scale/scale-link.svelte.ts';
	import type { PourTarget } from './pour-rows.ts';

	let { scales, targets }: { scales: readonly ScaleOption[]; targets: readonly PourTarget[] } =
		$props();

	const scaleLink = getScaleLink();
	const name = $derived(scales.find((s) => s.id === scaleLink.pairing?.scaleId)?.name ?? null);
	const connected = $derived(scaleLink.status === 'connected');

	let open = $state(false);
	let tareFailed = $state(false);
	let card = $state<HTMLElement>();

	async function enter() {
		open = true;
		tareFailed = false;
		await tick();
		card?.scrollIntoView({
			block: 'center',
			behavior: prefersReducedMotion.current ? 'auto' : 'smooth'
		});
		try {
			await scaleLink.send(scaleCommands.tare());
		} catch {
			tareFailed = true;
		}
	}
</script>

{#if name && (connected || open)}
	<section class="card scale" aria-label="Scale" bind:this={card}>
		<div class="head">
			<span class="dot" class:live={connected} aria-hidden="true"></span>
			<span class="name">{name}</span>
			{#if open}
				<button type="button" class="btn" onclick={() => (open = false)}>Exit</button>
			{:else}
				<button type="button" class="btn btn-scale" onclick={enter}>Enter</button>
			{/if}
		</div>
		{#if open}
			<div class="body">
				<p class="pour">{pourName(0)}</p>
				<p class="readout num">
					{formatReading(scaleLink.reading?.weight)} &gt; {formatReading(targets[0]?.cumulativeG)}
				</p>
				{#if tareFailed}<p class="error" role="alert">Couldn't tare</p>{/if}
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
	.pour {
		margin: 0;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.readout {
		margin: 0.25rem 0;
		font-size: clamp(1.5rem, 8.5vw, 2.5rem);
		white-space: nowrap;
	}
	.error {
		margin: 0;
		color: var(--danger);
		font-size: 0.875rem;
	}
</style>
