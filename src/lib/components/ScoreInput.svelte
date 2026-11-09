<script lang="ts">
	/**
	 * A 1–10 score as a row of radio pills plus "not rated". Radios (not a slider) so an unset score is
	 * possible and no default value biases the data (D7). Works without JavaScript.
	 */
	import { SCORE_MAX, SCORE_MIN } from '#lib/domain/vocab.ts';

	let {
		name,
		label,
		hint,
		value = null,
		error
	}: {
		name: string;
		label: string;
		hint?: string;
		value?: number | string | null;
		error?: string;
	} = $props();

	const uid = $props.id();
	const scores = Array.from({ length: SCORE_MAX - SCORE_MIN + 1 }, (_, i) => SCORE_MIN + i);
	const current = $derived(value == null || value === '' ? null : Number(value));
</script>

<fieldset class="score" aria-describedby={error ? `${uid}-err` : hint ? `${uid}-hint` : undefined}>
	<legend>
		{label}
		{#if hint}<span class="hint" id="{uid}-hint">{hint}</span>{/if}
	</legend>
	<div class="scale">
		{#each scores as n (n)}
			<label class="pill">
				<input type="radio" {name} value={n} checked={current === n} />
				<span>{n}</span>
			</label>
		{/each}
		<label class="pill clear" title="Not rated">
			<input type="radio" {name} value="" checked={current === null} />
			<span aria-label="Not rated">–</span>
		</label>
	</div>
	{#if error}<span class="error" id="{uid}-err">{error}</span>{/if}
</fieldset>

<style>
	.score {
		border: 0;
		border-radius: 0;
		padding: 0;
		background: none;
		box-shadow: none;
	}
	legend {
		padding: 0;
		margin-bottom: 0.35rem;
		font-size: 0.9rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.5rem;
		align-items: baseline;
	}
	.scale {
		display: grid;
		grid-template-columns: repeat(11, minmax(0, 1fr));
		gap: 0.25rem;
	}
	.scale :global(.pill span) {
		min-width: 0;
		width: 100%;
		padding: 0;
	}
	.clear span {
		color: var(--muted);
	}
</style>
