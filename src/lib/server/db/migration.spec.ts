/**
 * Migration 0002 rewrites stored data (D23, D27): dripper materials become drippers, and pour 1
 * becomes a bloom. This applies the migrations up to 0001, writes data the old way, then applies the
 * rest and checks nothing recorded was lost.
 */
import { PGlite } from '@electric-sql/pglite';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, describe, expect, it } from 'vitest';
import * as schema from './schema';
import { seedFlavors } from './seed';

const dirs: string[] = [];
afterAll(async () => {
	for (const d of dirs) await rm(d, { recursive: true, force: true });
});

/** A migrations folder holding only the first `count` migrations. */
async function firstMigrations(count: number): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'coffee-migrations-'));
	dirs.push(dir);
	await mkdir(join(dir, 'meta'));
	const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8'));
	journal.entries = journal.entries.slice(0, count);
	await writeFile(join(dir, 'meta/_journal.json'), JSON.stringify(journal));
	for (const e of journal.entries)
		await copyFile(`drizzle/${e.tag}.sql`, join(dir, `${e.tag}.sql`));
	return dir;
}

describe('migration 0002', () => {
	it('turns dripper materials into drippers and marks pour 1 as the bloom', async () => {
		const client = new PGlite();
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: await firstMigrations(2) });
		await seedFlavors(db);

		// Two users; one has brewed with two materials (twice with plastic), one recorded none.
		const setup = [
			sql`INSERT INTO users (id, email, password_hash) VALUES
				('00000000-0000-4000-8000-000000000001', 'a@example.com', 'x'),
				('00000000-0000-4000-8000-000000000002', 'b@example.com', 'x')`,
			sql`INSERT INTO roasters (id, user_id, name) VALUES
				('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'R'),
				('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000002', 'R')`,
			sql`INSERT INTO beans (id, user_id, roaster_id, name) VALUES
				('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'B'),
				('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a2', 'B')`,
			sql`INSERT INTO grinders (id, user_id, name) VALUES
				('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001', 'G'),
				('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-000000000002', 'G')`
		];
		for (const statement of setup) await db.execute(statement);
		const brews: [string, string, string | null][] = [
			['00000000-0000-4000-8000-0000000000d1', '1', 'plastic'],
			['00000000-0000-4000-8000-0000000000d2', '1', 'plastic'],
			['00000000-0000-4000-8000-0000000000d3', '1', 'glass'],
			['00000000-0000-4000-8000-0000000000d4', '2', null],
			// A single-pour brew had no bloom.
			['00000000-0000-4000-8000-0000000000d5', '2', null]
		];
		for (const [id, u, material] of brews) {
			await db.transaction(async (tx) => {
				await tx.execute(sql`
					INSERT INTO brews (id, user_id, bean_id, grinder_id, method, brewed_at, timezone,
						grind_setting, dose_g, water_g, water_temp_c, total_time_s)
					VALUES (${id}, ${'00000000-0000-4000-8000-00000000000' + u},
						${'00000000-0000-4000-8000-0000000000b' + u}, ${'00000000-0000-4000-8000-0000000000c' + u},
						'v60', now(), 'UTC', 24, 15, 250, 94, 195)`);
				await tx.execute(
					sql`INSERT INTO brew_v60 (brew_id, dripper_material) VALUES (${id}, ${material})`
				);
				await tx.execute(
					id.endsWith('d5')
						? sql`INSERT INTO pours (brew_id, idx, volume_g, interval_s) VALUES (${id}, 1, 250, 0)`
						: sql`
					INSERT INTO pours (brew_id, idx, volume_g, interval_s)
					VALUES (${id}, 1, 50, 0), (${id}, 2, 100, 45), (${id}, 3, 100, 30)`
				);
			});
		}

		await migrate(db, { migrationsFolder: 'drizzle' });

		const drippers = (
			await db.execute<{ user_id: string; name: string; material: string }>(
				sql`SELECT user_id, name, material FROM drippers ORDER BY name`
			)
		).rows;
		expect(drippers).toEqual([
			{ user_id: '00000000-0000-4000-8000-000000000001', name: 'V60 (glass)', material: 'glass' },
			{
				user_id: '00000000-0000-4000-8000-000000000001',
				name: 'V60 (plastic)',
				material: 'plastic'
			}
		]);
		const linked = (
			await db.execute<{ id: string; material: string | null }>(sql`
				SELECT b.id, d.material FROM brews b LEFT JOIN drippers d ON d.id = b.dripper_id ORDER BY b.id`)
		).rows;
		expect(linked.map((r) => r.material)).toEqual(['plastic', 'plastic', 'glass', null, null]);
		const blooms = (
			await db.execute<{ single: boolean; idx: number; bloom: boolean }>(
				sql`SELECT DISTINCT brew_id::text LIKE '%d5' AS single, idx, bloom FROM pours ORDER BY 1, 2`
			)
		).rows;
		expect(blooms).toEqual([
			{ single: false, idx: 1, bloom: true },
			{ single: false, idx: 2, bloom: false },
			{ single: false, idx: 3, bloom: false },
			{ single: true, idx: 1, bloom: false }
		]);
		await client.close();
	});
});
