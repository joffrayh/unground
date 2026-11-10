<script lang="ts">
	import dark from '#lib/assets/logo-full-dark.svg';
	import light from '#lib/assets/logo-full-light.svg';

	let { centered = false }: { centered?: boolean } = $props();
</script>

<!-- Both are in the page so the theme (D33) can pick one without JavaScript. -->
<span class="logo" class:centered role="img" aria-label="Unground">
	<img class="light" src={light} alt="" width="785" height="188" />
	<img class="dark" src={dark} alt="" width="785" height="188" />
</span>

<style>
	.logo {
		--h: var(--logo-h, 3rem);
		display: block;
		width: fit-content;
		/* The artwork's left margin (31 of 785), so the wordmark lines up with the page. */
		margin-left: calc(var(--h) * -31 / 188);
	}
	.centered {
		margin-inline: auto;
	}
	img {
		display: block;
		width: auto;
		height: var(--h);
	}
	.dark {
		display: none;
	}
	:global(:root[data-theme='dark']) .light {
		display: none;
	}
	:global(:root[data-theme='dark']) .dark {
		display: block;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .light {
			display: none;
		}
		:global(:root:not([data-theme='light'])) .dark {
			display: block;
		}
	}
</style>
