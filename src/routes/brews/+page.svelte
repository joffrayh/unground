<script lang="ts">
	import BrewListItem from '#lib/components/brews/BrewListItem.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const beanQuery = $derived(data.bean ? `bean=${data.bean.id}&` : '');
</script>

<svelte:head><title>Brews · Unground</title></svelte:head>

<div class="page-header">
	<h1>Brews</h1>
	<a class="btn btn-primary btn-sm" href="/brews/new">+ Log a brew</a>
</div>

{#if data.bean}
	<p class="filter small">
		<span>Only <strong>{data.bean.name}</strong> · {data.bean.roasterName}</span>
		<a href="/brews">Show all brews</a>
	</p>
{/if}

{#if data.brews.length === 0}
	<div class="empty-state card">
		{#if data.older}
			<p>No older brews.</p>
			<p><a href="/brews{data.bean ? `?bean=${data.bean.id}` : ''}">Back to the newest</a></p>
		{:else if data.bean}
			<p>No brews with this bean yet.</p>
			<p><a class="btn btn-primary" href="/brews/new?bean={data.bean.id}">Brew it now</a></p>
		{:else}
			<p>No brews yet. Your log starts with the next cup.</p>
			<p><a class="btn btn-primary" href="/brews/new">Log your first brew</a></p>
		{/if}
	</div>
{:else}
	<ul class="list">
		{#each data.brews as brew (brew.id)}
			<li><BrewListItem {brew} /></li>
		{/each}
	</ul>

	<nav class="pager" aria-label="More brews">
		{#if data.older}
			<a href="/brews{data.bean ? `?bean=${data.bean.id}` : ''}">‹ Newest</a>
		{/if}
		{#if data.nextCursor}
			<a class="btn" href="/brews?{beanQuery}before={encodeURIComponent(data.nextCursor)}"
				>Load older</a
			>
		{:else}
			<span class="small muted">That’s every brew.</span>
		{/if}
	</nav>
{/if}

<style>
	.filter {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.25rem 1rem;
		margin-top: -0.5rem;
	}
	.pager {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 1rem;
	}
	.pager > :last-child {
		margin-left: auto;
	}
</style>
