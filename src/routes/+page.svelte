<script lang="ts">
	import BrewListItem from '#lib/components/brews/BrewListItem.svelte';
	import { formatDateTime } from '#lib/ui/format.ts';
	import { brewsLeftText, gramsLeftText, leftFraction } from './beans/helpers.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const ready = $derived(data.hasBean && data.hasGrinder);
</script>

<svelte:head><title>Unground</title></svelte:head>

{#if data.total === 0 && !ready}
	<section class="stack">
		<h1>Welcome</h1>
		<ol class="list steps">
			<li>
				<a class="list-item" href="/equipment?return=/">
					<span class="mark" class:done={data.hasGrinder} aria-hidden="true"
						>{data.hasGrinder ? '✓' : '1'}</span
					>
					<span class="text"><span class="title">Add your grinder</span></span>
					<span class="visually-hidden">{data.hasGrinder ? '(done)' : ''}</span>
				</a>
			</li>
			<li>
				<a class="list-item" href="/beans/new?return=/">
					<span class="mark" class:done={data.hasBean} aria-hidden="true"
						>{data.hasBean ? '✓' : '2'}</span
					>
					<span class="text"><span class="title">Add a bag of beans</span></span>
					<span class="visually-hidden">{data.hasBean ? '(done)' : ''}</span>
				</a>
			</li>
			<li>
				{#if ready}
					<a class="list-item" href="/brews/new">
						<span class="mark" aria-hidden="true">3</span>
						<span class="text"><span class="title">Log a brew</span></span>
					</a>
				{:else}
					<span class="list-item muted">
						<span class="mark" aria-hidden="true">3</span>
						<span class="text"><span class="title">Log a brew</span></span>
					</span>
				{/if}
			</li>
		</ol>
	</section>
{:else}
	<div class="stack">
		<a class="btn btn-primary btn-block log" href="/brews/new">+ Log a brew</a>
		{#if !ready}
			<p class="card small">
				{#if !data.hasBean}
					No active beans. <a href="/beans/new?return=/brews/new">Add a bag</a>.
				{:else}
					No active grinder. <a href="/equipment?return=/brews/new">Add one</a>.
				{/if}
			</p>
		{/if}

		{#if data.unrated.length}
			<section>
				<h2>To rate</h2>
				<ul class="list">
					{#each data.unrated as b (b.id)}
						<li>
							<a class="list-item" href="/brews/{b.id}#rate">
								<span class="text">
									<span class="title">{b.beanName}</span>
									<span class="small muted">{formatDateTime(b.brewedAt, b.timezone)}</span>
								</span>
								<span class="btn btn-sm">Rate</span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if data.bags.length}
			<section aria-labelledby="bags-heading">
				<div class="section-head">
					<h2 id="bags-heading">Your beans</h2>
					<a class="small" href="/beans">All beans ›</a>
				</div>
				<ul class="list">
					{#each data.bags as b (b.id)}
						{@const brewsLeft = brewsLeftText(b, { withDose: b.assumedDose })}
						<li>
							<a class="list-item" href="/beans/{b.id}">
								<span class="text bag">
									<span class="name"
										><span class="title">{b.name}</span><span class="small muted"
											>&nbsp;· {b.roasterName}</span
										></span
									>
									<span class="small muted num"
										>{gramsLeftText(b.remainingG)}{#if brewsLeft}&ensp;·&ensp;{brewsLeft}{/if}</span
									>
									<span class="bar" aria-hidden="true"
										><span style:width="{leftFraction(b.remainingG, b.bagWeightG) * 100}%"
										></span></span
									>
								</span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{:else if data.unweighedCount > 0}
			<p class="small"><a class="muted tap" href="/beans">Add bag weights to see what’s left</a></p>
		{/if}

		<section>
			<div class="section-head">
				<h2>Recent brews</h2>
				<span class="small muted num">{data.total} brew{data.total === 1 ? '' : 's'}</span>
			</div>
			{#if data.latest.length}
				<ul class="list">
					{#each data.latest as brew (brew.id)}
						<li><BrewListItem {brew} /></li>
					{/each}
				</ul>
				{#if data.total > data.latest.length}
					<p class="more"><a href="/brews">All brews ›</a></p>
				{/if}
			{:else}
				<p class="empty-state card">No brews yet.</p>
			{/if}
		</section>
	</div>
{/if}

<style>
	.log {
		min-height: 56px;
		font-size: 1.1rem;
		margin-top: 0.5rem;
	}
	.section-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		margin-right: auto;
	}
	.bag {
		flex: 1;
		gap: 0.15rem;
		overflow-wrap: anywhere;
	}
	.bar {
		display: block;
		height: 4px;
		margin-top: 0.35rem;
		border-radius: 999px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.bar > span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--accent);
	}
	.tap {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	.steps .list-item {
		justify-content: flex-start;
	}
	.mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		font-weight: 700;
		flex-shrink: 0;
	}
	.mark.done {
		background: var(--ok);
		border-color: var(--ok);
		color: var(--surface);
	}
	.more {
		text-align: right;
		margin: 0.5rem 0 0;
	}
</style>
