<script lang="ts">
	import BeanForm from '#lib/components/beans/BeanForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Edit {data.bean.name} · Unground</title></svelte:head>

<div class="page-header">
	<h1>Edit bean</h1>
</div>

<BeanForm
	{form}
	bean={data.bean}
	roasters={data.roasters}
	today={data.today}
	submitLabel="Save changes"
	cancelHref="/beans/{data.bean.id}"
/>
