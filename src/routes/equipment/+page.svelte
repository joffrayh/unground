<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import FieldError from '#lib/components/FieldError.svelte';
	import FormError from '#lib/components/FormError.svelte';
	import { DRIPPER_MATERIALS } from '#lib/domain/vocab.ts';
	import { label, options } from '#lib/ui/format.ts';
	import { err, val, type FormState } from '#lib/ui/forms.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** The action result only if it belongs to `target`, so each form shows just its own errors. */
	function scoped(target: string): FormState {
		return form?.target === target ? form : null;
	}
	const hasErrors = (f: FormState) => Object.keys(f?.errors ?? {}).length > 0;

	/** Action URL that keeps `?return=` so the round trip from the brew form survives other edits here. */
	const act = (name: string) =>
		`?/${name}` + (data.returnTo ? `&return=${encodeURIComponent(data.returnTo)}` : '');

	/** Inline edit forms keep what was typed (no reset) and fold away once the change is saved. */
	const closeOnSuccess: SubmitFunction =
		({ formElement }) =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') formElement.closest('details')?.removeAttribute('open');
		};

	// Deletes are plain POSTs: `use:enhance` ignores a prevented submit, so Cancel would still delete.
	const confirmDelete = (name: string) => (e: SubmitEvent) => {
		if (!confirm(`Delete “${name}”? This can’t be undone.`)) e.preventDefault();
	};

	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

	function host(url: string): string {
		try {
			return new URL(url).host.replace(/^www\./, '');
		} catch {
			return url;
		}
	}
	const isWebLink = (url: string | null): url is string => !!url && /^https?:\/\//i.test(url);

	const newGrinder = $derived(scoped('newGrinder'));
	const grinderAdded = $derived(form?.target === 'newGrinder' && !!form.created);
	const newDripper = $derived(scoped('newDripper'));
	const dripperAdded = $derived(form?.target === 'newDripper' && !!form.created);
	const materials = options(DRIPPER_MATERIALS);
</script>

<svelte:head><title>Equipment · Unground</title></svelte:head>

<div class="page-header">
	<h1>Equipment</h1>
	<a class="btn btn-sm" href="/beans">Beans</a>
</div>

