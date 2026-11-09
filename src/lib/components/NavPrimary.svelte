<script lang="ts">
	/**
	 * The nav's centre button: Add Brew, which morphs into Save Brew on the brew form and stretches
	 * into a pill when the rest of the nav folds away (D38). Without JavaScript it renders in its
	 * resting state and still submits.
	 */
	import { cubicInOut } from 'svelte/easing';
	import { Spring, Tween, prefersReducedMotion } from 'svelte/motion';
	import { BREW_FORM_ID, getNavAction } from '#lib/ui/nav-action.svelte.ts';
	import { PILL_WIDTH, bodyPath, glyphPath } from '#lib/ui/nav-morph.ts';

	interface Props {
		href: string;
		saving: boolean;
		collapsed: boolean;
		current: boolean;
	}

	let { href, saving, collapsed, current }: Props = $props();

	const action = getNavAction();

	/** From the circle above the bar to the pill in the bar's place. */
	const DROP = 34;
	/** Where the label sits relative to the body: under the circle, then inside the pill. */
	const LABEL_BELOW = 39;
	const LABEL_IN_PILL = { x: 17, y: -1.5 };
	const GLYPH_IN_PILL = -35;
	/** Label size under the circle, against its full size in the pill. */
	const LABEL_SMALL = 10 / 13;

	// svelte-ignore state_referenced_locally
	const morph = new Tween(saving ? 1 : 0, { duration: 600, easing: cubicInOut });
	const stretch = new Spring(0, { stiffness: 0.022, damping: 0.17 });

	$effect(() => {
		const instant = prefersReducedMotion.current;
		morph.set(saving ? 1 : 0, instant ? { duration: 0 } : {});
		stretch.set(collapsed ? 1 : 0, { instant });
	});

	const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
	const opened = $derived(Math.min(1, Math.max(0, stretch.current)));
	// The icon and label part sideways first, so the label rises into the gap between them.
	const sideways = $derived(Math.sqrt(opened));
	const rising = $derived(opened ** 3);
	/** The label changes colour as it crosses onto the amber. */
	const inked = $derived.by(() => {
		const u = Math.min(1, Math.max(0, (opened - 0.6) / 0.25));
		return Math.round(u * u * (3 - 2 * u) * 100);
	});
</script>

<div class="add" class:collapsed style:--pill="{PILL_WIDTH}px" style:--drop="{DROP}px">
	{#if saving}
		<button class="hit" form={BREW_FORM_ID} disabled={action.submitting}>
			<span class="visually-hidden">{action.submitting ? 'Saving…' : 'Save brew'}</span>
		</button>
	{:else}
		<a class="hit" {href} aria-current={current ? 'page' : undefined}>
			<span class="visually-hidden">Add Brew</span>
		</a>
	{/if}
	<div class="core" aria-hidden="true" style:translate="0 {stretch.current * DROP}px">
		<svg class="body" viewBox="-26 -26 52 52"><path d={bodyPath(stretch.current)} /></svg>
		<svg class="glyph" viewBox="0 0 115 118" style:translate="{sideways * GLYPH_IN_PILL}px 0">
			<path d={glyphPath(morph.current)} />
		</svg>
		<span
			class="text"
			style:translate="calc(-50% + {sideways * LABEL_IN_PILL.x}px) calc(-50% + {lerp(
				LABEL_BELOW,
				LABEL_IN_PILL.y,
				rising
			)}px)"
			style:scale={lerp(LABEL_SMALL, 1, opened)}
			style:color="color-mix(in srgb, var(--accent-text) {inked}%, var(--accent-ink))"
		>
			<span style:opacity={1 - morph.current}>Add Brew</span>
			<span style:opacity={morph.current}>{action.submitting ? 'Saving…' : 'Save Brew'}</span>
		</span>
	</div>
</div>

<style>
	.add {
		position: relative;
		justify-self: center;
		align-self: start;
		width: 52px;
		height: 70px;
		margin-top: -24px;
		pointer-events: auto;
	}
	.hit {
		position: absolute;
		top: 0;
		left: 50%;
		translate: -50% 0;
		display: block;
		width: 100%;
		height: 100%;
		padding: 0;
		border: 0;
		border-radius: 26px;
		background: none;
		cursor: pointer;
	}
	.hit:disabled {
		cursor: default;
	}
	.collapsed .hit {
		top: var(--drop);
		width: var(--pill);
		height: 52px;
	}
	.core {
		position: absolute;
		inset: 0 0 auto;
		height: 52px;
		pointer-events: none;
	}
	.body,
	.glyph {
		position: absolute;
		top: 50%;
		left: 50%;
		overflow: visible;
	}
	.body {
		width: 52px;
		height: 52px;
		margin: -26px 0 0 -26px;
		fill: var(--accent);
		filter: drop-shadow(0 2.5px 6px rgb(250 169 86 / 8%));
	}
	.hit:hover ~ .core .body {
		filter: brightness(1.06) drop-shadow(0 2.5px 6px rgb(250 169 86 / 8%));
	}
	.glyph {
		width: 29.25px;
		height: 30px;
		margin: -15px 0 0 -14.625px;
		fill: none;
		stroke: var(--accent-text);
		stroke-width: 10;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.text {
		position: absolute;
		top: 50%;
		left: 50%;
		display: grid;
		font-size: 0.8125rem;
		line-height: 1;
		white-space: nowrap;
	}
	.text > span {
		grid-area: 1 / 1;
		text-align: center;
	}
</style>
