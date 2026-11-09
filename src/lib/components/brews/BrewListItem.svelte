<script lang="ts">
	/** One brew in a list: date (in the brew's zone), bean, compact recipe and the overall score. */
	import type { BrewSummary } from '#lib/server/services/brews.ts';
	import { formatDateTime, formatDuration, grams } from '#lib/ui/format.ts';

	let { brew, href = `/brews/${brew.id}` }: { brew: BrewSummary; href?: string } = $props();

	const recipe = $derived(
		[
			grams(brew.doseG),
			grams(brew.waterG),
			`${brew.grindSetting}${brew.grinderSettingUnit ? ` ${brew.grinderSettingUnit}` : ''}`,
			formatDuration(brew.totalTimeS)
		].join(' · ')
	);
</script>

<a class="list-item" {href}>
	<div class="body">
		<div class="title">
			{brew.beanName} <span class="roaster">· {brew.roasterName}</span>
		</div>
		<div class="small muted">{formatDateTime(brew.brewedAt, brew.timezone)}</div>
		<div class="small num">{recipe}</div>
	</div>
	{#if brew.overall != null}
		<span class="score-badge" aria-label="Overall {brew.overall} of 10">{brew.overall}</span>
	{:else}
		<span class="score-badge empty" aria-label="Not rated yet">rate</span>
	{/if}
</a>

<style>
	.body {
		min-width: 0;
	}
	.title {
		overflow-wrap: anywhere;
	}
	.roaster {
		font-family: var(--font);
		font-weight: 300;
		color: var(--muted);
	}
</style>
