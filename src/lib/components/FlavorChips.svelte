<script lang="ts">
	import { FLAVOR_BY_ID, flavorPath } from '#lib/domain/flavors.ts';

	/** Read-only display of flavor tags; the full wheel path is the tooltip. */
	let { ids, empty = '—' }: { ids: readonly string[]; empty?: string } = $props();
</script>

{#if ids.length === 0}
	<span class="muted">{empty}</span>
{:else}
	<span class="chips">
		{#each ids as id (id)}
			<span class="chip" title={flavorPath(id).join(' › ')}>{FLAVOR_BY_ID.get(id)?.name ?? id}</span
			>
		{/each}
	</span>
{/if}
