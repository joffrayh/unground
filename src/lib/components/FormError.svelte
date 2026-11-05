<script lang="ts">
	import type { FormState } from '#lib/ui/forms.ts';

	/** Shows the form-wide error (`errors._form`) and a summary when fields have errors. */
	let { form }: { form: FormState } = $props();

	const message = $derived(form?.errors?._form);
	const fieldCount = $derived(Object.keys(form?.errors ?? {}).filter((k) => k !== '_form').length);
</script>

{#if message || fieldCount > 0}
	<div class="form-error" role="alert">
		{#if message}{message}{:else}Please fix the {fieldCount === 1
				? 'highlighted field'
				: `${fieldCount} highlighted fields`}.{/if}
	</div>
{/if}
