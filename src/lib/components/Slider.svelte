<script lang="ts">
	/**
	 * A disc in a slot, with a small dot at every step (D45). JavaScript only: without it, callers show radios.
	 * `name` posts the value through a hidden input, blank when unset. `blankAt` is the position meaning
	 * "not rated"; `marked` is a planned position, its dot green (D30). `linked` is for a slider that
	 * follows a selection elsewhere: its label stands out and animates when it changes.
	 */
	import type { Snippet } from 'svelte';
	import FieldError from '#lib/components/FieldError.svelte';

	let {
		label,
		min,
		max,
		value,
		onchange,
		name,
		blankAt,
		marked,
		linked = false,
		hint,
		error,
		aside
	}: {
		label: string;
		min: number;
		max: number;
		value: number | null;
		onchange: (value: number | null) => void;
		name?: string;
		blankAt?: number;
		marked?: number;
		linked?: boolean;
		hint?: string;
		error?: string;
		/** Beside the value, e.g. a button applying a planned one. */
		aside?: Snippet;
	} = $props();

	const uid = $props.id();
	const positions = $derived(Array.from({ length: max - min + 1 }, (_, i) => min + i));
	const describedBy = $derived(
		[hint ? `${uid}-hint` : '', error ? `${uid}-err` : ''].filter(Boolean).join(' ') || undefined
	);
</script>

<div class="slider">
	<div class="head">
		{#key label}
			<label class:linked for="{uid}-input">{label}</label>
		{/key}
		<div class="reading">
			{@render aside?.()}
			<span class="value" class:unset={value == null}>{value ?? '–'}</span>
		</div>
	</div>
	<div class="rail">
		<div class="ticks" aria-hidden="true">
			{#each positions as p (p)}
				<span class="tick" class:marked={p === marked} style:--at={(p - min) / (max - min)}></span>
			{/each}
		</div>
		<input
			id="{uid}-input"
			class:unset={value == null}
			type="range"
			{min}
			{max}
			step="1"
			value={value ?? blankAt ?? min}
			aria-valuetext={value == null ? 'not set' : `${value} of ${max}`}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
			oninput={(e) => {
				const position = e.currentTarget.valueAsNumber;
				onchange(position === blankAt ? null : position);
			}}
		/>
	</div>
	{#if name}<input type="hidden" {name} value={value ?? ''} />{/if}
	{#if hint}<span class="hint" id="{uid}-hint">{hint}</span>{/if}
	<FieldError id="{uid}-err" message={error} />
</div>

<style>
	.slider {
		/* The thumb's clear border makes it a 44px target around a 24px disc. */
		--thumb: 44px;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		/* Room for a suggestion button, so the row doesn't jump when it goes. */
		min-height: 2rem;
	}
	label {
		font-size: 0.875rem;
	}
	label.linked {
		font-size: 1rem;
		font-weight: 700;
		color: var(--accent-ink);
	}
	@media (prefers-reduced-motion: no-preference) {
		label.linked {
			animation: label-in 240ms cubic-bezier(0.16, 1, 0.3, 1);
		}
	}
	@keyframes label-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
	.reading {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.value {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.value.unset {
		color: var(--muted);
		font-weight: 400;
	}

	/* The slot and its dots are drawn here, so they can sit under the thumb. It's a field, like a text box. */
	.rail {
		position: relative;
		height: var(--thumb);
	}
	.rail::before {
		content: '';
		position: absolute;
		top: 50%;
		inset-inline: 6px;
		height: 32px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--field);
		transform: translateY(-50%);
	}
	.ticks {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	/* The thumb's centre travels from half a thumb in at each end. */
	.tick {
		position: absolute;
		top: 50%;
		left: calc(var(--thumb) / 2 + (100% - var(--thumb)) * var(--at));
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--muted);
		transform: translate(-50%, -50%);
	}
	.tick.marked {
		width: 10px;
		height: 10px;
		background: var(--plan);
	}

	input[type='range'] {
		-webkit-appearance: none;
		appearance: none;
		position: relative;
		display: block;
		width: 100%;
		height: var(--thumb);
		margin: 0;
		background: transparent;
		cursor: pointer;
	}
	input::-webkit-slider-runnable-track {
		height: var(--thumb);
		background: transparent;
	}
	input::-moz-range-track {
		height: var(--thumb);
		background: transparent;
	}
	input::-webkit-slider-thumb {
		-webkit-appearance: none;
		box-sizing: border-box;
		width: var(--thumb);
		height: var(--thumb);
		border: 10px solid transparent;
		border-radius: 50%;
		background: var(--accent) padding-box;
	}
	input::-moz-range-thumb {
		box-sizing: border-box;
		width: var(--thumb);
		height: var(--thumb);
		border: 10px solid transparent;
		border-radius: 50%;
		background: var(--accent) padding-box;
	}
	input.unset::-webkit-slider-thumb {
		background: var(--muted) padding-box;
	}
	input.unset::-moz-range-thumb {
		background: var(--muted) padding-box;
	}
</style>
