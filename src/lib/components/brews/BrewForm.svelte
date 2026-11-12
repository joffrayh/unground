<script lang="ts">
	/**
	 * The brew form, shared by "log a brew" and "edit brew". Posts the fields parseBrewForm reads; works
	 * without JavaScript. Sections follow the order of a brew: set-up, recipe, pours, timing, then the
	 * after-the-fact bits (notes, optional rating, what to change next time).
	 *
	 * On a new brew the previous brew's values are grey placeholders, and a field left blank saves its
	 * placeholder (D26; posted as `<field>Default`). The next-time plan of the picked bean's last brew
	 * shows as green "› 17" buttons inside the boxes; tapping one fills the field in (D25, D58). A
	 * planned agitation level is highlighted.
	 */
	import { onMount, tick } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { BREW_MULTI } from '#lib/domain/brew-fields.ts';
	import { utcToZonedLocal } from '#lib/domain/derive.ts';
	import { BREW_FORM_ID, getNavAction } from '#lib/ui/nav-action.svelte.ts';
	import FieldError from '#lib/components/FieldError.svelte';
	import FormError from '#lib/components/FormError.svelte';
	import Slider from '#lib/components/Slider.svelte';
	import type { PlanParam } from '#lib/domain/plan.ts';
	import { formatDuration, parseDuration } from '#lib/domain/pours.ts';
	import { AGITATION_MAX, AGITATION_MIN, FILTER_TYPES } from '#lib/domain/vocab.ts';
	import { options } from '#lib/ui/format.ts';
	import { checked, formValues, val, vals, type FormState } from '#lib/ui/forms.ts';
	import PlanFields from './PlanFields.svelte';
	import PourEditor from './PourEditor.svelte';
	import RatingFields from './RatingFields.svelte';
	import type { DraftFields } from './brew-draft.ts';
	import {
		PLAN_FORM_FIELDS,
		hasPlanValues,
		planFormValues,
		ratingFormValues,
		type BeanOption,
		type BrewFormValues,
		type DripperOption,
		type GrinderOption
	} from './brew-values.ts';
	import { focusNextField, isTextLike } from './enter-nav.ts';
	import {
		measuredTotalS,
		parseGrams,
		rowsFromValues,
		summarizePours,
		type PourStats,
		type PourTarget
	} from './pour-rows.ts';
	import ScaleCard from './ScaleCard.svelte';
	import type { GuideState } from '#lib/scale/brew-guide.ts';
	import { getScaleLink, type ScaleOption } from '#lib/scale/scale-link.svelte.ts';

	let {
		form,
		values,
		beans,
		grinders,
		drippers,
		scales,
		submitLabel = 'Save brew',
		navSubmit = false,
		catalogueLinks = false,
		timezone,
		liveBrewedAtIn,
		draft
	}: {
		form: FormState;
		/** Starting values; a failed submit's values take precedence. */
		values: BrewFormValues;
		beans: BeanOption[];
		grinders: GrinderOption[];
		drippers: DripperOption[];
		/** New brews: the user's scales, for the card that shows the paired one. */
		scales?: ScaleOption[];
		submitLabel?: string;
		/** The nav's centre button saves this form, so it has no button of its own (D38). */
		navSubmit?: boolean;
		/** Offer "new bean" / "add grinder" / "add dripper" links (the new-brew page). */
		catalogueLinks?: boolean;
		/** Shown when the brew's zone differs from the user's, so the brewed-at time is unambiguous. */
		timezone?: string;
		/**
		 * New brews: keep "brewed at" at the current time (in this zone) until the user edits it, so a tab
		 * left open or restored later doesn't save a stale time.
		 */
		liveBrewedAtIn?: string;
		/** New brews: keeps the progress when leaving the form (D43), and adds Cancel brew. */
		draft?: { save: (fields: DraftFields) => void; clear: () => void };
	} = $props();

	const uid = $props.id();
	const errors = $derived<Record<string, string>>(form?.errors ?? {});

	// Inputs that drive live UI are seeded once and then owned by the form.
	// svelte-ignore state_referenced_locally
	const start = {
		beanId: val(form, 'beanId', values.beanId),
		grinderId: val(form, 'grinderId', values.grinderId),
		dripperId: val(form, 'dripperId', values.dripperId),
		scaleId: val(form, 'scaleId', values.scaleId),
		filterType: val(form, 'filterType', values.filterType),
		slowFed: checked(form, 'slowFed', values.slowFed),
		grindSetting: val(form, 'grindSetting', values.grindSetting),
		doseG: val(form, 'doseG', values.doseG),
		waterTempC: val(form, 'waterTempC', values.waterTempC),
		agitation: val(form, 'agitation', values.agitation),
		totalTime: val(form, 'totalTime', values.totalTime),
		brewedAt: val(form, 'brewedAt', values.brewedAt),
		pours: form?.values
			? rowsFromValues({
					times: vals(form, 'pourTime'),
					scales: vals(form, 'pourScale'),
					timeDefaults: vals(form, 'pourTimeDefault'),
					scaleDefaults: vals(form, 'pourScaleDefault'),
					rowIds: vals(form, 'pourRow'),
					bloom: vals(form, 'pourBloom'),
					drop: vals(form, 'pourDrop'),
					plannedGs: vals(form, 'pourPlannedG'),
					plannedStarts: vals(form, 'pourPlannedStart'),
					durations: vals(form, 'pourDuration')
				})
			: values.pours
	};
	// The placeholders the page was rendered with (D26); a failed submit re-sends them.
	// svelte-ignore state_referenced_locally
	const defaults = values.defaults
		? {
				grindSetting: val(form, 'grindSettingDefault', values.defaults.grindSetting),
				grindSettingFor: val(form, 'grindSettingDefaultFor', values.defaults.grindSettingFor),
				doseG: val(form, 'doseGDefault', values.defaults.doseG),
				waterTempC: val(form, 'waterTempCDefault', values.defaults.waterTempC)
			}
		: null;

	let beanId = $state(start.beanId);
	/** The picked bean's last plan (D58). */
	const suggestions = $derived(values.suggestionsByBean[beanId] ?? null);
	let grinderId = $state(start.grinderId);
	let dripperId = $state(start.dripperId);
	let scaleId = $state(start.scaleId);
	let filterType = $state(start.filterType);
	let grindSetting = $state(start.grindSetting);
	let doseG = $state(start.doseG);
	let waterTempC = $state(start.waterTempC);
	let agitation = $state(start.agitation);
	let totalTime = $state(start.totalTime);
	let brewedAt = $state(start.brewedAt);
	// Seeded here too, so the next-time card has its ratio and pour count before (or without) JavaScript.
	// svelte-ignore state_referenced_locally
	const startSummary = summarizePours(start.pours, start.doseG.trim() || values.defaults?.doseG);
	let pourStats = $state<PourStats>({
		count: startSummary.count,
		totalG: startSummary.totalG,
		ratio: startSummary.ratio
	});
	// A re-shown failed submit keeps exactly what was sent; a draft only has it once it was edited.
	// svelte-ignore state_referenced_locally
	let brewedAtEdited = form?.values?.brewedAt !== undefined;
	let targets = $state<PourTarget[]>([]);
	let submitting = $state(false);
	// Suggestion chips only do something with JavaScript; before that they are plain text.
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
		// After the children's first updates (spare rows, radar inputs), which aren't edits.
		tick().then(() => {
			if (formEl) lastKept = JSON.stringify(draftFields(formEl));
		});
	});

	// --- the draft (D43) ---------------------------------------------------------------------------
	// Read from the form on the way out, which also catches the buttons that set values without an
	// input event (− / +, Accept, the radar, tags).

	let formEl = $state<HTMLFormElement>();
	let pourEditor = $state<ReturnType<typeof PourEditor>>();
	let lastKept: string | undefined;
	let kept = false;
	/** Saved or cancelled, so leaving now mustn't bring the draft back. */
	let finished = false;

	function draftFields(el: HTMLFormElement): DraftFields {
		const fields = formValues(new FormData(el), BREW_MULTI);
		if (!brewedAtEdited) delete fields.brewedAt;
		if (pourEditor) fields.pourTimeDefault = pourEditor.timeDefaults();
		return fields;
	}

	function keepDraft() {
		if (!draft || finished || !formEl || lastKept === undefined) return;
		const fields = draftFields(formEl);
		const snapshot = JSON.stringify(fields);
		if (snapshot === lastKept) return;
		draft.save(fields);
		lastKept = snapshot;
		kept = true;
	}
	beforeNavigate(keepDraft);

	function endDraft() {
		finished = true;
		draft?.clear();
	}

	function cancelBrew(e: MouseEvent) {
		const changed =
			!!form?.values || kept || (!!formEl && JSON.stringify(draftFields(formEl)) !== lastKept);
		if (changed && !confirm('Discard this brew?')) {
			e.preventDefault();
			return;
		}
		endDraft();
	}

	const navAction = getNavAction();
	$effect(() => {
		if (!navSubmit) return;
		navAction.submitting = submitting;
		return () => {
			navAction.submitting = false;
		};
	});

	// Return here (same template and choices) after adding a bean, grinder or dripper.
	const returnTo = $derived(encodeURIComponent(page.url.pathname + page.url.search));

	$effect(() => {
		const zone = liveBrewedAtIn;
		if (!zone) return;
		const refresh = () => {
			if (!brewedAtEdited && document.visibilityState === 'visible') {
				brewedAt = utcToZonedLocal(new Date(), zone);
			}
		};
		refresh();
		const timer = setInterval(refresh, 30_000);
		document.addEventListener('visibilitychange', refresh);
		window.addEventListener('pageshow', refresh);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', refresh);
			window.removeEventListener('pageshow', refresh);
		};
	});

	/** Enter/Go moves to the next field; only the button saves the brew. */
	function onFormKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.defaultPrevented || !isTextLike(e.target)) return;
		e.preventDefault();
		focusNextField(e.target);
	}

	const unit = $derived(grinders.find((g) => g.id === grinderId)?.unit ?? null);

	// --- placeholders (D26) and the previous plan's suggestions (D25) ----------------------------

	/** A grind setting only means something on its own grinder (D2). */
	const onTemplateGrinder = $derived(!!defaults && grinderId === defaults.grindSettingFor);
	const grindPlaceholder = $derived(onTemplateGrinder ? defaults!.grindSetting : '');
	const dosePlaceholder = defaults?.doseG ?? '';
	const tempPlaceholder = defaults?.waterTempC ?? '';
	/** What will be saved: typed, else the placeholder. */
	const effective = (typed: string, placeholder: string) => typed.trim() || placeholder;

	const grindSuggestion = $derived(
		suggestions?.grindSetting &&
			grinderId === suggestions.grindSetting.grindFor &&
			grindSetting.trim() !== suggestions.grindSetting.to
			? suggestions.grindSetting
			: null
	);
	const tempSuggestion = $derived(
		suggestions?.waterTempC && waterTempC.trim() !== suggestions.waterTempC.to
			? suggestions.waterTempC
			: null
	);
	const agitationSuggestion = $derived(
		suggestions?.agitation && agitation !== suggestions.agitation.to ? suggestions.agitation : null
	);

	const agitationLevel = $derived(agitation === '' ? null : Number(agitation));
	const agitationLevels = Array.from({ length: AGITATION_MAX - AGITATION_MIN + 1 }, (_, i) =>
		String(AGITATION_MIN + i)
	);

	/** This brew's own values, which the next-time card starts from (live). */
	const planCurrent = $derived<Record<PlanParam, number | null>>({
		waterTempC: parseGrams(effective(waterTempC, tempPlaceholder)),
		ratio: pourStats.ratio,
		grindSetting: parseGrams(effective(grindSetting, grindPlaceholder)),
		pourCount: pourStats.count > 0 ? pourStats.count : null,
		agitation: agitationLevel
	});

	const rating = $derived(ratingFormValues(form, values.rating));
	// svelte-ignore state_referenced_locally
	const plan = planFormValues(form, values.plan);
	const planOpen = $derived(hasPlanValues(plan) || PLAN_FORM_FIELDS.some((k) => errors[k]));

	/** aria attributes tying an input to its hint and error. */
	function describe(key: string, hint = false) {
		const ids = [hint ? `${uid}-${key}-hint` : '', errors[key] ? `${uid}-${key}-err` : '']
			.filter(Boolean)
			.join(' ');
		return {
			'aria-invalid': errors[key] ? ('true' as const) : undefined,
			'aria-describedby': ids || undefined
		};
	}

	/** A guided brew has finished: its measurements replace what was planned (D51). */
	function recordMeasured(brew: GuideState, id: string) {
		pourEditor?.applyMeasured(brew.pours);
		totalTime = formatDuration(measuredTotalS(brew.pours, brew.elapsedMs));
		scaleId = id;
	}

	let scaleOpen = $state(false);
	let tapping = $state(false);
	const scaleLink = getScaleLink();
	/** The paired scale is connected, so its card guides the brew instead of tap to pour. */
	const scaleReady = $derived(
		scaleLink.status === 'connected' && !!scales?.some((s) => s.id === scaleLink.pairing?.scaleId)
	);
	/** Total time before tap to pour's Stop filled it in, and what it wrote, for its Undo. */
	let totalTap: { before: string; written: string } | null = null;

	function tapTotal(s: number | null) {
		if (s === null) {
			// A total retyped since Stop is the brewer's: leave it.
			if (totalTap && totalTime === totalTap.written) totalTime = totalTap.before;
			totalTap = null;
			return;
		}
		totalTap = { before: totalTime, written: formatDuration(s) };
		totalTime = totalTap.written;
	}

	function normalizeTotalTime() {
		const s = parseDuration(totalTime);
		if (s !== null) totalTime = formatDuration(s);
	}

	const submit: SubmitFunction = ({ formData }) => {
		if (liveBrewedAtIn && !brewedAtEdited) {
			formData.set('brewedAt', utcToZonedLocal(new Date(), liveBrewedAtIn));
		}
		submitting = true;
		return async ({ result, update, formElement }) => {
			if (result.type === 'redirect') endDraft();
			await update();
			submitting = false;
			if (result.type !== 'failure') return;
			await tick();
			const target =
				formElement.querySelector<HTMLElement>('[aria-invalid="true"], .error') ??
				formElement.querySelector<HTMLElement>('.form-error');
			target?.scrollIntoView({ block: 'center' });
			if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
				target.focus({ preventScroll: true });
			}
		};
	};
