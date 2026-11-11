<script lang="ts">
	/**
	 * A score on `scale` as a select with "not rated" first: the entry without JavaScript. With it, a
	 * Slider takes over (D45). Either way a score starts unset, so no default biases the data (D7); last
	 * time's score, `ghost`, is marked in the list (D53).
	 */
	import { scaleScores, type ScoreScale } from '#lib/domain/vocab.ts';

	let {
		name,
		label,
		hint,
		scale,
		value = null,
		ghost = null,
		error
	}: {
		name: string;
		label: string;
		hint?: string;
		scale: ScoreScale;
		value?: number | string | null;
		ghost?: number | null;
		error?: string;
	} = $props();

	const uid = $props.id();
	const current = $derived(value == null || value === '' ? null : Number(value));
	const describedBy = $derived(
		[hint ? `${uid}-hint` : '', error ? `${uid}-err` : ''].filter(Boolean).join(' ') || undefined
	);
</script>

<div class="field">
	<label for="{uid}-select">{label}</label>
	{#if hint}<span class="hint" id="{uid}-hint">{hint}</span>{/if}
	<select
		id="{uid}-select"
		{name}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
	>
		<option value="" selected={current === null}>Not rated</option>
		{#each scaleScores(scale) as n (n)}
			<option value={n} selected={current === n}>{n}{ghost === n ? ' · last' : ''}</option>
		{/each}
	</select>
	{#if error}<span class="error" id="{uid}-err">{error}</span>{/if}
</div>
