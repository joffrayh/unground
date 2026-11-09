<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import FieldError from '#lib/components/FieldError.svelte';
	import FormError from '#lib/components/FormError.svelte';
	import { err, val } from '#lib/ui/forms.ts';
	import { THEMES } from '#lib/ui/theme.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Each form only shows the result of its own action.
	const tzForm = $derived(form?.action === 'timezone' ? form : null);
	const pwForm = $derived(form?.action === 'password' ? form : null);

	let deviceZone = $state('');
	onMount(() => {
		deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
	});

	/** Zones grouped by region ("Europe/London" → Europe), so the long list is easier to scan. */
	const zoneGroups = $derived.by(() => {
		const groups: Record<string, string[]> = {};
		for (const zone of data.timeZones) {
			const slash = zone.indexOf('/');
			(groups[slash === -1 ? 'Other' : zone.slice(0, slash)] ??= []).push(zone);
		}
		return Object.entries(groups);
	});
	/** After a failure, re-select what was submitted, unless it isn't an option (then show the saved zone). */
	const selectedZone = $derived.by(() => {
		const submitted = val(tzForm, 'timezone', data.timezone);
		return data.timeZones.includes(submitted) ? submitted : data.timezone;
	});

	let busy = $state<string | null>(null);
	/** Disables a form's button while it submits. `reset: false` keeps a re-rendered <select> on the saved zone. */
	function track(name: string, reset = true): SubmitFunction {
		return () => {
			busy = name;
			return async ({ update }) => {
				await update({ reset });
				busy = null;
			};
		};
	}

	const tzError = $derived(err(tzForm, 'timezone'));
	const currentError = $derived(err(pwForm, 'currentPassword'));
	const newError = $derived(err(pwForm, 'newPassword'));
	const confirmError = $derived(err(pwForm, 'confirmPassword'));
</script>

<svelte:head>
	<title>Settings · Unground</title>
</svelte:head>

<div class="page-header">
	<h1>Settings</h1>
</div>

