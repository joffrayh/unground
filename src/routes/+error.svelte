<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="empty-state">
	<h1>{page.status === 404 ? 'Not found' : 'Something went wrong'}</h1>
	{#if page.status !== 404 && page.error?.message}<p>{page.error.message}</p>{/if}
	<p><a href="/">Back home</a></p>
</div>