</script>

{#snippet suggest(change: { to: string }, apply: () => void, what: string)}
	{#if hydrated}
		<button
			type="button"
			class="suggest"
			onclick={apply}
			aria-label="Use {change.to}{what ? ` ${what}` : ''}, as planned last time"
			>› {change.to}</button
		>
	{:else}
		<span class="suggest" title="Planned last time">› {change.to}</span>
	{/if}
{/snippet}

<!-- Tab-switching and closing leave no navigation to hook; a phone may discard a hidden tab. -->
<svelte:window onpagehide={keepDraft} />
<svelte:document
	onvisibilitychange={() => {
		if (document.visibilityState === 'hidden') keepDraft();
	}}
/>

<!-- The keydown listener only catches Enter bubbling up from the form's own inputs (see onFormKeydown). -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
	method="POST"
	id={navSubmit ? BREW_FORM_ID : undefined}
	class="brew-form"
	novalidate
	use:enhance={submit}
	onkeydown={onFormKeydown}
	bind:this={formEl}
>
	<FormError {form} />
	<input type="hidden" name="method" value="v60" />
	<input type="hidden" name="scaleId" value={scaleId} />
	{#if defaults}
		<input type="hidden" name="grindSettingDefault" value={defaults.grindSetting} />
		<input type="hidden" name="grindSettingDefaultFor" value={defaults.grindSettingFor} />
		<input type="hidden" name="doseGDefault" value={defaults.doseG} />
		<input type="hidden" name="waterTempCDefault" value={defaults.waterTempC} />
	{/if}

	{#if suggestions?.notes}
		<p class="plan-note" role="note">
			<span class="plan-label">Planned last time</span>
			<span class="prewrap">{suggestions.notes}</span>
		</p>
	{/if}

	<fieldset class="section">
		<legend>Set-up</legend>
		<div class="setup">
			<div class="field">
				<label for="{uid}-grinderId">Grinder</label>
				<select
					id="{uid}-grinderId"
					name="grinderId"
					bind:value={grinderId}
					{...describe('grinderId')}
				>
					{#if !grinders.some((g) => g.id === grinderId)}
						<option value="" disabled>Pick a grinder</option>
					{/if}
					{#each grinders as g (g.id)}
						<option value={g.id}>{g.label}{g.archived ? ' (archived)' : ''}</option>
					{/each}
				</select>
				<FieldError id="{uid}-grinderId-err" message={errors.grinderId} />
				{#if catalogueLinks}
					<a class="small" href="/equipment?return={returnTo}">+ Add a grinder</a>
				{/if}
			</div>
			<div class="field">
				<span class="label" aria-hidden="true">Feed</span>
				<label class="check boxed">
					<input type="checkbox" name="slowFed" checked={start.slowFed} />
					Slow fed
				</label>
			</div>
			<div class="field">
				<label for="{uid}-dripperId">Dripper</label>
				<select
					id="{uid}-dripperId"
					name="dripperId"
					bind:value={dripperId}
					{...describe('dripperId')}
				>
					<option value="">Not recorded</option>
					{#each drippers as d (d.id)}
						<option value={d.id}>{d.label}{d.archived ? ' (archived)' : ''}</option>
					{/each}
				</select>
				<FieldError id="{uid}-dripperId-err" message={errors.dripperId} />
				{#if catalogueLinks}
					<a class="small" href="/equipment?return={returnTo}#drippers-heading">+ Add a dripper</a>
				{/if}
			</div>
			<div class="field">
				<label for="{uid}-filterType">Filter</label>
				<select
					id="{uid}-filterType"
					name="filterType"
					bind:value={filterType}
					{...describe('filterType')}
				>
					<option value="">Not recorded</option>
					{#each options(FILTER_TYPES) as o (o.value)}
						<option value={o.value}>{o.label}</option>
					{/each}
				</select>
				<FieldError id="{uid}-filterType-err" message={errors.filterType} />
			</div>
		</div>
	</fieldset>

	<fieldset class="section">
		<legend>Recipe</legend>
		<div class="stack-sm">
			<div class="field">
				<label for="{uid}-beanId">Bean</label>
				<select id="{uid}-beanId" name="beanId" bind:value={beanId} {...describe('beanId')}>
					{#if !beans.some((b) => b.id === beanId)}
						<option value="" disabled>Pick a bean</option>
					{/if}
					{#each beans as b (b.id)}
						<option value={b.id}>{b.label}{b.archived ? ' (archived)' : ''}</option>
					{/each}
				</select>
				<FieldError id="{uid}-beanId-err" message={errors.beanId} />
				{#if catalogueLinks}
					<a class="small" href="/beans/new?return={returnTo}">+ New bag of beans</a>
				{/if}
			</div>

			<div class="trio">
				<div class="field">
					<label for="{uid}-grindSetting">Grind{unit ? ` (${unit})` : ''}</label>
					<div class="affix">
						<input
							id="{uid}-grindSetting"
							name="grindSetting"
							type="text"
							inputmode="decimal"
							autocomplete="off"
							class="num"
							enterkeyhint="next"
							placeholder={grindPlaceholder}
							bind:value={grindSetting}
							{...describe('grindSetting')}
						/>
						{#if grindSuggestion}
							{@render suggest(
								grindSuggestion,
								() => (grindSetting = grindSuggestion.to),
								unit ?? ''
							)}
						{/if}
					</div>
					<FieldError id="{uid}-grindSetting-err" message={errors.grindSetting} />
				</div>
				<div class="field">
					<label for="{uid}-doseG">Dose (g)</label>
					<input
						id="{uid}-doseG"
						name="doseG"
						type="text"
						inputmode="decimal"
						autocomplete="off"
						class="num"
						enterkeyhint="next"
						placeholder={dosePlaceholder}
						bind:value={doseG}
						{...describe('doseG')}
					/>
					<FieldError id="{uid}-doseG-err" message={errors.doseG} />
				</div>
				<div class="field">
					<label for="{uid}-waterTempC">Water (°C)</label>
					<div class="affix">
						<input
							id="{uid}-waterTempC"
							name="waterTempC"
							type="text"
							inputmode="decimal"
							autocomplete="off"
							class="num"
							enterkeyhint="next"
							placeholder={tempPlaceholder}
							bind:value={waterTempC}
							{...describe('waterTempC')}
						/>
						{#if tempSuggestion}
							{@render suggest(tempSuggestion, () => (waterTempC = tempSuggestion.to), '°C')}
						{/if}
					</div>
					<FieldError id="{uid}-waterTempC-err" message={errors.waterTempC} />
				</div>
			</div>

			{#if hydrated}
				<Slider
					name="agitation"
					label="Agitation"
					min={AGITATION_MIN}
					max={AGITATION_MAX}
					value={agitationLevel}
					marked={agitationSuggestion ? Number(agitationSuggestion.to) : undefined}
					hint="0 none · 5 a lot"
					error={errors.agitation}
					onchange={(v) => (agitation = v == null ? '' : String(v))}
				>
					{#snippet aside()}
						{#if agitationSuggestion}
							{@render suggest(agitationSuggestion, () => (agitation = agitationSuggestion.to), '')}
						{/if}
					{/snippet}
				</Slider>
			{:else}
				<div
					class="agitation"
					role="radiogroup"
					aria-labelledby="{uid}-agitation-label"
					aria-describedby="{uid}-agitation-hint{errors.agitation ? ` ${uid}-agitation-err` : ''}"
				>
					<span class="label" id="{uid}-agitation-label">Agitation</span>
					<div class="levels">
						{#each agitationLevels as level (level)}
							{@const planned = agitationSuggestion?.to === level}
							<label class="pill" class:planned>
								<input
									type="radio"
									name="agitation"
									value={level}
									bind:group={agitation}
									aria-label={planned ? `${level}, as planned last time` : undefined}
								/>
								<span>{level}</span>
							</label>
						{/each}
					</div>
					<span class="hint" id="{uid}-agitation-hint">0 none · 5 a lot</span>
					<FieldError id="{uid}-agitation-err" message={errors.agitation} />
				</div>
			{/if}
		</div>
	</fieldset>

	<PourEditor
		bind:this={pourEditor}
		initial={start.pours}
		dose={effective(doseG, dosePlaceholder)}
		error={errors.pours}
		suggestion={suggestions}
		bind:stats={pourStats}
		bind:targets
		tappable={!!scales}
		locked={scaleOpen}
		{scaleReady}
		bind:tapping
		ontotal={tapTotal}
	/>

	{#if scales && (scaleOpen || !tapping)}
		<ScaleCard {scales} {targets} bind:open={scaleOpen} onfinish={recordMeasured} />
	{/if}

	<fieldset class="section">
		<legend>Timing</legend>
		<div class="timing">
			<div class="field">
				<label for="{uid}-totalTime">Total time</label>
				<input
					id="{uid}-totalTime"
					name="totalTime"
					type="text"
					inputmode="numeric"
					autocomplete="off"
					placeholder="m:ss"
					class="num"
					enterkeyhint="next"
					bind:value={totalTime}
					onblur={normalizeTotalTime}
					{...describe('totalTime', true)}
				/>
				<span class="hint" id="{uid}-totalTime-hint">End of drawdown</span>
				<FieldError id="{uid}-totalTime-err" message={errors.totalTime} />
			</div>
			<div class="field">
				<label for="{uid}-brewedAt">Brewed at</label>
				<input
					id="{uid}-brewedAt"
					name="brewedAt"
					type="datetime-local"
					bind:value={brewedAt}
					oninput={() => (brewedAtEdited = true)}
					{...describe('brewedAt', !!timezone)}
				/>
				{#if timezone}
					<span class="hint" id="{uid}-brewedAt-hint">Local time in {timezone}</span>
				{/if}
				<FieldError id="{uid}-brewedAt-err" message={errors.brewedAt} />
			</div>
		</div>
	</fieldset>

	<div class="field">
		<label for="{uid}-notes">Brewing notes</label>
		<textarea
			id="{uid}-notes"
			name="notes"
			rows="2"
			placeholder="e.g. stalled drawdown, swirled after bloom"
			value={val(form, 'notes', values.notes)}
			{...describe('notes')}></textarea>
		<FieldError id="{uid}-notes-err" message={errors.notes} />
	</div>

	<details class="section" open>
		<summary>Rating</summary>
		<div class="details-body">
			<RatingFields values={rating} from={values.lastRatings[beanId] ?? null} {errors} />
		</div>
	</details>

	<details class="section" open={planOpen}>
		<summary>
			<span>Adjustments <span class="muted small">(optional)</span></span>
		</summary>
		<div class="details-body">
			<PlanFields values={plan} current={planCurrent} grindUnit={unit} {errors} />
		</div>
	</details>

	{#if !navSubmit}
		<div class="submit-bar">
			<button class="btn btn-primary btn-block" disabled={submitting}>
				{submitting ? 'Saving…' : submitLabel}
			</button>
		</div>
	{/if}

	{#if draft}
		<a class="btn btn-danger btn-block" href="/" onclick={cancelBrew}>Cancel brew</a>
	{/if}
</form>

<style>
	.brew-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.section {
		padding: 0.75rem;
	}
	details.section {
		background: var(--glass);
		border-radius: var(--radius);
		box-shadow: var(--edge), var(--shadow);
		padding: 0 0.75rem;
	}
	details.section[open] {
		padding-bottom: 0.75rem;
	}
	.details-body {
		padding-top: 0.25rem;
	}
	.stack-sm {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	/* Grinder, feed, dripper and filter: stacked on a phone, 2 × 2 when there's room. */
	.setup {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(max(10rem, calc((100% - 0.75rem) / 2)), 1fr));
		gap: 0.75rem;
	}
	/* A checkbox drawn as a field, so it lines up with the selects beside it. */
	.boxed {
		padding-inline: 0.7rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--field);
		cursor: pointer;
	}
	/* Grind and water can hold a "› 24.6" button beside the value; dose never does. */
	.trio {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.8fr) minmax(0, 1.05fr);
		gap: 0.6rem;
		align-items: end;
	}
	.agitation {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.levels {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 0.3rem;
	}
	.levels :global(.pill span) {
		min-width: 0;
		width: 100%;
		padding: 0;
	}
	/* The level the previous brew planned (D25). */
	.levels .planned input:not(:checked) + span {
		border-color: var(--plan);
		background: var(--plan-soft);
		color: var(--plan);
		font-weight: 700;
		box-shadow: inset 0 0 0 1px var(--plan);
	}
	.timing {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
		gap: 0.6rem;
		align-items: start;
	}
	.plan-note {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		margin: 0;
		padding: 0.6rem 0.75rem;
		border-radius: var(--radius-sm);
		background: var(--plan-soft);
		color: var(--plan);
		font-size: 0.9rem;
	}
	.plan-label {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.prewrap {
		white-space: pre-wrap;
	}
	.submit-bar {
		position: sticky;
		bottom: calc(var(--nav-clear) + 0.5rem);
		z-index: 5;
		padding: 0.5rem;
		margin: 0 -0.5rem;
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--bg) 85%, transparent);
		backdrop-filter: blur(6px);
	}
</style>
