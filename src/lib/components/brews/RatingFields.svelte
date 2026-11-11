<script lang="ts">
	/**
	 * The rating section (§4.3): overall is the one quality score; the sub-scores are intensity, higher =
	 * more of it (D7). Shared by the brew form and the brew page's rate form.
	 *
	 * `from` is the previous rating (D52): its profile is pre-set in `values` and posted again as
	 * `<dimension>Default`, and its overall is offered beside the overall slider.
	 */
	import { onMount } from 'svelte';
	import FieldError from '#lib/components/FieldError.svelte';
	import RadarChart from '#lib/components/RadarChart.svelte';
	import ScoreInput from '#lib/components/ScoreInput.svelte';
	import Slider from '#lib/components/Slider.svelte';
	import TagPicker from '#lib/components/TagPicker.svelte';
	import {
		DIMENSION_HINTS,
		RATING_DIMENSIONS,
		SCORE_MAX,
		SCORE_MIN,
		label,
		type RatingDimension
	} from '#lib/domain/vocab.ts';
	import type { RatingFrom, RatingValues } from './brew-values.ts';

	let {
		values,
		from = null,
		errors = {}
	}: { values: RatingValues; from?: RatingFrom | null; errors?: Record<string, string> } = $props();

	const uid = $props.id();

	/** '' or '1'…'10' → a score; anything else (a bad re-sent value) counts as not rated. */
	function score(v: string): number | null {
		const n = Number(v.trim());
		return v.trim() !== '' && Number.isInteger(n) && n >= SCORE_MIN && n <= SCORE_MAX ? n : null;
	}

	// Seeded once; after that the sliders and radar own the scores (a failed submit re-sends them).
	// svelte-ignore state_referenced_locally
	let overall = $state(score(values.overall));
	let scores = $state(
		Object.fromEntries(RATING_DIMENSIONS.map((d) => [d, score(values[d])])) as Record<
			RatingDimension,
			number | null
		>
	);
	/** The axis the slider under the radar moves: the last one touched. */
	let active = $state<RatingDimension>(RATING_DIMENSIONS[0]);
	const lastOverall = $derived(from ? score(from.overall) : null);
	const anyScored = $derived(RATING_DIMENSIONS.some((d) => scores[d] != null));
	const dimensionErrors = $derived(
		RATING_DIMENSIONS.filter((d) => errors[d]).map((d) => ({ d, message: errors[d] }))
	);

	// Without JavaScript the radio rows post the scores; once it runs, the sliders and radar replace them.
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});

	function clearAll() {
		for (const d of RATING_DIMENSIONS) scores[d] = null;
	}
</script>

<div class="rating-fields">
	{#if from}
		{#each RATING_DIMENSIONS as d (d)}
			<input type="hidden" name="{d}Default" value={from[d]} />
		{/each}
	{/if}
	<div class="overall">
		{#if hydrated}
			<Slider
				name="overall"
				label="Overall"
				min={0}
				max={SCORE_MAX}
				blankAt={0}
				value={overall}
				error={errors.overall}
				onchange={(v) => (overall = v)}
			>
				{#snippet aside()}
					{#if lastOverall != null && overall == null}
						<button
							type="button"
							class="last"
							onclick={() => (overall = lastOverall)}
							aria-label="Use {lastOverall}, as last time">Last {lastOverall}</button
						>
					{/if}
				{/snippet}
			</Slider>
		{:else}
			<ScoreInput
				name="overall"
				label="Overall"
				hint={lastOverall != null ? `Last ${lastOverall}` : undefined}
				value={values.overall}
				error={errors.overall}
			/>
		{/if}
	</div>

	<div class="intensity" role="group" aria-labelledby="{uid}-int">
		<div class="intro">
			<span class="label" id="{uid}-int">Intensity, not quality</span>
			<span class="hint">Higher = more of it, not better.</span>
		</div>
		{#if hydrated}
			<RadarChart
				label="Taste profile"
				values={scores}
				editable
				selected={active}
				onchange={(d, v) => (scores[d] = v)}
				onselect={(d) => (active = d)}
			/>
			{#each RATING_DIMENSIONS as d (d)}
				<input type="hidden" name={d} value={scores[d] ?? ''} />
			{/each}
			<Slider
				label={label(active)}
				min={0}
				max={SCORE_MAX}
				blankAt={0}
				linked
				value={scores[active]}
				onchange={(v) => (scores[active] = v)}
			/>
			<div class="how">
				<span class="hint">Centre = not rated.</span>
				{#if anyScored}
					<button type="button" class="link-btn" onclick={clearAll}>Clear all</button>
				{/if}
			</div>
			{#if dimensionErrors.length}
				<div class="errors">
					{#each dimensionErrors as e (e.d)}
						<span class="error">{label(e.d)}: {e.message}</span>
					{/each}
				</div>
			{/if}
			<details class="legend">
				<summary>What do the axes mean?</summary>
				<dl>
					{#each RATING_DIMENSIONS as d (d)}
						<div>
							<dt>{label(d)}</dt>
							<dd>{DIMENSION_HINTS[d]}</dd>
						</div>
					{/each}
				</dl>
			</details>
		{:else}
			{#each RATING_DIMENSIONS as d (d)}
				<ScoreInput
					name={d}
					label={label(d)}
					hint={DIMENSION_HINTS[d]}
					value={values[d]}
					error={errors[d]}
				/>
			{/each}
		{/if}
	</div>

	<div>
		<TagPicker name="perceivedNotes" label="Tasting notes" selected={values.perceivedNotes} />
		<FieldError id="{uid}-notes-err" message={errors.perceivedNotes} />
	</div>

	<div class="field">
		<label for="{uid}-comment">Tasting comment</label>
		<textarea
			id="{uid}-comment"
			name="comment"
			rows="3"
			placeholder="e.g. juicy, a bit astringent at the end"
			value={values.comment}
			aria-invalid={errors.comment ? 'true' : undefined}
			aria-describedby={errors.comment ? `${uid}-comment-err` : undefined}></textarea>
		<FieldError id="{uid}-comment-err" message={errors.comment} />
	</div>
</div>

<style>
	.rating-fields {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.overall {
		padding: 0.75rem;
		border-radius: var(--radius-sm);
		background: var(--accent-soft);
	}
	.overall :global(legend),
	.overall :global(label:not(.pill)) {
		font-family: var(--display);
		font-size: 1rem;
	}
	/* The previous overall, grey like a placeholder (D26); tapping it applies it. */
	.last {
		position: relative;
		min-height: 32px;
		padding: 0.05rem 0.55rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--muted);
		font: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		cursor: pointer;
	}
	.last::after {
		content: '';
		position: absolute;
		inset: -6px -4px;
	}
	.intensity {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		padding-top: 0.75rem;
		border-top: 1px dashed var(--border);
	}
	.how {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 40px;
		margin-top: -0.6rem;
	}
	.errors {
		display: flex;
		flex-direction: column;
	}
	.how .link-btn {
		flex-shrink: 0;
		min-height: 40px;
		padding: 0 0.25rem;
		font-size: 0.875rem;
	}
	.legend {
		margin-top: -0.6rem;
	}
	.legend > summary {
		font-size: 0.875rem;
	}
	.legend dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.2rem 0.75rem;
		margin: 0 0 0.25rem;
		font-size: 0.85rem;
	}
	.legend dl > div {
		display: contents;
	}
	.legend dt {
		font-weight: 600;
	}
	.legend dd {
		margin: 0;
		color: var(--muted);
	}
	.intro {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
</style>
