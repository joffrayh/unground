<script lang="ts">
	import '@fontsource/corben/400.css';
	import '@fontsource/lato/300.css';
	import '@fontsource/lato/400.css';
	import '@fontsource/lato/700.css';
	import '../app.css';
	// Temporary logo (D35).
	import favicon from '#lib/assets/unground-logo.svg';
	import bean from '#lib/assets/nav/bean.svg';
	import home from '#lib/assets/nav/home.svg';
	import menu from '#lib/assets/nav/menu.svg';
	import notch from '#lib/assets/nav/notch.svg';
	import settings from '#lib/assets/nav/settings.svg';
	import NavPrimary from '#lib/components/NavPrimary.svelte';
	import { NavAction, setNavAction } from '#lib/ui/nav-action.svelte.ts';
	import { animateDetails } from '#lib/ui/details-motion.ts';
	import { changesPage, enterPage } from '#lib/ui/page-enter.ts';
	import { type CollapseState, nextCollapse } from '#lib/ui/scroll-collapse.ts';
	import { prefersReducedMotion } from 'svelte/motion';
	import { afterNavigate } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	setNavAction(new NavAction());

	let main = $state<HTMLElement>();
	let endEnter: (() => void) | undefined;
	afterNavigate((navigation) => {
		endEnter?.();
		endEnter =
			main && changesPage(navigation) && !prefersReducedMotion.current
				? enterPage(main)
				: undefined;
	});

	/** The brew form is showing, so the centre button saves it rather than opening it (D38). */
	const saving = $derived(page.route.id === '/brews/new' && !page.data.setup);
	let collapsed = $state(false);

	$effect(() => {
		if (!saving) {
			collapsed = false;
			return;
		}
		let state: CollapseState = { collapsed: false, anchor: window.scrollY };
		const onScroll = () => {
			const maxY = document.documentElement.scrollHeight - window.innerHeight;
			state = nextCollapse(state, window.scrollY, maxY);
			collapsed = state.collapsed;
		};
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});

	// The visible height, for browsers whose dvh misses a hidden toolbar (Bluefy full screen).
	$effect(() => {
		const vv = window.visualViewport;
		if (!vv) return;
		const root = document.documentElement;
		const sync = () => root.style.setProperty('--viewport-h', `${vv.height}px`);
		sync();
		vv.addEventListener('resize', sync);
		return () => {
			vv.removeEventListener('resize', sync);
			root.style.removeProperty('--viewport-h');
		};
	});

	// Browser chrome colours. An enhanced save doesn't re-render <html>, so sync it here.
	const BAR_LIGHT = '#faf5ec';
	const BAR_DARK = '#101118';
	$effect(() => {
		document.documentElement.dataset.theme = data.theme;
	});

	interface Tab {
		href: string;
		label: string;
		icon: string;
		/** The icon's width in em, matching its weight in the design. */
		size: number;
		iconOnly?: boolean;
	}
	const ADD_BREW = '/brews/new';
	const TABS_BEFORE: Tab[] = [
		{ href: '/', label: 'Home', icon: home, size: 1.3, iconOnly: true },
		{ href: '/brews', label: 'Brews', icon: menu, size: 0.95 }
	];
	const TABS_AFTER: Tab[] = [
		{ href: '/beans', label: 'Beans', icon: bean, size: 1.55 },
		{ href: '/settings', label: 'Settings', icon: settings, size: 1.45, iconOnly: true }
	];

	/** The icons are masks, so they take the link's colour and tint with the active tab. */
	const cssUrl = (src: string) => `url("${src}")`;

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/') return path === '/';
		if (href === '/brews') return path === '/brews' || /^\/brews\/(?!new)/.test(path);
		return path === href || path.startsWith(href + '/');
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	{#if data.theme === 'system'}
		<meta name="theme-color" content={BAR_LIGHT} media="(prefers-color-scheme: light)" />
		<meta name="theme-color" content={BAR_DARK} media="(prefers-color-scheme: dark)" />
	{:else}
		<meta name="theme-color" content={data.theme === 'dark' ? BAR_DARK : BAR_LIGHT} />
	{/if}
	<title>Unground</title>
</svelte:head>

<main class="container" class:leaving={changesPage(navigating)} bind:this={main} use:animateDetails>
	{@render children()}
</main>

{#snippet tab(item: Tab)}
	<a
		class="tab"
		class:icon-only={item.iconOnly}
		href={item.href}
		aria-current={isActive(item.href) ? 'page' : undefined}
	>
		<span
			class="icon"
			style:--icon={cssUrl(item.icon)}
			style:--size="{item.size}em"
			aria-hidden="true"
		></span>
		<span class={item.iconOnly ? 'visually-hidden' : 'label'}>{item.label}</span>
	</a>
{/snippet}

{#if data.user}
	<nav class="navbar" class:collapsed aria-label="Main" style:--notch={cssUrl(notch)}>
		<div class="glass" aria-hidden="true"></div>
		<div class="edge" aria-hidden="true"></div>
		<svg class="notch-line" viewBox="490 0 480 240" preserveAspectRatio="none" aria-hidden="true">
			<path
				d="M490 0H496.081C544.776 0 589.946 25.3957 615.25 67L617.421 70.5698C641.377 109.957 684.14 134 730.241 134C774.716 134 816.203 111.612 840.616 74.4368L845.5 67C872.962 25.1835 919.628 0 969.656 0H970"
			/>
		</svg>
		{#each TABS_BEFORE as item (item.href)}
			{@render tab(item)}
		{/each}
		<NavPrimary href={ADD_BREW} {saving} {collapsed} current={isActive(ADD_BREW)} />
		{#each TABS_AFTER as item (item.href)}
			{@render tab(item)}
		{/each}
	</nav>
{/if}

<style>
	/* Answers the tap while a slow page loads; a cached one arrives before the delay is up (D39). */
	@media (prefers-reduced-motion: no-preference) {
		.leaving {
			opacity: 0.6;
			transition: opacity 0.16s ease-out 0.06s;
		}
	}
	.navbar {
		--end-radius: calc(var(--nav-h) / 2);
		/* The two flat runs either side of the notch; 1px of overlap hides the join. */
		--flat: calc(50% - 59.5px);
		position: fixed;
		left: 50%;
		bottom: calc(var(--nav-gap) + env(safe-area-inset-bottom));
		z-index: 10;
		translate: -50% 0;
		display: grid;
		grid-template-columns: 44px minmax(0, 84px) minmax(3.9rem, 1fr) minmax(0, 84px) 44px;
		align-items: center;
		gap: 7px;
		width: min(100% - 2rem, 23rem);
		height: var(--nav-h);
		padding-inline: 8px;
		font-family: var(--display);
		font-size: clamp(0.75rem, 3.75vw, 0.94rem);
	}
	.glass,
	.edge {
		position: absolute;
		inset: 0;
		border-radius: var(--end-radius);
	}
	.glass {
		background: var(--glass);
		-webkit-backdrop-filter: blur(10px);
		backdrop-filter: blur(10px);
		-webkit-mask:
			var(--notch) center top / 120px 100% no-repeat,
			linear-gradient(#000 0 0) left / var(--flat) 100% no-repeat,
			linear-gradient(#000 0 0) right / var(--flat) 100% no-repeat;
		mask:
			var(--notch) center top / 120px 100% no-repeat,
			linear-gradient(#000 0 0) left / var(--flat) 100% no-repeat,
			linear-gradient(#000 0 0) right / var(--flat) 100% no-repeat;
	}
	/* The rim, cut away where the notch-line takes over. */
	.edge {
		box-shadow: var(--edge);
		pointer-events: none;
		-webkit-mask:
			linear-gradient(#000 0 0) left / var(--flat) 100% no-repeat,
			linear-gradient(#000 0 0) right / var(--flat) 100% no-repeat,
			linear-gradient(#000 0 0) bottom / 100% 20px no-repeat;
		mask:
			linear-gradient(#000 0 0) left / var(--flat) 100% no-repeat,
			linear-gradient(#000 0 0) right / var(--flat) 100% no-repeat,
			linear-gradient(#000 0 0) bottom / 100% 20px no-repeat;
	}
	.notch-line {
		position: absolute;
		top: 0.5px; /* Centres the stroke on the rim's 1px line. */
		left: calc(50% - 60px);
		width: 120px;
		height: 100%;
		overflow: visible;
		fill: none;
		stroke: var(--edge-line);
		stroke-width: 1;
		pointer-events: none;
	}
	.notch-line path {
		vector-effect: non-scaling-stroke;
	}
	.icon {
		display: block;
		flex: none;
		width: var(--size);
		height: var(--size);
		background: currentColor;
		-webkit-mask: var(--icon) center / contain no-repeat;
		mask: var(--icon) center / contain no-repeat;
	}
	.tab {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.35em;
		min-width: 0;
		height: 44px;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--cream);
		text-decoration: none;
	}
	/* Raises the Corben label to match the buttons. */
	.label {
		padding-bottom: 4px;
	}
	.tab:hover {
		background: color-mix(in srgb, var(--accent) 8%, var(--surface-2));
	}
	.tab[aria-current='page'] {
		background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
		color: var(--accent-ink);
	}
	/* Everything but the centre button folds away (D38). */
	.glass,
	.edge,
	.notch-line,
	.tab {
		transition:
			opacity 0.18s ease,
			translate 0.24s ease,
			visibility 0s;
	}
	.navbar.collapsed {
		pointer-events: none;
	}
	.navbar.collapsed :is(.glass, .edge, .notch-line, .tab) {
		opacity: 0;
		translate: 0 14px;
		visibility: hidden;
		transition:
			opacity 0.18s ease,
			translate 0.24s ease,
			visibility 0s 0.24s;
	}
	@media (prefers-reduced-motion: reduce) {
		.glass,
		.edge,
		.notch-line,
		.tab,
		.navbar.collapsed :is(.glass, .edge, .notch-line, .tab) {
			transition: none;
		}
	}
	/* A label beside an icon no longer fits on the narrowest phones. */
	@media (max-width: 340px) {
		.tab:not(.icon-only) .icon {
			display: none;
		}
	}
</style>
