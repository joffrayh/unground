import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// The public origin, fixed at build time. When unset, adapter-node derives it per request from
			// the Host header and assumes https, which is right behind a TLS proxy. Set ORIGIN when building
			// for plain http (e.g. the e2e tests) so the CSRF origin check matches.
			paths: { origin: process.env.ORIGIN || undefined },
			// Kit adds hashes/nonces for its own inline scripts, so no 'unsafe-inline' is needed for scripts.
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					// Svelte transitions and style: directives write inline styles.
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		// Integration tests boot an in-process Postgres (PGlite) per file; keep parallelism modest.
		hookTimeout: 60_000,
		testTimeout: 30_000,
		maxWorkers: 3,
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
