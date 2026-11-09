<script lang="ts">
	import { page } from '$app/state';
	import BrewForm from '#lib/components/brews/BrewForm.svelte';
	import { formatDateTime } from '#lib/ui/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Come back to exactly this page (template, chosen bean/grinder) after adding a bean or grinder.
	const returnTo = $derived(encodeURIComponent(page.url.pathname + page.url.search));
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
	{#if data.copiedFrom}
		<p class="small muted copied">
			Copied from your {data.copiedFrom.explicit ? '' : 'last '}brew on
			<a href="/brews/{data.copiedFrom.id}"
				>{formatDateTime(data.copiedFrom.brewedAt, data.copiedFrom.timezone)}</a
			>.
			{#if data.copiedFrom.beanReset}
				Its bean ({data.copiedFrom.beanName}) is archived: pick one.
			{/if}
			{#if data.copiedFrom.grinderReset}
				It used a different grinder ({data.copiedFrom.grinderName}): enter the grind.
			{/if}
		</p>
	{/if}
	{#key page.url.search}
		<BrewForm
			{form}
			values={data.values}
			beans={data.beans}
			grinders={data.grinders}
			drippers={data.drippers}
			navSubmit
			catalogueLinks
			liveBrewedAtIn={data.user?.timezone}
		/>
	{/key}
{/if}

<style>
	.copied {
		margin-top: -0.5rem;
	}
</style>
