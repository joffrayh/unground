<script lang="ts">
	/**
	 * Tasting-note tag picker (D5, D29): type to search the vocabulary, pick a match to add it as a
	 * chip. Tags can be any tier ("Fruity", "Berry" or "Blueberry").
	 *
	 * Without JavaScript the full tree under "Browse all notes" is real checkboxes and is the form
	 * input. Once JavaScript runs, the chips post as hidden inputs and the tree's boxes just toggle them.
	 * Enter never submits the form: it picks the highlighted match, or moves on when nothing is listed.
	 */
	import { onMount, tick } from 'svelte';
	import {
		FLAVOR_BY_ID,
		childrenOf,
		flavorPath,
		searchFlavors,
		type Flavor
	} from '#lib/domain/flavors.ts';
	import { focusNextField } from '#lib/components/brews/enter-nav.ts';

	let {
		name,
		selected = [],
		label = 'Tasting notes',
		hint
	}: { name: string; selected?: readonly string[]; label?: string; hint?: string } = $props();

	const uid = $props.id();
	const listId = `${uid}-list`;
	const optionId = (i: number) => `${uid}-opt-${i}`;

	// Seeded once from the prop; the picker owns the state after that.
	// svelte-ignore state_referenced_locally
	let chosen = $state<string[]>([...selected]);
	let query = $state('');
	let open = $state(false);
	let active = $state(0);
	let input = $state<HTMLInputElement>();
	let list = $state<HTMLUListElement>();

	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});

	const matches = $derived(searchFlavors(query, { exclude: chosen }));
	const showList = $derived(open && matches.length > 0);
	// The highlighted match; picks in the tree can shorten the list under it.
	const current = $derived(Math.max(0, Math.min(active, matches.length - 1)));
	// On a phone the list opens below the box, often under the tab bar or keyboard: bring it into view.
	$effect(() => {
		if (showList) list?.scrollIntoView({ block: 'nearest' });
	});
	const noMatch = $derived(open && query.trim() !== '' && matches.length === 0);
	const roots = childrenOf(null);

	const nameOf = (id: string) => FLAVOR_BY_ID.get(id)?.name ?? id;
	/** "Citrus Fruit" for Bergamot: where a note sits, to tell similar names apart. */
	const parentName = (f: Flavor) => (f.parentId ? nameOf(f.parentId) : '');

	function add(id: string) {
		if (!chosen.includes(id)) chosen = [...chosen, id];
		query = '';
		active = 0;
		input?.focus();
	}

	/** `refocus`: back to the box for keyboard users; a tap shouldn't pop up the keyboard. */
	async function remove(id: string, refocus = true) {
		chosen = chosen.filter((c) => c !== id);
		if (!refocus) return;
		await tick();
		input?.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				open = true;
				if (matches.length) active = (current + 1) % matches.length;
				break;
			case 'ArrowUp':
				e.preventDefault();
				if (matches.length) active = (current - 1 + matches.length) % matches.length;
				break;
			case 'Enter':
				e.preventDefault();
				if (showList) add(matches[current].id);
				else if (input) focusNextField(input);
				break;
			case 'Escape':
				if (open && query) {
					e.preventDefault();
					query = '';
				}
				break;
			case 'Backspace':
				if (query === '' && chosen.length) remove(chosen[chosen.length - 1]);
				break;
		}
	}

	/** Closes the list once focus leaves the picker. */
	function onFocusOut(e: FocusEvent) {
		const to = e.relatedTarget as Node | null;
		if (!to || !(e.currentTarget as HTMLElement).contains(to)) open = false;
	}

	function countIn(root: Flavor): number {
		return chosen.filter((id) => id === root.id || id.startsWith(root.id + '.')).length;
	}
</script>

