<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import FieldError from '#lib/components/FieldError.svelte';
	import FormError from '#lib/components/FormError.svelte';
	import { err, val } from '#lib/ui/forms.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let submitting = $state(false);

	// Filled in the browser; without JavaScript it stays blank and the account starts on UTC.
	let deviceZone = $state('');
	onMount(() => {
		deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
	});
	const timezone = $derived(deviceZone || val(form, 'timezone'));

	const emailError = $derived(err(form, 'email'));
	const passwordError = $derived(err(form, 'password'));
	const inviteError = $derived(err(form, 'inviteCode'));
</script>

<svelte:head>
	<title>Create account · Unground</title>
</svelte:head>

<div class="auth stack">
	{#if data.registration === 'closed'}
		<div class="card stack">
			<h1>Sign-up is closed</h1>
			<p class="muted">Ask whoever runs this app for an invite code.</p>
		</div>
	{:else}
		<form
			method="POST"
			class="card stack"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<h1>Create an account</h1>
			<FormError {form} />

			<div class="field">
				<label for="email">Email</label>
				<input
					id="email"
					name="email"
					type="email"
					autocomplete="email"
					autocapitalize="none"
					spellcheck="false"
					required
					maxlength="254"
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
					autocomplete="new-password"
					required
					minlength="10"
					maxlength="200"
					aria-invalid={passwordError ? 'true' : undefined}
					aria-describedby={passwordError ? 'password-hint password-error' : 'password-hint'}
				/>
				<span class="hint" id="password-hint">
					At least 10 characters. There's no email reset, so keep it safe.
				</span>
				<FieldError id="password-error" message={passwordError} />
			</div>

			{#if data.registration === 'invite'}
				<div class="field">
					<label for="inviteCode">Invite code</label>
					<input
						id="inviteCode"
						name="inviteCode"
						type="text"
						autocomplete="off"
						autocapitalize="none"
						spellcheck="false"
						required
						maxlength="200"
						value={val(form, 'inviteCode')}
						aria-invalid={inviteError ? 'true' : undefined}
						aria-describedby={inviteError ? 'inviteCode-error' : undefined}
					/>
					<FieldError id="inviteCode-error" message={inviteError} />
				</div>
			{/if}

			<input type="hidden" name="timezone" value={timezone} />

			<button class="btn btn-primary btn-block" disabled={submitting}>
				{submitting ? 'Creating account…' : 'Create account'}
			</button>
		</form>
	{/if}

	<p class="switch"><a href="/login">Sign in</a></p>
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
