<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { afterNavigate } from '$app/navigation';
	import FlavorChips from '#lib/components/FlavorChips.svelte';
	import FormError from '#lib/components/FormError.svelte';
	import RadarChart from '#lib/components/RadarChart.svelte';
	import PlanFields from '#lib/components/brews/PlanFields.svelte';
	import RatingFields from '#lib/components/brews/RatingFields.svelte';
	import {
		agreeingNotes,
		flavorName,
		planFormValues,
		planValues,
		ratingFormValues,
		ratingFrom,
		ratingValues
	} from '#lib/components/brews/brew-values.ts';
	import { focusNextField, isTextLike } from '#lib/components/brews/enter-nav.ts';
	import { PLAN_LABEL, changeText, plannedChange } from '#lib/components/brews/plan-fields.ts';
	import { brewRatio, roastAgeDays } from '#lib/domain/derive.ts';
	import { PLAN_PARAMS, planBaseline } from '#lib/domain/plan.ts';
	import { pourName, poursToEntries } from '#lib/domain/pours.ts';
	import { RATING_DIMENSIONS } from '#lib/domain/vocab.ts';
	import type { FormState } from '#lib/ui/forms.ts';
	import { formatDateTime, formatDuration, grams, label, ratioText } from '#lib/ui/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** Back to the list, keeping its filter and page when that's where the brew was opened from. */
	let backHref = $state('/brews');
	afterNavigate(({ from }) => {
		if (from?.url.pathname === '/brews') backHref = from.url.pathname + from.url.search;
	});

	/** The action result only if it belongs to `target`, so each form shows just its own errors. */
	function scoped(target: 'rate' | 'plan'): FormState {
		return form?.target === target ? form : null;
	}
	const rateForm = $derived(scoped('rate'));
	const planForm = $derived(scoped('plan'));

	const brew = $derived(data.brew);
	const rating = $derived(brew.rating);
	const ratio = $derived(brew.waterG > 0 ? brewRatio(brew.doseG, brew.waterG) : null);
	const roastAge = $derived(roastAgeDays(brew.roastDate, brew.brewedAt, brew.timezone));
	const pours = $derived.by(() => {
		const entries = poursToEntries(brew.details.pours);
		return brew.details.pours.map((p, i) => ({ ...p, ...entries[i] }));
	});
	const agreeing = $derived(rating ? agreeingNotes(rating.perceivedNotes, data.claimed.notes) : []);
	/** An unrated brew's rate form shows the previous rating in grey (D53). */
	const lastRating = $derived(rating ? null : ratingFrom(data.previousRating));
	const formRating = $derived(ratingFormValues(rateForm, ratingValues(rating)));
	const anyDimension = $derived(rating ? RATING_DIMENSIONS.some((d) => rating[d] != null) : false);

	// --- next time (D25) ----------------------------------------------------------------------
	const plan = $derived(brew.plan);
	const baseline = $derived(
		planBaseline({
			waterTempC: brew.waterTempC,
			grindSetting: brew.grindSetting,
			doseG: brew.doseG,
			waterG: brew.waterG,
			agitation: brew.agitation,
			pourCount: brew.details.pours.length
		})
	);
	/** The plan's changes as "24 → 26 clicks", skipping any the brew has since caught up with. */
	const planChanges = $derived(
		plan
			? PLAN_PARAMS.flatMap((p) => {
					const to = plannedChange(p, plan[p] == null ? '' : String(plan[p]), baseline);
					return to == null
						? []
						: [{ param: p, text: changeText(p, baseline[p], to, brew.grinderSettingUnit) }];
				})
			: []
	);
	const formPlan = $derived(planFormValues(planForm, planValues(plan)));

	// --- share (D54) ----------------------------------------------------------------------------
	const cardHref = $derived(`/brews/${brew.id}/card.png`);
	/**
	 * The card, fetched ahead: iOS only opens the share sheet straight from a tap, not after a fetch.
	 * Null where files can't be shared; the link then just opens the image.
	 */
	let cardFile = $state<File | null>(null);
	$effect(() => {
		// Reruns whenever the page reloads the brew; the ETag makes an unchanged card a 304.
		if (!brew.rating || !navigator.canShare) return;
		const href = cardHref;
		let stale = false;
		(async () => {
			const res = await fetch(href);
			if (!res.ok) return;
			const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1];
			const file = new File([await res.blob()], name ?? 'unground.png', { type: 'image/png' });
			if (!stale && navigator.canShare({ files: [file] })) cardFile = file;
		})().catch(() => {});
		return () => {
			stale = true;
			cardFile = null;
		};
	});

	async function shareCard(e: MouseEvent) {
		if (!cardFile) return;
		e.preventDefault();
		try {
			await navigator.share({ files: [cardFile] });
		} catch (err) {
			if ((err as Error).name !== 'AbortError') location.href = cardHref;
		}
	}

	/** Enter moves to the next box instead of saving the plan half-way. */
	function onPlanKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.defaultPrevented || !isTextLike(e.target)) return;
		e.preventDefault();
		focusNextField(e.target);
	}

	/** For destructive forms. enhance ignores a prevented submit event, so cancel through it. */
	function confirmFirst(message: string): SubmitFunction {
		return ({ cancel }) => {
			if (!confirm(message)) {
				cancel();
				return;
			}
		};
	}