<div class="tag-picker" role="group" aria-labelledby="{uid}-label" onfocusout={onFocusOut}>
	<div class="head">
		<span class="label" id="{uid}-label">{label}</span>
		{#if hint}<span class="hint">{hint}</span>{/if}
	</div>

	{#if hydrated}
		{#each chosen as id (id)}
			<input type="hidden" {name} value={id} />
		{/each}
		{#if chosen.length > 0}
			<ul class="chips selected" aria-label="Picked notes">
				{#each chosen as id (id)}
					<li>
						<button
							type="button"
							class="chip"
							title={flavorPath(id).join(' › ')}
							aria-label="Remove {nameOf(id)}"
							onclick={(e) => remove(id, e.detail === 0)}
						>
							{nameOf(id)} <span aria-hidden="true">×</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="combo">
			<input
				bind:this={input}
				type="text"
				role="combobox"
				class="search"
				placeholder="Add a note, e.g. berry"
				autocomplete="off"
				autocapitalize="none"
				spellcheck="false"
				enterkeyhint="done"
				aria-label="Add {label.toLowerCase()}"
				aria-autocomplete="list"
				aria-expanded={showList}
				aria-controls={listId}
				aria-activedescendant={showList ? optionId(current) : undefined}
				bind:value={query}
				oninput={() => {
					open = true;
					active = 0;
				}}
				onfocus={() => (open = true)}
				onkeydown={onKeydown}
			/>
			<!-- Options take taps, not focus, so the keyboard stays up for the next note. -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<ul
				class="options"
				id={listId}
				role="listbox"
				aria-label={label}
				hidden={!showList}
				bind:this={list}
			>
				{#each matches as f, i (f.id)}
					<li
						id={optionId(i)}
						role="option"
						aria-selected={i === current}
						class:active={i === current}
						onpointerdown={(e) => e.preventDefault()}
						onmousedown={(e) => e.preventDefault()}
						onclick={() => add(f.id)}
					>
						<span class="name">{f.name}</span>
						{#if f.parentId}<span class="path">{parentName(f)}</span>{/if}
					</li>
				{/each}
			</ul>
			{#if noMatch}
				<p class="hint none" role="status">No note matches “{query.trim()}”.</p>
			{/if}
		</div>
	{:else if selected.length > 0}
		<!-- Before JavaScript: what's picked, at the size the chips will be, so nothing jumps. -->
		<ul class="chips selected" aria-label="Picked notes">
			{#each selected as id (id)}
				<li><span class="chip static" title={flavorPath(id).join(' › ')}>{nameOf(id)}</span></li>
			{/each}
		</ul>
	{/if}

	<details class="browse">
		<summary>Browse all notes</summary>
		<div class="tree">
			{#each roots as root (root.id)}
				<details open={selected.some((id) => id === root.id || id.startsWith(root.id + '.'))}>
					<summary>
						{root.name}
						{#if countIn(root) > 0}<span class="count">{countIn(root)}</span>{/if}
					</summary>
					<div class="branch">
						<label class="pill">
							<input
								type="checkbox"
								name={hydrated ? undefined : name}
								value={root.id}
								bind:group={chosen}
							/>
							<span>{root.name} (general)</span>
						</label>
						{#each childrenOf(root.id) as mid (mid.id)}
							<div class="group">
								<label class="pill">
									<input
										type="checkbox"
										name={hydrated ? undefined : name}
										value={mid.id}
										bind:group={chosen}
									/>
									<span>{mid.name}</span>
								</label>
								{#each childrenOf(mid.id) as leaf (leaf.id)}
									<label class="pill leaf">
										<input
											type="checkbox"
											name={hydrated ? undefined : name}
											value={leaf.id}
											bind:group={chosen}
										/>
										<span>{leaf.name}</span>
									</label>
								{/each}
							</div>
						{/each}
					</div>
				</details>
			{/each}
		</div>
	</details>
</div>

<style>
	.tag-picker {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.5rem;
		align-items: baseline;
	}
	.selected {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.chip {
		min-height: 36px;
		font-size: 0.875rem;
	}
	button.chip {
		position: relative;
		cursor: pointer;
		font: inherit;
		font-size: 0.875rem;
	}
	/* A 44px tap target without a taller chip. */
	button.chip::after {
		content: '';
		position: absolute;
		inset: -4px 0;
	}
	.combo {
		display: flex;
		flex-direction: column;
	}
	.options {
		list-style: none;
		margin: 0.25rem 0 0;
		padding: 0.25rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		box-shadow: var(--shadow);
		/* Clear of the fixed tab bar when scrolled into view. */
		scroll-margin-bottom: calc(var(--nav-clear) + 0.75rem);
	}
	.options[hidden] {
		display: none;
	}
	.options li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 44px;
		padding: 0.6rem 0.65rem;
		border-radius: var(--radius-sm);
		cursor: pointer;
		user-select: none;
	}
	.options li.active {
		background: var(--accent-soft);
	}
	.options .name {
		font-weight: 600;
	}
	.options .path {
		font-size: 0.8rem;
		color: var(--muted);
		text-align: right;
	}
	.none {
		margin: 0.35rem 0 0;
	}
	.browse > summary {
		font-size: 0.875rem;
		color: var(--accent-ink);
	}
	.tree {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0 0.75rem;
	}
	.tree details + details {
		border-top: 1px solid var(--border);
	}
	.count {
		background: var(--accent);
		color: var(--accent-text);
		border-radius: 999px;
		font-size: 0.75rem;
		padding: 0 0.45rem;
	}
	.branch {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-bottom: 0.75rem;
	}
	.group {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
	}
	.leaf span {
		font-size: 0.85rem;
		min-height: 36px;
	}
</style>
