<script lang="ts">
	/**
	 * Pour entry (D12, D26, D27): one row per pour, named from 0, with the timer reading when it starts,
	 * the scale reading after it and a bloom tick box. Pour 0's start is fixed at 0:00. On a new brew the
	 * previous brew's readings are placeholders, and a blank cell saves its placeholder; a time with no
	 * previous reading is estimated from the pours above, and a blank time saves that estimate too.
	 *
	 * Posts per row, in order: `pourRow` (a stable id), `pourTime`, `pourScale`, `pourTimeDefault`,
	 * `pourScaleDefault`, plus `pourBloom` = the row id when ticked. Blank rows are ignored by the
	 * server, so without JavaScript the trailing spare row is the "add pour" and a "drop" box (posting
	 * `pourDrop` = the row id) removes a placeholder row; with it, the spare rows go and add / remove
	 * buttons appear.
	 *
	 * When the previous brew planned a new ratio or pour count (D25), the reshaped pours are suggested:
	 * a green "› x" button inside each scale box (tap to use it) and on the total, pours to drop in red,
	 * pours to add in green, and Accept makes the suggestion the new placeholders.
	 *
	 * On a new brew, tap to pour (D53) can time the pours: each tap writes the pour's start into its row,
	 * adding rows as needed, and Undo puts back what was there.
	 */
	import { onMount, tick } from 'svelte';
	import FieldError from '#lib/components/FieldError.svelte';
	import { suggestPours } from '#lib/domain/plan.ts';
	import TapPanel from './TapPanel.svelte';
	import type { TapPhase } from './tap-log.ts';
	import { formatDuration, parseDuration, poursToEntries } from '#lib/domain/pours.ts';
	import type { MeasuredPour } from '#lib/scale/brew-guide.ts';
	import { ratioText } from '#lib/ui/format.ts';
	import type { BrewSuggestions } from './brew-values.ts';
	import { focusNextField } from './enter-nav.ts';
	import {
		FIRST_POUR_TIME,
		applyMeasuredPours,
		blankRow,
		effectiveScale,
		errorRowIndex,
		isBlank,
		parseGrams,
		pourTargets,
		rowLabel,
		summarizePours,
		trimSpareRows,
		withSpareRows,
		type PourRow,
		type PourStats,
		type PourTarget
	} from './pour-rows.ts';

	let {
		initial,
		dose,
		error,
		suggestion = null,
		stats = $bindable(),
		targets = $bindable(),
		tappable = false,
		locked = false,
		tapping = $bindable(false),
		ontotal
	}: {
		initial: readonly PourRow[];
		/** The dose that counts (typed, else its placeholder), for the ratio. */
		dose: string;
		error?: string;
		/** The previous brew's plan; only its ratio, pour count and pours are used here. */
		suggestion?: BrewSuggestions | null;
		/** Live totals, for the rest of the form (the next-time card). */
		stats?: PourStats;
		/** Live pour targets, for the scale card. */
		targets?: PourTarget[];
		/** Offer tap to pour (new brews). */
		tappable?: boolean;
		/** A scale is guiding the brew, so tap to pour steps aside. */
		locked?: boolean;
		/** Tap to pour is timing a brew. */
		tapping?: boolean;
		/** Tap to pour's total time, or null when its end was taken back. */
		ontotal?: (totalS: number | null) => void;
	} = $props();

	const uid = $props.id();
	type Row = PourRow & { key: number };
	let nextKey = 0;
	const keyed = (r: PourRow): Row => ({ ...r, key: nextKey++ });

	// Seeded once; after that the inputs own the rows (a failed submit re-sends what was typed).
	// svelte-ignore state_referenced_locally
	let rows = $state<Row[]>(withSpareRows(initial, 1, 3).map(keyed));
	// The add / remove / accept buttons only work with JavaScript, so they appear once it runs.
	let hydrated = $state(false);
	onMount(() => {
		// "+ Add pour" replaces the spare rows; a first-ever brew keeps three rows to start from.
		rows = trimSpareRows(rows, rows.some((r, i) => !isBlank(r, i)) ? 1 : 3);
		hydrated = true;
	});

	/** Each row's placeholder time from the previous brew, without the estimates (which recalculate). */
	export function timeDefaults(): string[] {
		return rows.map((r) => r.defaultTime);
	}

	/** Writes in what a scale measured, keeping the plan each row followed (D51). */
	export function applyMeasured(measured: readonly MeasuredPour[]) {
		rows = applyMeasuredPours(rows, measured);
	}

	let list = $state<HTMLOListElement>();
	let addButton = $state<HTMLButtonElement>();
	let planBox = $state<HTMLDivElement>();

	const summary = $derived(summarizePours(rows, dose));
	const errorRow = $derived(errorRowIndex(rows, error));
	const errorId = `${uid}-err`;

	$effect(() => {
		stats = { count: summary.count, totalG: summary.totalG, ratio: summary.ratio };
		targets = pourTargets(summary);
	});

	// --- the plan's suggestion ------------------------------------------------------------------

	const proposal = $derived.by(() => {
		if (!suggestion || (!suggestion.ratio && !suggestion.pourCount)) return null;
		return suggestPours(suggestion.pours, parseGrams(dose), {
			ratio: suggestion.ratio?.to ?? null,
			pourCount: suggestion.pourCount?.to ?? null
		});
	});
	/** Suggested start (s) and running total (g) of each pour. */
	const proposed = $derived(proposal ? poursToEntries(proposal.pours) : []);
	/**
	 * The suggestion last accepted. It stays accepted while the suggestion is the same; a new dose
	 * reshapes it, and Accept is offered again.
	 */
	let acceptedKey = $state<string | null>(null);
	const proposalKey = $derived(JSON.stringify(proposed));
	const accepted = $derived(acceptedKey !== null && acceptedKey === proposalKey);
	/** The rows already are the suggestion (typed in, or accepted). */
	const matches = $derived(
		proposal != null &&
			summary.count === proposed.length &&
			proposed.every(
				(e, i) =>
					summary.rows[i]?.scaleG === e.cumulativeG &&
					summary.rows[i]?.startS === e.startS &&
					rows[i]?.bloom === e.bloom
			)
	);
	const showProposal = $derived(proposal != null && !matches && !accepted);
	/** Planned ratio, also shown when the pours can't be reshaped to it. */
	const ratioTarget = $derived(
		suggestion?.ratio && !matches && summary.ratio !== suggestion.ratio.to
			? suggestion.ratio.to
			: null
	);
	/** Rows that are pours; before JavaScript runs the trailing spare rows don't count. */
	const shownRows = $derived(hydrated ? rows.length : trimSpareRows(rows).length);
	const ghosts = $derived(showProposal ? proposed.slice(shownRows) : []);

	function suggestedScale(i: number): number | null {
		if (!showProposal || i >= proposed.length || i >= shownRows) return null;
		const target = proposed[i].cumulativeG;
		return summary.rows[i]?.scaleG === target ? null : target;
	}
	const dropped = (i: number) => showProposal && i >= proposed.length && !isBlank(rows[i], i);

	const planText = $derived.by(() => {
		if (!suggestion) return '';
		const parts: string[] = [];
		const p = suggestion.pourCount;
		if (p && p.to !== p.from) parts.push(`${p.to} pours instead of ${p.from}`);
		const r = suggestion.ratio;
		if (r) parts.push(`ratio ${ratioText(r.from)} › ${ratioText(r.to)}`);
		return parts.join(', ');
	});

	/**
	 * Makes the suggested pours the new placeholders, so typing what you see still replaces them.
	 * Readings already typed stay; pours beyond the suggestion go.
	 */
	async function accept() {
		rows = proposed.map((e, i) => {
			const typed = rows[i] ?? null;
			return keyed({
				...blankRow(e.bloom),
				time: typed?.time ?? '',
				scale: typed?.scale ?? '',
				defaultTime: i === 0 ? '' : formatDuration(e.startS),
				defaultScale: String(e.cumulativeG)
			});
		});
		acceptedKey = proposalKey;
		// The button is gone: keep focus on the note that says what happened (no keyboard pop-up).
		await tick();
		planBox?.focus();
	}

	// --- tap to pour (D53) -------------------------------------------------------------------------

	let tapPhase = $state<TapPhase>('idle');
	type Plan = Pick<PourRow, 'plannedG' | 'plannedStart'>;
	/** What each tap replaced and wrote, so Undo can put it back. */
	let tapped: { key: number; previous: string; written: string; added: boolean; plan: Plan }[] = [];
	/** Pour 0's plan before Start. */
	let startPlan: Plan = {};

	const tapOn = $derived(hydrated && tappable && !locked);
	/** Rows stay put while taps are landing in them: no removing or reshaping. */
	const rowsFixed = $derived(tapOn && tapPhase === 'running');
	$effect(() => {
		tapping = rowsFixed;
	});

	/**
	 * Keeps what the row planned beside what happens (D51), so the next brew starts from the plan and
	 * the recipe doesn't drift by a second or a gram each brew. Planned means typed beforehand or the
	 * previous brew's reading, not an estimate. Returns what was there, for Undo.
	 */
	function keepPlan(row: Row, i: number): Plan {
		const before = { plannedG: row.plannedG, plannedStart: row.plannedStart };
		const g = parseGrams(effectiveScale(row));
		const s = i === 0 ? 0 : parseDuration(row.time.trim() || row.defaultTime);
		if (row.plannedG === undefined && g !== null && g > 0) row.plannedG = String(g);
		if (row.plannedStart === undefined && s !== null) row.plannedStart = String(s);
		return before;
	}

	function restorePlan(row: Row, plan: Plan) {
		row.plannedG = plan.plannedG;
		row.plannedStart = plan.plannedStart;
	}

	function onTapStart() {
		tapped = [];
		startPlan = keepPlan(rows[0], 0);
	}

	function onTapUnstart() {
		restorePlan(rows[0], startPlan);
	}

	function onTapPour(index: number, startS: number) {
		// Rows can't be removed mid-brew, so the tapped pour is at most one row past the end.
		const added = rows.length <= index;
		if (added) rows.push(keyed(blankRow()));
		const i = Math.min(index, rows.length - 1);
		const row = rows[i];
		const plan = keepPlan(row, i);
		const written = formatDuration(startS);
		tapped.push({ key: row.key, previous: row.time, written, added, plan });
		row.time = written;
	}

	function onTapUndo() {
		const last = tapped.pop();
		if (!last) return;
		const i = rows.findIndex((r) => r.key === last.key);
		if (i < 0) return;
		const row = rows[i];
		// A time retyped since the tap is the brewer's: leave it.
		if (row.time !== last.written) return;
		restorePlan(row, last.plan);
		if (last.added && row.scale.trim() === '' && !row.bloom && i === rows.length - 1) {
			rows.splice(i, 1);
		} else {
			row.time = last.previous;
		}
	}

	const tapTargets = $derived(summary.rows.map((r) => r.scaleG));
	const tapStarts = $derived(
		rows.map((r, i) => (i === 0 ? 0 : parseDuration(r.time.trim() || r.defaultTime)))
	);

	// --- rows -----------------------------------------------------------------------------------

	function inputs(): HTMLInputElement[] {
		return [
			...(list?.querySelectorAll<HTMLInputElement>('input[type="text"], input[inputmode]') ?? [])
		];
	}

	async function add() {
		const last = rows.length - 1;
		if (last < 1 || !isBlank(rows[last], last)) rows.push(keyed(blankRow()));
		await tick();
		list?.querySelector<HTMLInputElement>('li:last-child input[name="pourTime"]')?.focus();
	}

	function remove(index: number) {
		rows.splice(index, 1);
		addButton?.focus();
	}

	/** Enter moves to the next box instead of submitting the whole form mid-brew. */
	async function onEnter(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		const all = inputs();
		const current = e.currentTarget as HTMLInputElement;
		const next = all[all.indexOf(current) + 1];
		const last = rows.length - 1;
		if (next) next.focus();
		// Enter on an empty last row means "done pouring": move on to the next section.
		else if (last >= 1 && isBlank(rows[last], last)) focusNextField(current);
		else await add();
	}

	/** Shows how a typed time was read ("130" is 130 s, i.e. 2:10), so a slip is visible at once. */
	function normalizeTime(row: Row) {
		const s = parseDuration(row.time);
		if (s !== null) row.time = formatDuration(s);
	}

	function useTarget(row: Row, target: number) {
		row.scale = String(target);
	}

	function amount(added: number | null): string {
		if (added === null) return '';
		return `${added > 0 ? '+' : ''}${added} g`;
	}
