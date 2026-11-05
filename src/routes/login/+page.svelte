<script lang="ts">
	import { enhance } from '$app/forms';
	import FieldError from '#lib/components/FieldError.svelte';
	import FormError from '#lib/components/FormError.svelte';
	import { err, val } from '#lib/ui/forms.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let submitting = $state(false);

	// Post back to ?next=… so a failed attempt keeps the return path (no-JS reloads land on this URL).
	const action = $derived(data.next ? `?next=${encodeURIComponent(data.next)}` : '/login');
	const emailError = $derived(err(form, 'email'));
	const passwordError = $derived(err(form, 'password'));
</script>

<svelte:head>
	<title>Sign in · Unground</title>
</svelte:head>

<div class="auth stack">
	<form
		method="POST"
		{action}
		class="card stack"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
	>
		<h1>Sign in</h1>
		<FormError {form} />

		<div class="field">
			<label for="email">Email</label>
			<input
				id="email"
				name="email"
				type="email"
				autocomplete="username"
				autocapitalize="none"
				spellcheck="false"
				required
				value={val(form, 'email')}
				aria-invalid={emailError ? 'true' : undefined}
				aria-describedby={emailError ? 'email-error' : undefined}
			/>
			<FieldError id="email-error" message={emailError} />
		</div>

		<div class="field">
			<label for="password">Password</label>
			<input
				id="password"
				name="password"
				type="password"
				autocomplete="current-password"
				required
				aria-invalid={passwordError ? 'true' : undefined}
				aria-describedby={passwordError ? 'password-error' : undefined}
			/>
			<FieldError id="password-error" message={passwordError} />
		</div>

		<button class="btn btn-primary btn-block" disabled={submitting}>
			{submitting ? 'Signing in…' : 'Sign in'}
		</button>
	</form>

	{#if data.canSignUp}
		<p class="switch"><a href="/signup">Create an account</a></p>
	{/if}
</div>

<style>
	.auth {
		max-width: 24rem;
		margin: 1.5rem auto 0;
	}
	.switch {
		margin: 0;
		text-align: center;
	}
</style>