</script>

<svelte:head><title>{brew.beanName} · Unground</title></svelte:head>

<a class="back" href={backHref}><span aria-hidden="true">←</span> Brews</a>

<header class="head">
	<h1>{brew.beanName}</h1>
	<p class="muted">
		{brew.roasterName} ·
		<time datetime={brew.brewedAt.toISOString()}
			>{formatDateTime(brew.brewedAt, brew.timezone)}</time
		>
	</p>
	<div class="actions">
		<a class="btn btn-primary" href="/brews/new?from={brew.id}">Brew again</a>
		<a class="btn" href="/brews/{brew.id}/edit">Edit</a>
		{#if rating}
			<a class="btn" href={cardHref} onclick={shareCard} data-sveltekit-reload>Share</a>
		{:else}
			<a class="btn" href="#rate">Rate</a>
		{/if}
	</div>
</header>

<div class="stack">
	<section class="card">
		<h2 class="visually-hidden">Recipe</h2>
		<dl class="facts">
			<div>
				<dt>Dose</dt>
				<dd>{grams(brew.doseG)}</dd>
			</div>
			<div>
				<dt>Water</dt>
				<dd>{grams(brew.waterG)}</dd>
			</div>
			<div>
				<dt>Ratio</dt>
				<dd>{ratioText(ratio)}</dd>
			</div>
			<div>
				<dt>Temperature</dt>
				<dd>{brew.waterTempC} °C</dd>
			</div>
			<div>
				<dt>Grind</dt>
				<dd>
					{brew.grindSetting}{brew.grinderSettingUnit ? ` ${brew.grinderSettingUnit}` : ''}
					<span class="sub">{brew.grinderName}</span>
				</dd>
			</div>
			<div>
				<dt>Roast age</dt>
				<dd>
					{roastAge == null ? '—' : `${roastAge} day${roastAge === 1 ? '' : 's'}`}
					{#if brew.storedFrozen}<span class="sub">stored frozen</span>{/if}
				</dd>
			</div>
			<div>
				<dt>Dripper</dt>
				<dd>
					{brew.dripperName ?? '—'}
					{#if brew.dripperMaterial}<span class="sub">{label(brew.dripperMaterial)}</span>{/if}
				</dd>
			</div>
			<div>
				<dt>Filter</dt>
				<dd>{label(brew.details.filterType)}</dd>
			</div>
			<div>
				<dt>Agitation</dt>
				<dd>{brew.agitation == null ? '—' : `${brew.agitation} / 5`}</dd>
			</div>
			{#if brew.changed.length}
				<div class="wide">
					<dt>Changed vs last brew</dt>
					<dd>
						<span class="chips">
							{#each brew.changed as c (c)}<span class="chip">{label(c)}</span>{/each}
						</span>
					</dd>
				</div>
			{/if}
		</dl>
	</section>

	<section class="card">
		<h2>Pours</h2>
		<table class="pours">
			<thead>
				<tr>
					<th scope="col">Pour</th>
					<th scope="col">Scale</th>
					<th scope="col" class="time">Time</th>
				</tr>
			</thead>
			<tbody>
				{#each pours as p, i (i)}
					<tr>
						<td>
							{pourName(i)}
							{#if p.bloom}<span class="chip bloom">bloom</span>{/if}
						</td>
						<td>{i === 0 ? grams(p.cumulativeG) : p.cumulativeG}</td>
						<td class="time">{formatDuration(p.startS)}</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<td colspan="2">Total draw</td>
					<td class="time total">{formatDuration(brew.totalTimeS)}</td>
				</tr>
			</tfoot>
		</table>
	</section>

	{#if brew.notes}
		<section class="card">
			<h2>Brewing notes</h2>
			<p class="prewrap">{brew.notes}</p>
		</section>
	{/if}

	{#key brew.id}
		<section class="card stack corner-host" id="rate">
			<div class="rating-head">
				<h2>Rating</h2>
				{#if rating}
					<span class="score-badge" aria-label="Overall {rating.overall} of 10"
						>{rating.overall}</span
					>
				{/if}
			</div>
			{#if rating}
				<div>
					<div class="label">Taste profile</div>
					{#if anyDimension}
						<div class="radar"><RadarChart values={rating} label="Taste profile" /></div>
					{:else}
						<p class="small muted">No taste profile recorded.</p>
					{/if}
					{#if rating.aftertaste != null}
						<p class="small muted">Aftertaste (no longer rated): {rating.aftertaste}</p>
					{/if}
				</div>

				<div class="notes-compare">
					<div>
						<div class="label">Tasting notes</div>
						<FlavorChips ids={rating.perceivedNotes} empty="No notes picked" />
					</div>
					<div>
						<div class="label">Roaster says</div>
						<FlavorChips ids={data.claimed.notes} empty="No tagged notes" />
						{#if data.claimed.raw}<p class="small muted raw">“{data.claimed.raw}”</p>{/if}
					</div>
					{#if rating.perceivedNotes.length && data.claimed.notes.length}
						<p class="small">
							{#if agreeing.length}
								In common: {agreeing.map(flavorName).join(', ')}
							{:else}
								<span class="muted">None of your notes match the roaster’s.</span>
							{/if}
						</p>
					{/if}
				</div>

				{#if rating.comment}
					<div>
						<div class="label">Comment</div>
						<p class="prewrap">{rating.comment}</p>
					</div>
				{/if}

				<details class="corner" open={!!rateForm?.errors}>
					<summary class="btn-toggle edit" aria-label="Edit rating">Edit</summary>
					<form method="POST" action="?/rate" class="rate-form" use:enhance>
						<FormError form={rateForm} />
						<RatingFields values={formRating} errors={rateForm?.errors ?? {}} />
						<button class="btn btn-primary btn-block">Save rating</button>
					</form>
					<form
						method="POST"
						action="?/rate"
						class="remove"
						use:enhance={confirmFirst('Remove this rating? The brew stays.')}
					>
						<input type="hidden" name="intent" value="remove" />
						<button class="btn btn-sm btn-danger">Remove rating</button>
					</form>
				</details>
			{:else}
				<p class="muted">Not rated yet.</p>
				<form method="POST" action="?/rate" class="rate-form" use:enhance>
					<FormError form={rateForm} />
					<RatingFields values={formRating} from={lastRating} errors={rateForm?.errors ?? {}} />
					<button class="btn btn-primary btn-block">Save rating</button>
				</form>
			{/if}
		</section>
	{/key}

	<section class="card stack corner-host" id="next">
		<h2 class="corner-title">Next time</h2>
		{#if plan}
			{#if planChanges.length}
				<ul class="plan-list">
					{#each planChanges as c (c.param)}
						<li>
							<span class="name">{PLAN_LABEL[c.param]}</span>
							<span class="suggest">{c.text}</span>
						</li>
					{/each}
				</ul>
			{/if}
			{#if plan.notes}<p class="prewrap">{plan.notes}</p>{/if}
		{/if}

		<!-- Re-seeded when the saved plan changes (saved or removed), so the fields show it. -->
		{#key JSON.stringify(plan)}
			<details class="corner" open={!plan || !!planForm?.errors}>
				<summary class="btn-toggle" class:edit={!!plan} aria-label={plan ? 'Edit plan' : undefined}
					>{plan ? 'Edit' : 'Plan the next brew'}</summary
				>
				<!-- The keydown listener only catches Enter bubbling up from the inputs (onPlanKeydown). -->
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<form method="POST" action="?/plan" class="plan-form" onkeydown={onPlanKeydown} use:enhance>
					<FormError form={planForm} />
					<PlanFields
						values={formPlan}
						current={baseline}
						grindUnit={brew.grinderSettingUnit}
						errors={planForm?.errors ?? {}}
					/>
					<button class="btn btn-primary btn-block">Save plan</button>
				</form>
				{#if plan}
					<form
						method="POST"
						action="?/plan"
						class="remove"
						use:enhance={confirmFirst('Remove the plan for next time?')}
					>
						<input type="hidden" name="intent" value="remove" />
						<button class="btn btn-sm btn-danger">Remove plan</button>
					</form>
				{/if}
			</details>
		{/key}
	</section>

	<form
		method="POST"
		action="?/delete"
		class="delete"
		use:enhance={confirmFirst('Delete this brew and its rating? This can’t be undone.')}
	>
		<button class="btn btn-sm btn-danger">Delete brew</button>
	</form>
</div>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 44px;
		margin: -0.5rem 0 0 -0.25rem;
		padding: 0 0.25rem;
		color: var(--text);
		text-decoration: none;
	}
	.back span {
		font-size: 1.25rem;
		line-height: 1;
	}
	.head {
		margin: 0 0 1rem;
	}
	.head h1 {
		margin-bottom: 0.15rem;
		overflow-wrap: anywhere;
	}
	.head p {
		margin-bottom: 0.75rem;
	}
	.sub {
		display: block;
		font-weight: 400;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.wide {
		grid-column: 1 / -1;
	}
	.prewrap {
		white-space: pre-wrap;
		margin: 0;
	}
	.rating-head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 44px;
	}
	.rating-head h2 {
		margin: 0;
	}
	.rating-head .score-badge {
		min-width: 3.85rem;
		height: 2.1rem;
		font-size: 1.1rem;
	}
	.pours .time {
		text-align: right;
	}
	.pours tbody tr:first-child td {
		padding-top: 0.65rem;
	}
	.pours tfoot td {
		padding-top: 0.75rem;
		font-size: 1.1rem;
	}
	.pours .total {
		font-weight: 700;
	}
	.radar {
		max-width: 20rem;
		margin: 0.4rem auto 0;
	}
	.chip.bloom {
		margin-left: 0.25rem;
		padding: 0 0.55rem;
		font-size: 0.75rem;
	}
	.plan-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.plan-list li {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.plan-list .name {
		min-width: 6rem;
		font-weight: 600;
	}
	.plan-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 0.5rem;
	}
	.notes-compare {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.notes-compare p {
		margin: 0;
	}
	.notes-compare .raw {
		margin-top: 0.35rem;
	}
	.rate-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 0.5rem;
	}
	.remove {
		margin-top: 0.75rem;
	}
	.delete {
		display: flex;
		justify-content: flex-end;
	}
</style>