</script>

<fieldset class="pours" aria-describedby={error ? errorId : undefined}>
	<legend>Pours</legend>

	{#if planText && (showProposal || ratioTarget != null || accepted)}
		<div class="plan" role="status" tabindex="-1" bind:this={planBox}>
			{#if accepted}
				<span>✓ Plan applied: {planText}</span>
			{:else}
				<span>Planned last time: {planText}</span>
				{#if hydrated && showProposal && !rowsFixed}
					<button type="button" class="btn btn-sm accept" onclick={accept}>Accept</button>
				{/if}
			{/if}
		</div>
	{/if}

	{#if tapOn}
		<TapPanel
			targets={tapTargets}
			plannedStarts={tapStarts}
			onphase={(p) => (tapPhase = p)}
			onstart={onTapStart}
			onunstart={onTapUnstart}
			onpour={onTapPour}
			onunpour={onTapUndo}
			onend={(s) => ontotal?.(s)}
		/>
	{/if}

	<div class="grid head" aria-hidden="true">
		<span></span>
		<span>Starts at</span>
		<span>Scale reads (g)</span>
		<span class="center">Bloom</span>
		<span></span>
	</div>

	<ol class="rows" bind:this={list}>
		{#each rows as row, i (row.key)}
			{@const info = summary.rows[i]}
			{@const invalid = errorRow === i ? 'true' : undefined}
			{@const describedBy = error ? errorId : undefined}
			{@const target = suggestedScale(i)}
			{@const targetId = `${uid}-sugg-${row.key}`}
			{@const id = `r${row.key}`}
			<li class="grid" class:drop={dropped(i)}>
				<input type="hidden" name="pourRow" value={id} />
				<div class="name" class:problem={info.problem}>
					<span class="row-label">{info.label}</span>
					<span class="added num"
						>{info.problem && info.added === null ? 'check' : amount(info.added)}</span
					>
				</div>

				{#if i === 0}
					<input type="hidden" name="pourTime" value={FIRST_POUR_TIME} />
					<span class="fixed num" title="The first pour starts the brew">0:00</span>
				{:else}
					<label class="visually-hidden" for="{uid}-t{row.key}">{info.label} starts at</label>
					<input
						id="{uid}-t{row.key}"
						name="pourTime"
						type="text"
						inputmode="numeric"
						autocomplete="off"
						enterkeyhint="next"
						class="num"
						placeholder={info.timePlaceholder}
						bind:value={row.time}
						onblur={() => normalizeTime(row)}
						onkeydown={onEnter}
						aria-invalid={invalid}
						aria-describedby={describedBy}
					/>
				{/if}
				<!-- The placeholder shown, previous brew's or estimated: a blank time saves it. -->
				<input type="hidden" name="pourTimeDefault" value={i === 0 ? '' : info.timePlaceholder} />

				<div class="scale">
					<label class="visually-hidden" for="{uid}-s{row.key}"
						>{info.label} scale reading (g)</label
					>
					<div class="affix">
						<input
							id="{uid}-s{row.key}"
							name="pourScale"
							type="text"
							inputmode="decimal"
							autocomplete="off"
							enterkeyhint="next"
							class="num"
							placeholder={row.defaultScale}
							bind:value={row.scale}
							onkeydown={onEnter}
							aria-invalid={invalid}
							aria-describedby={[describedBy, target != null && !hydrated ? targetId : '']
								.filter(Boolean)
								.join(' ') || undefined}
						/>
						{#if target != null}
							{#if hydrated}
								<button
									type="button"
									class="suggest"
									aria-label="Use {target} g for {info.label.toLowerCase()}, as planned last time"
									onclick={() => useTarget(row, target)}>› {target}</button
								>
							{:else}
								<span class="suggest" id={targetId} title="Planned last time"
									><span class="visually-hidden">Planned: </span>› {target}</span
								>
							{/if}
						{/if}
					</div>
				</div>
				<input type="hidden" name="pourScaleDefault" value={row.defaultScale} />
				<input type="hidden" name="pourPlannedG" value={row.plannedG ?? ''} />
				<input type="hidden" name="pourPlannedStart" value={row.plannedStart ?? ''} />
				<input type="hidden" name="pourDuration" value={row.duration ?? ''} />

				<label class="bloom" title="Bloom">
					<input type="checkbox" name="pourBloom" value={id} bind:checked={row.bloom} />
					<span class="visually-hidden">{info.label} is a bloom</span>
				</label>

				{#if hydrated && i > 0 && !rowsFixed}
					<button
						type="button"
						class="remove"
						aria-label="Remove {info.label.toLowerCase()}"
						onclick={() => remove(i)}>×</button
					>
				{:else if !hydrated && i > 0 && row.defaultScale}
					<!-- Without JavaScript a placeholder row would be saved even when left blank. -->
					<label class="drop-box" title="Leave this pour out">
						<input type="checkbox" name="pourDrop" value={id} />
						<span aria-hidden="true">×</span>
						<span class="visually-hidden">Leave out {info.label.toLowerCase()}</span>
					</label>
				{:else}
					<span></span>
				{/if}
			</li>
		{/each}
		{#each ghosts as g, j (j)}
			<li class="grid ghost" aria-label="Suggested {rowLabel(shownRows + j).toLowerCase()}">
				<div class="name">
					<span class="row-label">{rowLabel(shownRows + j)}</span>
					<span class="added">new</span>
				</div>
				<span class="fixed num">{formatDuration(g.startS)}</span>
				<span class="fixed num">{g.cumulativeG}</span>
				<span></span>
				<span></span>
			</li>
		{/each}
	</ol>

	<FieldError id={errorId} message={error} />

	<div class="foot">
		{#if hydrated}
			<button type="button" class="btn btn-sm" bind:this={addButton} onclick={add}
				>+ Add pour</button
			>
		{/if}
		<p class="totals num" aria-live="polite">
			<span
				>Water <strong>{summary.totalG === null ? '—' : `${summary.totalG} g`}</strong
				>{#if showProposal && proposal && proposal.totalG !== summary.totalG}
					<span class="suggest">› {proposal.totalG} g</span>{/if}</span
			>
			<span
				>Ratio <strong>{ratioText(summary.ratio)}</strong>{#if ratioTarget != null}
					<span class="suggest">› {ratioText(ratioTarget)}</span>{/if}</span
			>
		</p>
	</div>
</fieldset>

<style>
	.pours {
		padding: 0.75rem;
	}
	.plan {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.75rem;
		margin: 0 0 0.75rem;
		padding: 0.5rem 0.65rem;
		border-radius: var(--radius-sm);
		background: var(--plan-soft);
		color: var(--plan);
		font-size: 0.875rem;
		font-weight: 600;
	}
	.plan > span:first-child {
		flex: 1 1 12rem;
	}
	.accept {
		border-color: var(--plan);
		color: var(--plan);
		background: var(--surface);
	}
	.grid {
		display: grid;
		/* The scale box is wider: it may hold a "› 119" button beside the reading. */
		grid-template-columns: 3.3rem minmax(0, 0.85fr) minmax(0, 1.3fr) 2.2rem 2rem;
		gap: 0.3rem;
		align-items: center;
	}
	.head {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--muted);
		margin-bottom: 0.25rem;
	}
	.center {
		text-align: center;
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.rows > li {
		border-radius: var(--radius-sm);
	}
	/* Pours the plan drops (red) or adds (green) until it is accepted. */
	.drop {
		background: var(--danger-soft);
		box-shadow: 0 0 0 3px var(--danger-soft);
	}
	.drop .row-label {
		color: var(--danger);
	}
	.ghost {
		background: var(--ok-soft);
		box-shadow: 0 0 0 3px var(--ok-soft);
		color: var(--ok);
	}
	.ghost .fixed {
		border-color: color-mix(in srgb, var(--ok) 45%, transparent);
		color: var(--ok);
	}
	.ghost .added {
		color: var(--ok);
	}
	.name {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
		min-width: 0;
	}
	.row-label {
		font-size: 0.85rem;
		font-weight: 600;
		white-space: nowrap;
	}
	.added {
		font-size: 0.8rem;
		color: var(--muted);
		min-height: 1em;
	}
	.problem .added,
	.problem .row-label {
		color: var(--danger);
	}
	.grid input:not([type='checkbox']) {
		padding-inline: 0.5rem;
	}
	.fixed {
		display: flex;
		align-items: center;
		min-height: 44px;
		padding: 0 0.5rem;
		border: 1px dashed var(--border);
		border-radius: var(--radius-sm);
		color: var(--muted);
	}
	.scale {
		min-width: 0;
	}
	.grid .affix input {
		padding-inline: 0.4rem;
	}
	.bloom {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		cursor: pointer;
	}
	.bloom input {
		width: 1.3rem;
		height: 1.3rem;
	}
	.remove {
		width: 2.2rem;
		height: 44px;
		border: 0;
		background: none;
		color: var(--muted);
		font-size: 1.4rem;
		line-height: 1;
		cursor: pointer;
		border-radius: var(--radius-sm);
	}
	.drop-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		font-size: 0.75rem;
		color: var(--muted);
		cursor: pointer;
	}
	.remove:hover {
		background: var(--surface-2);
		color: var(--danger);
	}
	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		margin-top: 0.75rem;
	}
	.totals {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.25rem 1rem;
		margin: 0 0 0 auto;
	}
	.totals .suggest {
		margin-left: 0.25rem;
	}
</style>
