import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { DATABASE_URL } from '$app/env/private';
import * as schema from './schema';
import { seedFlavors } from './seed';
import type { Db } from './types';

// postgres() connects lazily, so a missing URL only fails when used; prepareDatabase() checks it at start.
// onnotice: silence NOTICEs such as "schema already exists, skipping" from re-running migrations.
// idle_timeout: close idle connections (seconds) so a serverless database (Neon) can scale to zero.
const client = postgres(DATABASE_URL ?? '', { max: 10, idle_timeout: 60, onnotice: () => {} });

export const db: Db = drizzle(client, { schema });

/** Applies pending migrations and refreshes seeded vocabularies. Called once at server start. */
export async function prepareDatabase(migrationsFolder = 'drizzle'): Promise<void> {
	if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');
	await migrate(drizzle(client, { schema }), { migrationsFolder });
	await seedFlavors(db);
}
