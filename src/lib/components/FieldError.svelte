<script lang="ts">
	/** Inline error under a field. Give the input `aria-describedby={id}` and `aria-invalid`. */
	let { id, message }: { id: string; message: string | undefined } = $props();
</script>

{#if message}<span class="error" {id}>{message}</span>{/if}
