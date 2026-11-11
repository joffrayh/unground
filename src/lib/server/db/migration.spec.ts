/**
 * Migrations that rewrite stored data. 0002 (D23, D27): dripper materials become drippers, and pour 1
 * becomes a bloom. 0005 (D55): scores are halved onto the 0.25–5 scale. 0006 (D55, D56): the taste
 * profile moves to half steps, Cafec brews become Cafec Abaca, and brews gain slow_fed. Each test applies the
 * migrations before it, writes data the old way, then applies the rest and checks nothing recorded
 * was lost.
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

describe('migration 0005', () => {
	it('halves every 1–10 score onto the 0.25–5 scale, keeping blanks blank (D55)', async () => {
		const client = new PGlite();
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: await firstMigrations(5) });
		await seedFlavors(db);

		const setup = [
			sql`INSERT INTO users (id, email, password_hash) VALUES
				('00000000-0000-4000-8000-000000000001', 'a@example.com', 'x')`,
			sql`INSERT INTO roasters (id, user_id, name) VALUES
				('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'R')`,
			sql`INSERT INTO beans (id, user_id, roaster_id, name) VALUES
				('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'B')`,
			sql`INSERT INTO grinders (id, user_id, name) VALUES
				('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001', 'G')`
		];
		for (const statement of setup) await db.execute(statement);
		const ids = ['00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d2'];
		for (const id of ids) {
			await db.transaction(async (tx) => {
				await tx.execute(sql`
					INSERT INTO brews (id, user_id, bean_id, grinder_id, method, brewed_at, timezone,
						grind_setting, dose_g, water_g, water_temp_c, total_time_s)
					VALUES (${id}, '00000000-0000-4000-8000-000000000001',
						'00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c1',
						'v60', now(), 'UTC', 24, 15, 250, 94, 195)`);
				await tx.execute(sql`INSERT INTO brew_v60 (brew_id) VALUES (${id})`);
				await tx.execute(
					sql`INSERT INTO pours (brew_id, idx, volume_g, interval_s) VALUES (${id}, 1, 250, 0)`
				);
			});
		}
		await db.execute(sql`
			INSERT INTO ratings (brew_id, overall, acidity, sweetness, body, bitterness, astringency,
				clarity, aftertaste)
			VALUES (${ids[0]}, 10, 1, 7, 2, NULL, 3, 9, 6), (${ids[1]}, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`);

		await migrate(db, { migrationsFolder: 'drizzle' });

		const r = schema.ratings;
		const rows = await db
			.select({
				overall: r.overall,
				acidity: r.acidity,
				sweetness: r.sweetness,
				body: r.body,
				bitterness: r.bitterness,
				astringency: r.astringency,
				clarity: r.clarity,
				aftertaste: r.aftertaste
			})
			.from(r)
			.orderBy(r.brewId);
		expect(rows).toEqual([
			{
				overall: 5,
				acidity: 0.5,
				sweetness: 3.5,
				body: 1,
				bitterness: null,
				astringency: 1.5,
				clarity: 4.5,
				aftertaste: 3
			},
			{
				overall: 0.5,
				acidity: null,
				sweetness: null,
				body: null,
				bitterness: null,
				astringency: null,
				clarity: null,
				aftertaste: null
			}
		]);
		// The new checks are in place: a score off the quarter steps is refused.
		await expect(
			db.execute(sql`UPDATE ratings SET overall = 3.3 WHERE brew_id = ${ids[1]}`)
		).rejects.toThrow();
		await client.close();
	});
});

describe('migration 0006', () => {
	it('moves Cafec brews to Abaca, rounds the profile to halves and adds slow_fed false (D55, D56)', async () => {
		const client = new PGlite();
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: await firstMigrations(6) });
		await seedFlavors(db);

		const user = '00000000-0000-4000-8000-000000000001';
		const setup = [
			sql`INSERT INTO users (id, email, password_hash) VALUES (${user}, 'a@example.com', 'x')`,
			sql`INSERT INTO roasters (id, user_id, name) VALUES
				('00000000-0000-4000-8000-0000000000a1', ${user}, 'R')`,
			sql`INSERT INTO beans (id, user_id, roaster_id, name) VALUES
				('00000000-0000-4000-8000-0000000000b1', ${user}, '00000000-0000-4000-8000-0000000000a1', 'B')`,
			sql`INSERT INTO grinders (id, user_id, name) VALUES
				('00000000-0000-4000-8000-0000000000c1', ${user}, 'G')`
		];
		for (const statement of setup) await db.execute(statement);
		const brews: [string, string | null][] = [
			['00000000-0000-4000-8000-0000000000d1', 'cafec'],
			['00000000-0000-4000-8000-0000000000d2', 'hario_tabbed'],
			['00000000-0000-4000-8000-0000000000d3', null]
		];
		for (const [id, filter] of brews) {
			await db.transaction(async (tx) => {
				await tx.execute(sql`
					INSERT INTO brews (id, user_id, bean_id, grinder_id, method, brewed_at, timezone,
						grind_setting, dose_g, water_g, water_temp_c, total_time_s)
					VALUES (${id}, ${user}, '00000000-0000-4000-8000-0000000000b1',
						'00000000-0000-4000-8000-0000000000c1', 'v60', now(), 'UTC', 24, 15, 250, 94, 195)`);
				await tx.execute(
					sql`INSERT INTO brew_v60 (brew_id, filter_type) VALUES (${id}, ${filter})`
				);
				await tx.execute(
					sql`INSERT INTO pours (brew_id, idx, volume_g, interval_s) VALUES (${id}, 1, 250, 0)`
				);
			});
		}
		// Quarters on the profile were allowed between 0005 and 0006.
		await db.execute(sql`
			INSERT INTO ratings (brew_id, overall, acidity, sweetness, body, clarity)
			VALUES (${brews[0][0]}, 3.75, 3.25, 0.25, 2.5, NULL)`);

		await migrate(db, { migrationsFolder: 'drizzle' });

		const rows = (
			await db.execute<{ filter_type: string | null; slow_fed: boolean }>(sql`
				SELECT v.filter_type, b.slow_fed FROM brews b JOIN brew_v60 v ON v.brew_id = b.id
				ORDER BY b.id`)
		).rows;
		expect(rows).toEqual([
			{ filter_type: 'cafec_abaca', slow_fed: false },
			{ filter_type: 'hario_tabbed', slow_fed: false },
			{ filter_type: null, slow_fed: false }
		]);
		const r = schema.ratings;
		const [rating] = await db
			.select({
				overall: r.overall,
				acidity: r.acidity,
				sweetness: r.sweetness,
				body: r.body,
				clarity: r.clarity
			})
			.from(r);
		expect(rating).toEqual({
			overall: 3.75,
			acidity: 3.5,
			sweetness: 0.5,
			body: 2.5,
			clarity: null
		});
		// The new checks are in place.
		await expect(
			db.execute(sql`UPDATE brew_v60 SET filter_type = 'cafec' WHERE brew_id = ${brews[1][0]}`)
		).rejects.toThrow();
		await expect(db.execute(sql`UPDATE ratings SET body = 2.25`)).rejects.toThrow();
		await client.close();
	});
});
