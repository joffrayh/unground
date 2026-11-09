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
	import spiral from '#lib/assets/nav/spiral.svg';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Browser chrome colours. An enhanced save doesn't re-render <html>, so sync it here.
	const BAR_LIGHT = '#faf5ec';
	const BAR_DARK = '#101118';
	$effect(() => {
		document.documentElement.dataset.theme = data.theme;
	});

	/** `size` is the icon's width in em, matching its weight in the design. */
	const NAV = [
		{ href: '/', label: 'Home', icon: home, size: 1.3, iconOnly: true },
		{ href: '/brews', label: 'Brews', icon: menu, size: 0.95 },
		{ href: '/brews/new', label: 'Add Brew', icon: spiral, size: 1.95, primary: true },
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

<main class="container">
	{@render children()}
</main>

{#if data.user}
	<nav class="navbar" aria-label="Main" style:--notch={cssUrl(notch)}>
		<div class="glass" aria-hidden="true"></div>
		<div class="edge" aria-hidden="true"></div>
		<svg class="notch-line" viewBox="490 0 480 240" preserveAspectRatio="none" aria-hidden="true">
			<path
				d="M490 0H496.081C544.776 0 589.946 25.3957 615.25 67L617.421 70.5698C641.377 109.957 684.14 134 730.241 134C774.716 134 816.203 111.612 840.616 74.4368L845.5 67C872.962 25.1835 919.628 0 969.656 0H970"
			/>
		</svg>
		{#each NAV as item (item.href)}
			{@const icon = cssUrl(item.icon)}
			{#if item.primary}
				<a class="add" href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
					<span class="add-circle" aria-hidden="true">
						<span class="icon" style:--icon={icon} style:--size="{item.size}em"></span>
					</span>
					<span class="add-label">{item.label}</span>
				</a>
			{:else}
				<a
					class="tab"
					class:icon-only={item.iconOnly}
					href={item.href}
					aria-current={isActive(item.href) ? 'page' : undefined}
				>
					<span class="icon" style:--icon={icon} style:--size="{item.size}em" aria-hidden="true"
					></span>
					<span class={item.iconOnly ? 'visually-hidden' : 'label'}>{item.label}</span>
				</a>
			{/if}
		{/each}
	</nav>
{/if}

<style>
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
	.add {
		position: relative;
		justify-self: center;
		align-self: start;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		margin-top: -24px;
		text-decoration: none;
	}
	.add-circle {
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-text);
		box-shadow: 0 2.5px 11.6px 1.25px rgb(250 169 86 / 8%);
		font-size: 15px;
	}
	.add:hover .add-circle {
		filter: brightness(1.06);
	}
	.add-label {
		color: var(--accent-ink);
		font-size: 0.625rem;
		line-height: 1;
		white-space: nowrap;
	}
	/* A label beside an icon no longer fits on the narrowest phones. */
	@media (max-width: 340px) {
		.tab:not(.icon-only) .icon {
			display: none;
		}
	}
</style>
