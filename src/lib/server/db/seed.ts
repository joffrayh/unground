import { sql } from 'drizzle-orm';
import { FLAVORS } from '../../domain/flavors';
import { flavors } from './schema';
import type { Db } from './types';

/**
 * Upserts the flavor vocabulary. Idempotent; runs after every migration so the table always matches
 * the code. Flavors are only ever added, never removed (ids are referenced by stored tags).
 */
export async function seedFlavors(db: Db): Promise<void> {
	// FLAVORS is ordered parents-first, so the self-referencing FK is satisfied row by row.
	await db
		.insert(flavors)
		.values(FLAVORS.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, tier: f.tier })))
		.onConflictDoUpdate({
			target: flavors.id,
			set: { name: sql`excluded.name`, parentId: sql`excluded.parent_id`, tier: sql`excluded.tier` }
		});
}
