<script lang="ts">
	import BrewForm from '#lib/components/brews/BrewForm.svelte';
	import { formatDateTime } from '#lib/ui/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Edit brew · Unground</title></svelte:head>

<div class="page-header">
	<div>
		<h1>Edit brew</h1>
		<p class="small muted sub">
			{data.brew.beanName} · {formatDateTime(data.brew.brewedAt, data.brew.timezone)}
		</p>
	</div>
	<a class="btn btn-sm" href="/brews/{data.brew.id}">Cancel</a>
</div>

{#key data.brew.id}
	<BrewForm
		{form}
		values={data.values}
		beans={data.beans}
		grinders={data.grinders}
		drippers={data.drippers}
		submitLabel="Save changes"
		timezone={data.showZone ? data.brew.timezone : undefined}
	/>
{/key}

<style>
	.sub {
		margin: 0.15rem 0 0;
	}
</style>
