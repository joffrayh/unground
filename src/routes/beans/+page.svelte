<script lang="ts">
	import { formatDate, label } from '#lib/ui/format.ts';
	import { gramsLeftText, roastAgeText } from './helpers.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Beans · Unground</title></svelte:head>

<div class="page-header">
	<h1>Beans</h1>
	<a class="btn btn-primary" href="/beans/new">New bean</a>
</div>

<div class="stack">
	<div class="toolbar small">
		<a href="/equipment">Equipment</a>
		{#if data.showArchived}
			<a href="/beans">Hide archived</a>
		{:else if data.archivedCount > 0}
			<a href="/beans?archived=1">Show archived ({data.archivedCount})</a>
		{/if}
	</div>

	{#if data.beans.length === 0}
		<div class="card empty-state">
			<p>No beans yet.</p>
			<a class="btn btn-primary" href="/beans/new">Add your first bean</a>
		</div>
	{:else}
		<ul class="list">
			{#each data.beans as bean (bean.id)}
				{@const age = roastAgeText(bean.roastAge)}
				<li class:archived={bean.archivedAt != null}>
					<a class="list-item" href="/beans/{bean.id}">
						<div class="info">
							<div>
								<span class="title">{bean.name}</span>
								{#if bean.archivedAt}<span class="chip badge">Archived</span>{/if}
							</div>
							<div class="small muted">
								{bean.roasterName}{#if bean.process}&ensp;·&ensp;{label(bean.process)}{/if}
							</div>
							{#if bean.roastDate}
								<div class="small muted num">
									Roasted {formatDate(bean.roastDate)}{#if age}&ensp;·&ensp;{age}{/if}
								</div>
							{/if}
						</div>
						<span class="count small muted num">
							<span>{bean.brewCount} {bean.brewCount === 1 ? 'brew' : 'brews'}</span>
							{#if bean.bag}<span>{gramsLeftText(bean.bag.remainingG)}</span>{/if}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		padding-bottom: 1rem;
	}
	.info {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.count {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		flex-shrink: 0;
		white-space: nowrap;
	}
	.badge {
		margin-left: 0.35rem;
		font-size: 0.75rem;
		background: var(--surface-2);
		color: var(--muted);
		vertical-align: 0.1em;
	}
	li.archived .title {
		color: var(--muted);
	}
</style>
