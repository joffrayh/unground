import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	// Only `migrate`/`studio` connect; `generate` works offline.
	dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://localhost/unused' },
	verbose: true,
	strict: true
});
