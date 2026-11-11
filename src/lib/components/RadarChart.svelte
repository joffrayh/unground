<script lang="ts">
	/**
	 * The taste sub-scores (D22) as a radar: one axis per dimension, clockwise from the top, intensity
	 * 0.5 near the centre to 5 at the rim; the centre itself is "not rated". Read-only by default (SSR,
	 * no JavaScript needed). `editable` adds tap-to-set, draggable handles and a keyboard slider per
	 * axis; it reports changes through `onchange` and shows whatever `values` says (controlled). Touching
	 * an axis (its handle, its label, or a tap along it) reports it through `onselect`; `selected` lights
	 * that axis up. `ghost` is last time's profile, drawn in grey underneath to compare against (D53).
	 */
	import {
		DIMENSION_HINTS,
		RATING_DIMENSIONS,
		PROFILE_SCALE,
		label as vocabLabel
	} from '#lib/domain/vocab.ts';
	import type { RatingDimension } from '#lib/domain/vocab.ts';
	import {
		RINGS,
		keyValue,
		labelPlacement,
		nearestAxis,
		pointFor,
		polar,
		polygonPoints,
		valueAlongAxis,
		valueFromPoint,
		valueRadius,
		type RadarGeometry
	} from './radar.ts';

	let {
		values,
		editable = false,
		selected,
		onchange,
		onselect,
		label,
		ghost
	}: {
		values: Partial<Record<RatingDimension, number | null>>;
		ghost?: Partial<Record<RatingDimension, number | null>> | null;
		editable?: boolean;
		selected?: RatingDimension;
		onchange?: (dimension: RatingDimension, value: number | null) => void;
		onselect?: (dimension: RatingDimension) => void;
		label: string;
	} = $props();

	const uid = $props.id();

	// Geometry in viewBox units. The viewBox leaves just enough room for the widest side labels
	// ("Astringency" on the left, "Sweetness" on the right, hence off-centre), so nothing clips however
	// narrow the chart is drawn.
	const G: RadarGeometry = { radius: 90, inner: 19 };
	const LABEL_AT = G.radius + 10;
	const REACH = G.radius + 14;
	const N = RATING_DIMENSIONS.length;
	const VIEWBOX = '-170 -138 332 274';

	const current = $derived(RATING_DIMENSIONS.map((d) => normalize(values[d])));
	const anyRated = $derived(current.some((v) => v != null));
	const ghostValues = $derived(ghost ? RATING_DIMENSIONS.map((d) => normalize(ghost[d])) : null);

	const axes = RATING_DIMENSIONS.map((d, i) => {
		const place = labelPlacement(i, N, LABEL_AT);
		const name = vocabLabel(d);
		// Two lines: the name, then the value. Baselines depend on which side the label hangs off.
		const nameY =
			place.vertical === 'above'
				? place.y - 21
				: place.vertical === 'below'
					? place.y + 13
					: place.y - 1;
		const valueY = nameY + 17;
		// An approximate box for the focus ring (system-ui at 14px ≈ 7.6 units per character).
		const w = Math.max(name.length * 7.6, 22) + 12;
		const boxX =
			place.anchor === 'start'
				? place.x - 6
				: place.anchor === 'end'
					? place.x - w + 6
					: place.x - w / 2;
		return {
			d,
			i,
			name,
			hint: DIMENSION_HINTS[d],
			place,
			nameY,
			valueY,
			box: { x: boxX, y: nameY - 13, w, h: valueY - nameY + 18 },
			end: polar(i, N, G.radius),
			unratedAt: polar(i, N, G.inner / 2)
		};
	});

	const description = $derived(axes.map((a) => `${a.name} ${valueText(current[a.i])}`).join(', '));

	function normalize(v: number | null | undefined): number | null {
		return v == null || !Number.isFinite(v) ? null : v;
	}

	function valueText(v: number | null): string {
		return v == null ? 'not rated' : `${v} of ${PROFILE_SCALE.max}`;
	}

	// --- Editing ------------------------------------------------------------------------------------
	let svg = $state<SVGSVGElement>();
	let dragging = $state<number | null>(null);
	let tap: { id: number; x: number; y: number } | null = null;

	function set(axis: number, value: number | null) {
		if (current[axis] === value) return;
		onchange?.(RATING_DIMENSIONS[axis], value);
	}

	function select(axis: number) {
		onselect?.(RATING_DIMENSIONS[axis]);
	}

	/** Client (screen) coordinates → viewBox coordinates. */
	function toChart(e: PointerEvent): { x: number; y: number } | null {
		const ctm = svg?.getScreenCTM();
		if (!ctm) return null;
		const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
		return { x: p.x, y: p.y };
	}

	// A tap anywhere on the chart sets the nearest axis. Tracked as down + up without moving, so a
	// finger swiping across the chart just scrolls the page (the browser cancels the pointer).
	function onChartDown(e: PointerEvent) {
		if (e.button !== 0) return;
		tap = { id: e.pointerId, x: e.clientX, y: e.clientY };
	}
	function onChartUp(e: PointerEvent) {
		const t = tap;
		tap = null;
		if (!t || t.id !== e.pointerId || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) return;
		const p = toChart(e);
		if (!p) return;
		const hit = valueFromPoint(p.x, p.y, N, G, REACH);
		// Past the rim (a label, say) only selects the axis.
		select(hit?.axis ?? nearestAxis(p.x, p.y, N));
		if (hit) set(hit.axis, hit.value);
	}

	// Handles: drag along their own axis.
	function onHandleDown(e: PointerEvent, axis: number) {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();
		tap = null;
		dragging = axis;
		select(axis);
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		((e.currentTarget as Element).closest('[role="slider"]') as SVGGElement | null)?.focus({
			preventScroll: true
		});
	}
	function onHandleMove(e: PointerEvent, axis: number) {
		if (dragging !== axis) return;
		const p = toChart(e);
		if (p) set(axis, valueAlongAxis(p.x, p.y, axis, N, G));
	}
	function onHandleUp(e: PointerEvent) {
		e.stopPropagation();
		dragging = null;
	}

	function onKey(e: KeyboardEvent, axis: number) {
		const next = keyValue(e.key, current[axis]);
		if (next === undefined) return;
		e.preventDefault();
		select(axis);
		set(axis, next);
	}
