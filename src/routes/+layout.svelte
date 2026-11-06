<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Browser chrome colours. An enhanced save doesn't re-render <html>, so sync it here.
	const BAR_LIGHT = '#fafaf8';
	const BAR_DARK = '#141413';
	$effect(() => {
		document.documentElement.dataset.theme = data.theme;
	});

	const NAV = [
		{ href: '/', label: 'Home', icon: '⌂' },
		{ href: '/brews', label: 'Brews', icon: '☰' },
		{ href: '/brews/new', label: 'Log brew', icon: '+', primary: true },
		{ href: '/beans', label: 'Beans', icon: '◉' },
		{ href: '/settings', label: 'Settings', icon: '⚙' }
	];

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
	<nav class="tabbar" aria-label="Main">
		{#each NAV as item (item.href)}
			<a
				href={item.href}
				class:primary={item.primary}
				aria-current={isActive(item.href) ? 'page' : undefined}
			>
				<span class="icon" aria-hidden="true">{item.icon}</span>
				<span class="text">{item.label}</span>
			</a>
		{/each}
	</nav>
{/if}

<style>
	.tabbar {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 10;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		height: calc(var(--nav-h) + env(safe-area-inset-bottom));
		padding-bottom: env(safe-area-inset-bottom);
		background: var(--surface);
		border-top: 1px solid var(--border);
	}
	.tabbar a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.1rem;
		color: var(--muted);
		text-decoration: none;
		font-size: 0.72rem;
		font-weight: 600;
	}
	.tabbar a[aria-current='page'] {
		color: var(--accent);
	}
	.icon {
		font-size: 1.2rem;
		line-height: 1;
	}
	.tabbar a.primary .icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.2rem;
		height: 2.2rem;
		border-radius: 999px;
		background: var(--accent);
		color: var(--accent-text);
		font-size: 1.4rem;
	}
	@media (min-width: 48rem) {
		.tabbar {
			position: sticky;
			top: 0;
			inset: auto;
			height: auto;
			grid-template-columns: none;
			display: flex;
			justify-content: center;
			gap: 0.5rem;
			padding: 0.4rem;
			border-top: 0;
			border-bottom: 1px solid var(--border);
		}
		.tabbar a {
			flex-direction: row;
			font-size: 0.9rem;
			padding: 0.4rem 0.8rem;
			border-radius: var(--radius-sm);
			gap: 0.4rem;
		}
	}
</style>