<div class="stack">
	<section class="card account" aria-labelledby="account-heading">
		<div>
			<h2 id="account-heading">Account</h2>
			<p class="email">Signed in as <strong>{data.email}</strong></p>
		</div>
		<form method="POST" action="/logout" use:enhance={track('logout')}>
			<button class="btn" disabled={busy === 'logout'}>Sign out</button>
		</form>
	</section>

	<section aria-labelledby="gear-heading">
		<h2 id="gear-heading">Coffee & gear</h2>
		<ul class="list">
			<li>
				<a class="list-item" href="/beans">
					<span class="title">Beans</span>
					<span aria-hidden="true" class="muted">›</span>
				</a>
			</li>
			<li>
				<a class="list-item" href="/equipment">
					<span class="title">Equipment</span>
					<span aria-hidden="true" class="muted">›</span>
				</a>
			</li>
		</ul>
	</section>

	<section class="card" aria-labelledby="theme-heading">
		<h2 id="theme-heading">Theme</h2>
		<form method="POST" action="?/theme" class="themes" use:enhance={track('theme', false)}>
			{#each Object.entries(THEMES) as [id, label] (id)}
				<button
					class="btn"
					class:btn-primary={data.theme === id}
					name="theme"
					value={id}
					aria-pressed={data.theme === id}
					disabled={busy === 'theme'}
				>
					{label}
				</button>
			{/each}
		</form>
	</section>

	<section class="card stack" aria-labelledby="export-heading">
		<h2 id="export-heading">Export your data</h2>
		<div class="actions">
			<a class="btn" href="/export/brews.csv" download>Download brews.csv</a>
			<a class="btn" href="/export/pours.csv" download>Download pours.csv</a>
		</div>
		<ul class="small notes">
			<li>Pours join brews on <code>brew_id</code>.</li>
			<li>
				Tasting notes are wheel paths separated by <code>;</code>, e.g.
				<code>fruity.berry.blueberry;floral</code>.
			</li>
		</ul>
	</section>

	<section class="card stack" aria-labelledby="tz-heading">
		<h2 id="tz-heading">Time zone</h2>
		<p class="muted small">Applies to new brews only.</p>

		<form method="POST" action="?/timezone" class="stack" use:enhance={track('timezone', false)}>
			<FormError form={tzForm} />
			<div class="field">
				<label for="timezone">Time zone</label>
				<select
					id="timezone"
					name="timezone"
					value={selectedZone}
					aria-invalid={tzError ? 'true' : undefined}
					aria-describedby={tzError ? 'timezone-error' : undefined}
				>
					{#each zoneGroups as [region, zones] (region)}
						<optgroup label={region}>
							{#each zones as zone (zone)}
								<option value={zone}>{zone.replaceAll('_', ' ')}</option>
							{/each}
						</optgroup>
					{/each}
				</select>
				<FieldError id="timezone-error" message={tzError} />
			</div>
			<div class="actions">
				<button class="btn btn-primary" disabled={busy === 'timezone'}>Save time zone</button>
			</div>
		</form>

		{#if deviceZone && deviceZone !== data.timezone}
			<form method="POST" action="?/timezone" use:enhance={track('timezone', false)}>
				<input type="hidden" name="timezone" value={deviceZone} />
				<button class="btn btn-sm" disabled={busy === 'timezone'}>
					Use this device's zone ({deviceZone.replaceAll('_', ' ')})
				</button>
			</form>
		{/if}

		{#if tzForm && 'success' in tzForm}
			<p class="ok" role="status">Time zone saved.</p>
		{/if}
	</section>

	<section class="card" aria-labelledby="pw-heading">
		<form method="POST" action="?/password" class="stack" use:enhance={track('password')}>
			<h2 id="pw-heading">Change password</h2>
			<FormError form={pwForm} />

			<div class="field">
				<label for="currentPassword">Current password</label>
				<input
					id="currentPassword"
					name="currentPassword"
					type="password"
					autocomplete="current-password"
					required
					aria-invalid={currentError ? 'true' : undefined}
					aria-describedby={currentError ? 'currentPassword-error' : undefined}
				/>
				<FieldError id="currentPassword-error" message={currentError} />
			</div>

			<div class="field">
				<label for="newPassword">New password</label>
				<input
					id="newPassword"
					name="newPassword"
					type="password"
					autocomplete="new-password"
					required
					minlength="10"
					maxlength="200"
					aria-invalid={newError ? 'true' : undefined}
					aria-describedby={newError ? 'newPassword-hint newPassword-error' : 'newPassword-hint'}
				/>
				<span class="hint" id="newPassword-hint">At least 10 characters.</span>
				<FieldError id="newPassword-error" message={newError} />
			</div>

			<div class="field">
				<label for="confirmPassword">Confirm new password</label>
				<input
					id="confirmPassword"
					name="confirmPassword"
					type="password"
					autocomplete="new-password"
					required
					aria-invalid={confirmError ? 'true' : undefined}
					aria-describedby={confirmError ? 'confirmPassword-error' : undefined}
				/>
				<FieldError id="confirmPassword-error" message={confirmError} />
			</div>

			<p class="hint">Also signs out your other devices.</p>
			<div class="actions">
				<button class="btn btn-primary" disabled={busy === 'password'}>Change password</button>
			</div>
			{#if pwForm && 'success' in pwForm}
				<p class="ok" role="status">Password changed.</p>
			{/if}
		</form>
	</section>

	<section class="card stack" aria-labelledby="sessions-heading">
		<h2 id="sessions-heading">Sign out everywhere</h2>
		<p class="muted small">Every device, including this one.</p>
		<form method="POST" action="?/signOutEverywhere" use:enhance={track('signOutEverywhere')}>
			<button class="btn btn-danger" disabled={busy === 'signOutEverywhere'}>
				Sign out everywhere
			</button>
		</form>
	</section>
</div>

<style>
	.account {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.email {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.themes {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
	}
	.themes .btn {
		padding-inline: 0.25rem;
	}
	.notes {
		margin: 0;
		padding-left: 1.2rem;
	}
	.notes li + li {
		margin-top: 0.35rem;
	}
	code {
		font-family: var(--mono);
		font-size: 0.85em;
		background: var(--surface-2);
		border-radius: 4px;
		padding: 0.05rem 0.3rem;
		overflow-wrap: anywhere;
	}
	.ok {
		margin: 0;
		color: var(--ok);
		font-weight: 600;
	}
	section > h2 {
		margin-bottom: 0.5rem;
	}
</style>