</script>

<svg
	bind:this={svg}
	class="radar"
	class:editable
	viewBox={VIEWBOX}
	role={editable ? 'group' : 'img'}
	aria-label={editable ? label : undefined}
	aria-labelledby={editable ? undefined : `${uid}-title`}
	aria-describedby={editable ? undefined : `${uid}-desc`}
	onpointerdown={editable ? onChartDown : undefined}
	onpointerup={editable ? onChartUp : undefined}
	onpointercancel={editable ? () => (tap = null) : undefined}
>
	{#if !editable}
		<title id="{uid}-title">{label}</title>
		<desc id="{uid}-desc">{description}</desc>
	{/if}

	<g class="grid" aria-hidden="true">
		{#each RINGS as v (v)}
			<circle r={valueRadius(v, G)} />
		{/each}
		{#each axes as a (a.d)}
			<line x1="0" y1="0" x2={a.end.x} y2={a.end.y} />
		{/each}
	</g>

	{#if ghostValues?.some((v) => v != null)}
		<polygon class="ghost" points={polygonPoints(ghostValues, G)} aria-hidden="true" />
	{/if}

	{#if anyRated}
		<polygon class="shape" points={polygonPoints(current, G)} aria-hidden="true" />
	{/if}

	<g aria-hidden="true">
		{#each axes as a (a.d)}
			{@const v = current[a.i]}
			{#if v == null}
				{#if dragging !== a.i}
					<circle class="unrated" cx={a.unratedAt.x} cy={a.unratedAt.y} r="3" />
				{/if}
			{:else if !editable}
				{@const p = pointFor(a.i, v, N, G)}
				<circle class="dot" cx={p.x} cy={p.y} r="4.5" />
			{/if}
		{/each}
	</g>

	{#each axes as a (a.d)}
		{@const v = current[a.i]}
		{#snippet axisLabel()}
			<text
				class="name"
				class:unset={v == null}
				x={a.place.x}
				y={a.nameY}
				text-anchor={a.place.anchor}>{a.name}</text
			>
			<text
				class="value"
				class:unset={v == null}
				x={a.place.x}
				y={a.valueY}
				text-anchor={a.place.anchor}>{v ?? '–'}</text
			>
		{/snippet}
		{#if editable}
			{@const p = pointFor(a.i, v, N, G)}
			<g
				class="axis"
				class:selected={selected === a.d}
				role="slider"
				tabindex="0"
				aria-label="{a.name} intensity"
				aria-valuemin={0}
				aria-valuemax={PROFILE_SCALE.max}
				aria-valuenow={v ?? 0}
				aria-valuetext={valueText(v)}
				onkeydown={(e) => onKey(e, a.i)}
			>
				<line class="focus-spoke" x1="0" y1="0" x2={a.end.x} y2={a.end.y} />
				<rect class="focus-box" x={a.box.x} y={a.box.y} width={a.box.w} height={a.box.h} rx="6" />
				<g aria-hidden="true">{@render axisLabel()}</g>
				{#if v != null || dragging === a.i}
					<g
						class="handle"
						class:active={dragging === a.i}
						onpointerdown={(e) => onHandleDown(e, a.i)}
						onpointermove={(e) => onHandleMove(e, a.i)}
						onpointerup={onHandleUp}
						onpointercancel={onHandleUp}
						onlostpointercapture={() => {
							if (dragging === a.i) dragging = null;
						}}
						aria-hidden="true"
					>
						<circle class="hit" cx={p.x} cy={p.y} r="24" />
						<circle class="dot" class:hollow={v == null} cx={p.x} cy={p.y} r="6" />
					</g>
				{/if}
			</g>
		{:else}
			<g aria-hidden="true">{@render axisLabel()}</g>
		{/if}
	{/each}
</svg>

<style>
	.radar {
		display: block;
		width: 100%;
		max-width: 24rem;
		height: auto;
		margin: 0 auto;
		overflow: visible;
		font-family: var(--font);
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
	}
	.editable {
		cursor: pointer;
	}
	.grid circle {
		fill: none;
		stroke: var(--border);
		stroke-width: 1;
	}
	.grid line {
		stroke: var(--border);
		stroke-width: 1;
	}
	.shape {
		fill: var(--accent);
		fill-opacity: 0.16;
		stroke: var(--accent-ink);
		stroke-width: 2;
		stroke-linejoin: round;
	}
	.ghost {
		fill: var(--muted);
		fill-opacity: 0.12;
		stroke: var(--muted);
		stroke-width: 1.5;
		stroke-dasharray: 4 3;
		stroke-linejoin: round;
	}
	.dot {
		fill: var(--accent-ink);
		stroke: var(--surface);
		stroke-width: 2;
	}
	.dot.hollow {
		fill: var(--surface);
		stroke: var(--accent-ink);
	}
	.unrated {
		fill: var(--surface);
		stroke: var(--muted);
		stroke-width: 1.5;
	}
	text {
		fill: var(--text);
	}
	.name {
		font-size: 14px;
		font-weight: 500;
	}
	.value {
		font-size: 15px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	text.unset {
		fill: var(--muted);
		font-weight: 400;
	}

	/* Editable ---------------------------------------------------------------------------------- */
	.axis {
		outline: none;
	}
	.focus-spoke {
		stroke: var(--focus);
		stroke-width: 2;
		visibility: hidden;
	}
	.focus-box {
		fill: none;
		stroke: var(--focus);
		stroke-width: 2;
		visibility: hidden;
	}
	.axis:focus-visible .focus-spoke,
	.axis:focus-visible .focus-box,
	.axis.selected .focus-spoke {
		visibility: visible;
	}
	.axis.selected .name,
	.axis.selected .value {
		fill: var(--accent-ink);
		font-weight: 700;
	}
	.handle {
		cursor: grab;
		/* Only the handles take over touch gestures; elsewhere a swipe still scrolls the page. */
		touch-action: none;
	}
	.handle.active {
		cursor: grabbing;
	}
	.hit {
		fill: transparent;
	}
	.handle .dot {
		stroke-width: 2.5;
	}
	.handle .dot {
		transform-box: fill-box;
		transform-origin: center;
	}
	.handle.active .dot,
	.axis.selected .dot,
	.axis:focus-visible .dot {
		transform: scale(1.35);
	}
</style>