<div class="stack">
	{#if data.returnTo}
		<p class="small back"><a class="tap" href={data.returnTo}>‹ Back without adding</a></p>
	{/if}

	<section class="stack" aria-labelledby="grinders-heading">
		<h2 id="grinders-heading">Grinders</h2>

		{#if data.grinders.length === 0}
			<p class="card empty-state small">No grinders yet.</p>
		{:else}
			<ul class="list">
				{#each data.grinders as g (g.id)}
					{@const f = scoped(`grinder:${g.id}`)}
					{@const key = `grinder-${g.id}`}
					<li class="item" class:archived={g.archivedAt != null}>
						<div class="head">
							<span class="title">{g.name}</span>
							{#if g.archivedAt}<span class="chip badge">Archived</span>{/if}
						</div>
						<div class="small muted num">
							{g.settingUnit
								? `Setting in ${g.settingUnit}`
								: 'No setting unit'}&ensp;·&ensp;{plural(g.brewCount, 'brew', 'brews')}
						</div>
						<details open={hasErrors(f)}>
							<summary class="btn-toggle edit">Edit</summary>
							<div class="stack panel">
								<FormError form={f} />
								<form
									method="POST"
									action={act('updateGrinder')}
									class="stack"
									use:enhance={closeOnSuccess}
								>
									<input type="hidden" name="id" value={g.id} />
									<div class="row">
										<div class="field">
											<label for="{key}-name">Name</label>
											<input
												id="{key}-name"
												name="name"
												required
												maxlength="100"
												autocomplete="off"
												value={val(f, 'name', g.name)}
												aria-invalid={err(f, 'name') ? 'true' : undefined}
												aria-describedby={err(f, 'name') ? `${key}-name-error` : undefined}
											/>
											<FieldError id="{key}-name-error" message={err(f, 'name')} />
										</div>
										<div class="field">
											<label for="{key}-unit">Setting unit</label>
											<input
												id="{key}-unit"
												name="settingUnit"
												maxlength="30"
												autocomplete="off"
												value={val(f, 'settingUnit', g.settingUnit)}
												aria-invalid={err(f, 'settingUnit') ? 'true' : undefined}
												placeholder="e.g. clicks"
												aria-describedby={err(f, 'settingUnit') ? `${key}-unit-error` : undefined}
											/>
											<FieldError id="{key}-unit-error" message={err(f, 'settingUnit')} />
										</div>
									</div>
									<div><button class="btn btn-primary btn-sm">Save</button></div>
								</form>
								<div class="actions">
									<form method="POST" action={act('archiveGrinder')} use:enhance={closeOnSuccess}>
										<input type="hidden" name="id" value={g.id} />
										<input type="hidden" name="archived" value={g.archivedAt ? '0' : '1'} />
										<button class="btn btn-sm">{g.archivedAt ? 'Unarchive' : 'Archive'}</button>
									</form>
									<form
										method="POST"
										action={act('deleteGrinder')}
										onsubmit={confirmDelete(g.name)}
									>
										<input type="hidden" name="id" value={g.id} />
										<button class="btn btn-sm btn-danger">Delete</button>
									</form>
								</div>
								{#if g.brewCount > 0}
									<p class="hint">Has brews, so it can only be archived.</p>
								{/if}
							</div>
						</details>
					</li>
				{/each}
			</ul>
		{/if}

		<form method="POST" action={act('createGrinder')} class="card stack" use:enhance>
			<h3>Add grinder</h3>
			<FormError form={newGrinder} />
			<div class="row">
				<div class="field">
					<label for="new-grinder-name">Name</label>
					<input
						id="new-grinder-name"
						name="name"
						required
						maxlength="100"
						autocomplete="off"
						placeholder="e.g. Comandante C40"
						value={val(newGrinder, 'name')}
						aria-invalid={err(newGrinder, 'name') ? 'true' : undefined}
						aria-describedby={err(newGrinder, 'name') ? 'new-grinder-name-error' : undefined}
					/>
					<FieldError id="new-grinder-name-error" message={err(newGrinder, 'name')} />
				</div>
				<div class="field">
					<label for="new-grinder-unit">Setting unit</label>
					<input
						id="new-grinder-unit"
						name="settingUnit"
						maxlength="30"
						autocomplete="off"
						value={val(newGrinder, 'settingUnit')}
						aria-invalid={err(newGrinder, 'settingUnit') ? 'true' : undefined}
						placeholder="e.g. clicks"
						aria-describedby={err(newGrinder, 'settingUnit') ? 'new-grinder-unit-error' : undefined}
					/>
					<FieldError id="new-grinder-unit-error" message={err(newGrinder, 'settingUnit')} />
				</div>
			</div>
			{#if grinderAdded}<p class="small ok" role="status">Grinder added.</p>{/if}
			<div><button class="btn btn-primary">Add grinder</button></div>
		</form>
	</section>

	<section class="stack" aria-labelledby="drippers-heading">
		<h2 id="drippers-heading">Drippers</h2>

		{#if data.drippers.length === 0}
			<p class="card empty-state small">No drippers yet.</p>
		{:else}
			<ul class="list">
				{#each data.drippers as d (d.id)}
					{@const f = scoped(`dripper:${d.id}`)}
					{@const key = `dripper-${d.id}`}
					{@const material = val(f, 'material', d.material)}
					<li class="item" class:archived={d.archivedAt != null}>
						<div class="head">
							<span class="title">{d.name}</span>
							{#if d.archivedAt}<span class="chip badge">Archived</span>{/if}
						</div>
						<div class="small muted num">
							{d.material ? label(d.material) : 'Material not recorded'}&ensp;·&ensp;{plural(
								d.brewCount,
								'brew',
								'brews'
							)}
						</div>
						<details open={hasErrors(f)}>
							<summary class="btn-toggle edit">Edit</summary>
							<div class="stack panel">
								<FormError form={f} />
								<form
									method="POST"
									action={act('updateDripper')}
									class="stack"
									use:enhance={closeOnSuccess}
								>
									<input type="hidden" name="id" value={d.id} />
									<div class="row">
										<div class="field">
											<label for="{key}-name">Name</label>
											<input
												id="{key}-name"
												name="name"
												required
												maxlength="100"
												autocomplete="off"
												value={val(f, 'name', d.name)}
												aria-invalid={err(f, 'name') ? 'true' : undefined}
												aria-describedby={err(f, 'name') ? `${key}-name-error` : undefined}
											/>
											<FieldError id="{key}-name-error" message={err(f, 'name')} />
										</div>
										<div class="field">
											<label for="{key}-material">Material</label>
											<select
												id="{key}-material"
												name="material"
												aria-invalid={err(f, 'material') ? 'true' : undefined}
												aria-describedby={err(f, 'material') ? `${key}-material-error` : undefined}
											>
												<option value="" selected={material === ''}>Not recorded</option>
												{#each materials as m (m.value)}
													<option value={m.value} selected={material === m.value}>{m.label}</option>
												{/each}
											</select>
											<FieldError id="{key}-material-error" message={err(f, 'material')} />
										</div>
									</div>
									<div><button class="btn btn-primary btn-sm">Save</button></div>
								</form>
								<div class="actions">
									<form method="POST" action={act('archiveDripper')} use:enhance={closeOnSuccess}>
										<input type="hidden" name="id" value={d.id} />
										<input type="hidden" name="archived" value={d.archivedAt ? '0' : '1'} />
										<button class="btn btn-sm">{d.archivedAt ? 'Unarchive' : 'Archive'}</button>
									</form>
									<form
										method="POST"
										action={act('deleteDripper')}
										onsubmit={confirmDelete(d.name)}
									>
										<input type="hidden" name="id" value={d.id} />
										<button class="btn btn-sm btn-danger">Delete</button>
									</form>
								</div>
								{#if d.brewCount > 0}
									<p class="hint">Has brews, so it can only be archived.</p>
								{/if}
							</div>
						</details>
					</li>
				{/each}
			</ul>
		{/if}

		<form method="POST" action={act('createDripper')} class="card stack" use:enhance>
			<h3>Add dripper</h3>
			<FormError form={newDripper} />
			<div class="row">
				<div class="field">
					<label for="new-dripper-name">Name</label>
					<input
						id="new-dripper-name"
						name="name"
						required
						maxlength="100"
						autocomplete="off"
						placeholder="e.g. Hario V60 02"
						value={val(newDripper, 'name')}
						aria-invalid={err(newDripper, 'name') ? 'true' : undefined}
						aria-describedby={err(newDripper, 'name') ? 'new-dripper-name-error' : undefined}
					/>
					<FieldError id="new-dripper-name-error" message={err(newDripper, 'name')} />
				</div>
				<div class="field">
					<label for="new-dripper-material">Material</label>
					<select
						id="new-dripper-material"
						name="material"
						aria-invalid={err(newDripper, 'material') ? 'true' : undefined}
						aria-describedby={err(newDripper, 'material')
							? 'new-dripper-material-error'
							: undefined}
					>
						<option value="" selected={val(newDripper, 'material') === ''}>Not recorded</option>
						{#each materials as m (m.value)}
							<option value={m.value} selected={val(newDripper, 'material') === m.value}
								>{m.label}</option
							>
						{/each}
					</select>
					<FieldError id="new-dripper-material-error" message={err(newDripper, 'material')} />
				</div>
			</div>
			{#if dripperAdded}<p class="small ok" role="status">Dripper added.</p>{/if}
			<div><button class="btn btn-primary">Add dripper</button></div>
		</form>
	</section>

	<section class="stack" aria-labelledby="roasters-heading">
		<h2 id="roasters-heading">Roasters</h2>
		{#if data.roasters.length === 0}
			<p class="card empty-state small">
				No roasters yet. <a href="/beans/new">Add a bean</a> to add one.
			</p>
		{:else}
			<p class="hint">New roasters come from the bean form.</p>
			<ul class="list">
				{#each data.roasters as r (r.id)}
					{@const f = scoped(`roaster:${r.id}`)}
					{@const key = `roaster-${r.id}`}
					<li class="item" class:archived={r.archivedAt != null}>
						<div class="head">
							<span class="title">{r.name}</span>
							{#if r.archivedAt}<span class="chip badge">Archived</span>{/if}
						</div>
						<div class="small muted num">
							{#if isWebLink(r.website)}
								<a href={r.website} target="_blank" rel="noopener noreferrer external"
									>{host(r.website)}</a
								>&ensp;·&ensp;
							{/if}{plural(r.beanCount, 'bean', 'beans')}
						</div>
						<details open={hasErrors(f)}>
							<summary class="btn-toggle edit">Edit</summary>
							<div class="stack panel">
								<FormError form={f} />
								<form
									method="POST"
									action={act('updateRoaster')}
									class="stack"
									use:enhance={closeOnSuccess}
								>
									<input type="hidden" name="id" value={r.id} />
									<div class="row">
										<div class="field">
											<label for="{key}-name">Name</label>
											<input
												id="{key}-name"
												name="name"
												required
												maxlength="100"
												autocomplete="off"
												value={val(f, 'name', r.name)}
												aria-invalid={err(f, 'name') ? 'true' : undefined}
												aria-describedby={err(f, 'name') ? `${key}-name-error` : undefined}
											/>
											<FieldError id="{key}-name-error" message={err(f, 'name')} />
										</div>
										<div class="field">
											<label for="{key}-website">Website</label>
											<input
												id="{key}-website"
												name="website"
												type="url"
												inputmode="url"
												maxlength="300"
												autocomplete="off"
												placeholder="https://…"
												value={val(f, 'website', r.website)}
												aria-invalid={err(f, 'website') ? 'true' : undefined}
												aria-describedby={err(f, 'website') ? `${key}-website-error` : undefined}
											/>
											<FieldError id="{key}-website-error" message={err(f, 'website')} />
										</div>
									</div>
									<div><button class="btn btn-primary btn-sm">Save</button></div>
								</form>
								<div class="actions">
									<form method="POST" action={act('archiveRoaster')} use:enhance={closeOnSuccess}>
										<input type="hidden" name="id" value={r.id} />
										<input type="hidden" name="archived" value={r.archivedAt ? '0' : '1'} />
										<button class="btn btn-sm">{r.archivedAt ? 'Unarchive' : 'Archive'}</button>
									</form>
									<form
										method="POST"
										action={act('deleteRoaster')}
										onsubmit={confirmDelete(r.name)}
									>
										<input type="hidden" name="id" value={r.id} />
										<button class="btn btn-sm btn-danger">Delete</button>
									</form>
								</div>
								{#if r.beanCount > 0}
									<p class="hint">Has beans, so it can only be archived.</p>
								{/if}
							</div>
						</details>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.item {
		padding: 0.75rem 1rem 0.25rem;
		overflow-wrap: anywhere;
	}
	.item.archived {
		background: var(--surface-2);
	}
	.item.archived .title {
		color: var(--muted);
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.5rem;
	}
	.title {
		font-family: var(--display);
	}
	.badge {
		font-size: 0.75rem;
		background: var(--bg);
		color: var(--muted);
	}
	summary {
		font-size: 0.875rem;
		color: var(--accent-ink);
		width: fit-content;
	}
	.panel {
		padding: 0.75rem 0;
	}
	.back {
		margin: 0;
	}
	.tap {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	h3 {
		margin: 0;
	}
	.ok {
		color: var(--ok);
		margin: 0;
	}
</style>
