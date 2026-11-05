<script lang="ts">
	import BeanForm from '#lib/components/beans/BeanForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Keep `?return=` on the action URL so the server can send the user back with the new bean.
	const action = $derived(
		data.returnTo ? `?return=${encodeURIComponent(data.returnTo)}` : undefined
	);
</script>

<svelte:head><title>New bean · Unground</title></svelte:head>

<div class="page-header">
	<h1>New bean</h1>
</div>

<BeanForm
	{form}
	roasters={data.roasters}
	today={data.today}
	{action}
	submitLabel="Save bean"
	cancelHref={data.returnTo ?? '/beans'}
/>
