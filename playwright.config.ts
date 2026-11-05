import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * End-to-end tests run against a production build (`node build`) and a dedicated database.
 * Override E2E_DATABASE_URL to point elsewhere (the default is the dev Docker Postgres on 5433).
 */
export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: BASE_URL,
		...devices['iPhone 13'],
		browserName: 'chromium',
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'npm run build && node build',
		url: `${BASE_URL}/login`,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		env: {
			PORT: String(PORT),
			ORIGIN: BASE_URL,
			DATABASE_URL:
				process.env.E2E_DATABASE_URL ?? 'postgres://coffee:coffee@localhost:5433/coffee_e2e',
			REGISTRATION: 'open'
		}
	}
});
