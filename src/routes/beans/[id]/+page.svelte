<script lang="ts">
	import { enhance } from '$app/forms';
	import FlavorChips from '#lib/components/FlavorChips.svelte';
	import FormError from '#lib/components/FormError.svelte';
	import { brewRatio, roastAgeDays } from '#lib/domain/derive.ts';
	import { COUNTRIES } from '#lib/domain/vocab.ts';
	import { formatDate, formatDateTime, grams, label, ratioText } from '#lib/ui/format.ts';
	import { roundTenth } from '#lib/domain/pours.ts';
	import {
		altitudeText,
		bagEmptyText,
		brewsLeftText,
		gramsLeftText,
		leftFraction,
		pricePerBrewText,
		priceText,
		roastAgeText
	} from '../helpers.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const bean = $derived(data.bean);
	const archived = $derived(bean.archivedAt != null);
	const yesNo = (v: boolean) => (v ? 'Yes' : 'No');

	const bag = $derived(data.bag);
	const perBrew = $derived(pricePerBrewText(bean.bagPrice, bean.bagWeightG, bag?.doseG ?? null));
</script>

<svelte:head><title>{bean.name} · Unground</title></svelte:head>

<div class="page-header">
	<div class="heading">
		<h1>{bean.name}</h1>
		<p class="muted">
			{bean.roasterName}
			{#if archived}<span class="chip badge">Archived</span>{/if}
		</p>
	</div>
	<a class="btn btn-sm" href="/beans/{bean.id}/edit">Edit</a>
</div>

<div class="stack">
	{#if !archived}
		<a class="btn btn-primary btn-block" href="/brews/new?bean={bean.id}">Log a brew</a>
	{/if}

	<section class="card stack" aria-labelledby="bag-heading">
		<h2 id="bag-heading">Bag</h2>
		{#if bag && bean.bagWeightG != null}
			<div class="left">
				{#if bag.remainingG > 0}
					{@const brewsLeft = brewsLeftText(bag, { withDose: true })}
					<p class="num">
						<strong>{gramsLeftText(bag.remainingG)}</strong
						>{#if brewsLeft}&ensp;·&ensp;{brewsLeft}{/if}
					</p>
				{:else}
					<p class="num"><strong>{bagEmptyText(bean.bagWeightG, bean.usedG)}</strong></p>
				{/if}
				<div class="bar" aria-hidden="true">
					<div style:width="{leftFraction(bag.remainingG, bean.bagWeightG) * 100}%"></div>
				</div>
				{#if bag.remainingG > 0 && bean.lastDoseG == null && bag.doseG != null}
					<p class="hint">Assumes your latest dose.</p>
				{/if}
			</div>
		{:else}
			<p class="small">
				<a class="tap" href="/beans/{bean.id}/edit">Add the bag weight to track what’s left</a>
			</p>
		{/if}
		<dl class="facts">
			<div>
				<dt>Bag weight</dt>
				<dd>{grams(bean.bagWeightG)}</dd>
			</div>
			<div>
				<dt>Price paid</dt>
				<dd>{bean.bagPrice != null ? priceText(bean.bagPrice) : '—'}</dd>
			</div>
			<div>
				<dt>Used so far</dt>
				<dd>{grams(roundTenth(bean.usedG))}</dd>
			</div>
			{#if perBrew}
				<div>
					<dt>Price per brew</dt>
					<dd>{perBrew}</dd>
				</div>
			{/if}
		</dl>
	</section>

	<section class="card">
		<h2>Origin</h2>
		<dl class="facts">
			<div>
				<dt>Country</dt>
				<dd>{bean.country ? (COUNTRIES[bean.country] ?? bean.country) : '—'}</dd>
			</div>
			<div>
				<dt>Farm</dt>
				<dd>{bean.farm ?? '—'}</dd>
			</div>
			<div>
				<dt>Altitude</dt>
				<dd>{altitudeText(bean.altitudeMinM, bean.altitudeMaxM) ?? '—'}</dd>
			</div>
		</dl>
	</section>

	<section class="card">
		<h2>Process</h2>
		<dl class="facts">
			<div>
				<dt>Processing method</dt>
				<dd>{label(bean.process)}</dd>
			</div>
		</dl>
	</section>

	<section class="card">
		<h2>Roast</h2>
		<dl class="facts">
			<div>
				<dt>Roaster</dt>
				<dd>{bean.roasterName}</dd>
			</div>
			<div>
				<dt>Roast level</dt>
				<dd>{label(bean.roastLevel)}</dd>
			</div>
			<div>
				<dt>Roast date</dt>
				<dd>{formatDate(bean.roastDate)}</dd>
			</div>
			<div>
				<dt>Roast age</dt>
				<dd>{roastAgeText(data.roastAge) ?? '—'}</dd>
			</div>
			<div>
				<dt>Decaf</dt>
				<dd>{yesNo(bean.decaf)}</dd>
			</div>
			<div>
				<dt>Stored frozen</dt>
				<dd>{yesNo(bean.storedFrozen)}</dd>
			</div>
		</dl>
	</section>

	<section class="card stack">
		<h2>Roaster’s tasting notes</h2>
		<FlavorChips ids={bean.roasterNotes} empty="No wheel notes" />
		{#if bean.roasterNotesRaw}
			<div>
				<div class="small muted">On the bag</div>
				<p class="raw">{bean.roasterNotesRaw}</p>
			</div>
		{/if}
	</section>

	<section class="stack">
		<h2>
			Brews
			<span class="muted small num"
				>{bean.brewCount > data.brews.length
					? `latest ${data.brews.length} of ${bean.brewCount}`
					: bean.brewCount}</span
			>
		</h2>
		{#if data.brews.length === 0}
			<p class="card empty-state small">No brews yet.</p>
		{:else}
			{#if bean.brewCount > data.brews.length}
				<a class="small" href="/brews?bean={bean.id}">All {bean.brewCount} brews ›</a>
			{/if}
			<ul class="list">
				{#each data.brews as brew (brew.id)}
					{@const age = roastAgeDays(bean.roastDate, brew.brewedAt, brew.timezone)}
					<li>
						<a class="list-item" href="/brews/{brew.id}">
							<div class="info">
								<div class="title num">{formatDateTime(brew.brewedAt, brew.timezone)}</div>
								<div class="small muted num">
									{grams(brew.doseG)} → {grams(brew.waterG)}&ensp;·&ensp;{ratioText(
										brewRatio(brew.doseG, brew.waterG)
									)}&ensp;·&ensp;{brew.grinderName}
									{brew.grindSetting}{#if age != null}&ensp;·&ensp;day {age}{/if}
								</div>
							</div>
							{#if brew.overall != null}
								<span class="score-badge" aria-label="Overall {brew.overall} of 5"
									>{brew.overall}</span
								>
							{:else}
								<span class="score-badge empty">Rate</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="card stack">
		<h2>Manage</h2>
		<FormError {form} />
		<div class="actions">
			<form method="POST" action="?/archive" use:enhance>
				<input type="hidden" name="archived" value={archived ? '0' : '1'} />
				<button class="btn">{archived ? 'Unarchive' : 'Archive'}</button>
			</form>
			<!-- No use:enhance: it ignores a prevented submit, so Cancel would still delete. -->
			<form
				method="POST"
				action="?/delete"
				onsubmit={(e) => {
					if (!confirm(`Delete “${bean.name}”? This can’t be undone.`)) e.preventDefault();
				}}
			>
				<button class="btn btn-danger">Delete</button>
			</form>
		</div>
		{#if bean.brewCount > 0}
			<p class="hint">Has brews, so it can only be archived.</p>
		{/if}
	</section>
</div>

<style>
	.heading {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.heading p {
		margin: 0.25rem 0 0;
	}
	.badge {
		margin-left: 0.35rem;
		font-size: 0.75rem;
		background: var(--surface-2);
		color: var(--muted);
	}
	h2 .small {
		font-weight: 400;
		margin-left: 0.35rem;
	}
	.raw {
		margin: 0;
		white-space: pre-line;
	}
	.info {
		min-width: 0;
	}
	.left {
		padding-bottom: 1.25rem;
	}
	.left p {
		margin: 0 0 0.15rem;
	}
	.left .hint {
		display: block;
		margin: 0.5rem 0 0;
	}
	.tap {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	.bar {
		height: 6px;
		border-radius: 999px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.bar > div {
		height: 100%;
		border-radius: inherit;
		background: var(--accent);
	}
</style>
