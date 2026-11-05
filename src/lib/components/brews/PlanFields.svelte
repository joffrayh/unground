<script lang="ts">
	/**
	 * What to change next time (D25): one row per parameter with −/+ around a text box. The box's
	 * placeholder is the brew's own value and a blank box means "keep it as it was"; a box whose value
	 * differs is highlighted as a planned change. Plus free-text refinements.
	 *
	 * Renders only the fields (the parent gives the card and heading). Posts `nextWaterTempC`,
	 * `nextRatio` (the x of 1:x), `nextGrindSetting`, `nextPourCount`, `nextAgitation` and `nextNotes`.
	 * The boxes work without JavaScript; the −/+ buttons appear once it runs.
	 */
	import { onMount } from 'svelte';
	import FieldError from '#lib/components/FieldError.svelte';
	import type { PlanParam } from '#lib/domain/plan.ts';
	import { PLAN_FIELD, type PlanValues } from './brew-values.ts';
	import {
		canStepTo,
		PLAN_LABEL,
		formatPlanNumber,
		plannedChange,
		stepPlanField
	} from './plan-fields.ts';

	let {
		values,
		current,
		grindUnit = null,
		errors = {}
	}: {
		/** Starting values, read once; '' = keep as it was. */
		values: PlanValues;
		/** The brew's own values (live in the brew form), compared against and stepped from. */
		current: Record<PlanParam, number | null>;
		grindUnit?: string | null;
		errors?: Record<string, string>;
	} = $props();

	const uid = $props.id();

	// Seeded once; after that the inputs own the values (a failed submit re-sends what was typed).
	// svelte-ignore state_referenced_locally
	let fields = $state<PlanValues>({ ...values });

	// The −/+ buttons only work with JavaScript, so they appear once it runs.
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});

	interface Row {
		param: PlanParam;
		label: string;
		unit: string;
		/** For the button labels: "Lower temperature". */
		noun: string;
		inputmode: 'decimal' | 'numeric';
		prefix?: string;
	}

	const rows: Row[] = $derived([
		{
			param: 'waterTempC',
			label: PLAN_LABEL.waterTempC,
			unit: '°C',
			noun: 'temperature',
			inputmode: 'decimal'
		},
		{
			param: 'ratio',
			label: PLAN_LABEL.ratio,
			unit: '',
			noun: 'ratio',
			inputmode: 'decimal',
			prefix: '1:'
		},
		{
			param: 'grindSetting',
			label: PLAN_LABEL.grindSetting,
			unit: grindUnit ?? '',
			noun: 'grind setting',
			inputmode: 'decimal'
		},
		{
			param: 'pourCount',
			label: PLAN_LABEL.pourCount,
			unit: '',
			noun: 'number of pours',
			inputmode: 'numeric'
		},
		{
			param: 'agitation',
			label: PLAN_LABEL.agitation,
			unit: '0–5',
			noun: 'agitation',
			inputmode: 'numeric'
		}
	]);

	const fieldId = (param: PlanParam) => `${uid}-${PLAN_FIELD[param]}`;

	function step(param: PlanParam, direction: 1 | -1) {
		const field = PLAN_FIELD[param];
		fields[field] = stepPlanField(param, fields[field], direction, current);
	}
</script>

<div class="plan-fields">
	<ul class="rows" class:js={hydrated}>
		{#each rows as r (r.param)}
			{@const field = PLAN_FIELD[r.param]}
			{@const id = fieldId(r.param)}
			{@const change = plannedChange(r.param, fields[field], current)}
			{@const error = errors[field]}
			<li>
				<div class="row">
					<label class="name" for={id}>
						{r.label}
						{#if r.unit}<span class="unit">{r.unit}</span>{/if}
					</label>
					{#if hydrated}
						<button
							type="button"
							class="step"
							id="{id}-dec"
							aria-label="Lower {r.noun}"
							disabled={!canStepTo(r.param, fields[field], -1, current)}
							onclick={() => step(r.param, -1)}>−</button
						>
					{/if}
					<div class="box" class:prefixed={!!r.prefix}>
						{#if r.prefix}<span class="prefix" aria-hidden="true">{r.prefix}</span>{/if}
						<input
							type="text"
							{id}
							name={field}
							inputmode={r.inputmode}
							enterkeyhint="next"
							autocomplete="off"
							class:changed={change != null}
							placeholder={formatPlanNumber(current[r.param])}
							bind:value={fields[field]}
							aria-invalid={error ? 'true' : undefined}
							aria-describedby={[change != null ? `${id}-planned` : '', error ? `${id}-err` : '']
								.filter(Boolean)
								.join(' ') || undefined}
						/>
						<!-- The box is highlighted; this says the same to a screen reader. -->
						{#if change != null}<span class="visually-hidden" id="{id}-planned">Planned change</span
							>{/if}
					</div>
					{#if hydrated}
						<button
							type="button"
							class="step"
							aria-label="Raise {r.noun}"
							disabled={!canStepTo(r.param, fields[field], 1, current)}
							onclick={() => step(r.param, 1)}>+</button
						>
					{/if}
				</div>
				{#if error}
					<div class="err"><FieldError id="{id}-err" message={error} /></div>
				{/if}
			</li>
		{/each}
	</ul>

	<div class="field">
		<label for="{uid}-nextNotes">Other refinements</label>
		<textarea
			id="{uid}-nextNotes"
			name="nextNotes"
			rows="2"
			maxlength="1000"
			placeholder="e.g. swirl after the last pour"
			bind:value={fields.nextNotes}
			aria-invalid={errors.nextNotes ? 'true' : undefined}
			aria-describedby={errors.nextNotes ? `${uid}-nextNotes-err` : undefined}></textarea>
		<FieldError id="{uid}-nextNotes-err" message={errors.nextNotes} />
	</div>
</div>

<style>
	.plan-fields {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		--name-w: 6rem;
		--gap: 0.4rem;
	}
	.row {
		display: grid;
		grid-template-columns: var(--name-w) minmax(0, 1fr);
		align-items: center;
		gap: var(--gap);
	}
	.js .row {
		grid-template-columns: var(--name-w) 44px minmax(0, 1fr) 44px;
	}
	.name {
		font-size: 0.9rem;
		font-weight: 600;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
	.unit {
		display: block;
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--muted);
	}
	.step {
		width: 44px;
		height: 44px;
		padding: 0;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--text);
		font: inherit;
		font-size: 1.3rem;
		font-weight: 600;
		line-height: 1;
		cursor: pointer;
		touch-action: manipulation;
	}
	.step:hover:not(:disabled) {
		border-color: var(--accent);
	}
	.step:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.box {
		position: relative;
		min-width: 0;
	}
	.box input {
		text-align: center;
		font-variant-numeric: tabular-nums;
		padding-inline: 0.4rem;
	}
	.box.prefixed input {
		padding-left: 1.6rem;
	}
	.prefix {
		position: absolute;
		left: 0.6rem;
		top: 50%;
		transform: translateY(-50%);
		color: var(--muted);
		font-variant-numeric: tabular-nums;
		pointer-events: none;
	}
	.box input.changed {
		border-color: var(--plan);
		background: var(--plan-soft);
		box-shadow: inset 0 0 0 1px var(--plan);
	}
	.err {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-top: 0.15rem;
		padding-left: calc(var(--name-w) + var(--gap));
	}
</style>
