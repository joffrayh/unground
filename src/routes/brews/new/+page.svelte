<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import BrewForm from '#lib/components/brews/BrewForm.svelte';
	import {
		clearBrewDraft,
		readBrewDraft,
		resumeBrewDraft,
		writeBrewDraft,
		type DraftFields
	} from '#lib/components/brews/brew-draft.ts';
	import { formatDateTime } from '#lib/ui/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Come back to exactly this page (template, chosen bean/grinder) after adding a bean or grinder.
	const returnTo = $derived(encodeURIComponent(page.url.pathname + page.url.search));

	const owner = $derived(data.user?.email ?? '');
	// Only after mounting: the server can't see the draft, and hydration has to match what it sent.
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
	const draft = $derived.by(() => {
		if (!mounted || data.setup) return null;
		const saved = readBrewDraft(owner);
		return saved && resumeBrewDraft(saved, page.url.searchParams, data);
	});
	const values = $derived(draft?.values ?? data.values);
	const copiedFrom = $derived(draft ? draft.copiedFrom : data.copiedFrom);

	const keeper = {
		save: (fields: DraftFields) => writeBrewDraft(owner, { fields, values, copiedFrom }),
		clear: () => clearBrewDraft(owner)
	};
</script>

<svelte:head><title>Log a brew · Unground</title></svelte:head>

<div class="page-header">
	<h1>Log a brew</h1>
</div>

{#if data.setup}
	<div class="card stack">
		<p>Add a grinder and beans first.</p>
		<ul class="list">
			<li>
				{#if data.setup.hasGrinder}
					<span class="list-item"><span>✓ Grinder added</span></span>
				{:else}
					<a class="list-item" href="/equipment?return={returnTo}">
						<span class="title">Add your grinder</span><span aria-hidden="true">›</span>
					</a>
				{/if}
			</li>
			<li>
				{#if data.setup.hasBean}
					<span class="list-item"><span>✓ Beans added</span></span>
				{:else}
					<a class="list-item" href="/beans/new?return={returnTo}">
						<span class="title">Add a bag of beans</span><span aria-hidden="true">›</span>
					</a>
				{/if}
			</li>
		</ul>
	</div>
{:else}
	{#if copiedFrom}
		<p class="small muted copied">
			Copied from your {copiedFrom.explicit ? '' : 'last '}brew on
			<a href="/brews/{copiedFrom.id}">{formatDateTime(copiedFrom.brewedAt, copiedFrom.timezone)}</a
			>.
			{#if copiedFrom.beanReset}
				Its bean ({copiedFrom.beanName}) is archived: pick one.
			{/if}
			{#if copiedFrom.grinderReset}
				It used a different grinder ({copiedFrom.grinderName}): enter the grind.
			{/if}
		</p>
	{/if}
	<!-- The form seeds itself once, so a draft found after mounting needs a fresh one. -->
	{#key `${page.url.search}|${!!draft}`}
		<BrewForm
			form={form ?? (draft ? { values: draft.fields } : null)}
			{values}
			beans={data.beans}
			grinders={data.grinders}
			drippers={data.drippers}
			navSubmit
			catalogueLinks
			liveBrewedAtIn={data.user?.timezone}
			draft={keeper}
		/>
	{/key}
{/if}

<style>
	.copied {
		margin-top: -0.5rem;
	}
</style>
