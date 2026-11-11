/** Test helpers: a fresh, migrated in-process Postgres (PGlite) per test file. */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { BeanInput, BrewInput, RatingInput } from '../domain/schemas';
import * as schema from './db/schema';
import { seedFlavors } from './db/seed';
import type { Db } from './db/types';
import { createBean } from './services/beans';
import { createDripper } from './services/drippers';
import { createGrinder } from './services/grinders';
import { users } from './db/schema';

export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
	const client = new PGlite();
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: 'drizzle' });
	await seedFlavors(db);
	return { db, close: () => client.close() };
}

let n = 0;
/** Inserts a user directly (skips password hashing for speed). */
export async function createTestUser(db: Db, timezone = 'Europe/London'): Promise<string> {
	const [u] = await db
		.insert(users)
		.values({ email: `user${++n}-${crypto.randomUUID()}@example.com`, passwordHash: 'x', timezone })
		.returning({ id: users.id });
	return u.id;
}

export function beanInput(overrides: Partial<BeanInput> = {}): BeanInput {
	return {
		name: 'Gesha Village',
		roasterName: 'Square Mile',
		country: 'ET',
		farm: 'Gesha Village Estate',
		altitudeMinM: 1900,
		altitudeMaxM: 2100,
		process: 'washed',
		roastLevel: 'light',
		roastDate: '2026-10-20',
		decaf: false,
		storedFrozen: false,
		roasterNotesRaw: 'Jasmine, bergamot, peach',
		roasterNotes: ['floral.floral.jasmine', 'fruity.other_fruit.peach'],
		bagWeightG: 250,
		bagPrice: 14.5,
		...overrides
	};
}

export function brewInput(
	refs: { beanId: string; grinderId: string; dripperId?: string | null },
	overrides: Partial<BrewInput> = {}
): BrewInput {
	return {
		dripperId: null,
		...refs,
		timezone: 'Europe/London',
		method: 'v60',
		brewedAt: new Date('2026-11-03T08:00:00Z'),
		grindSetting: 24,
		slowFed: false,
		doseG: 15,
		waterTempC: 94,
		agitation: 3,
		totalTimeS: 195,
		notes: null,
		details: {
			filterType: 'hario_tabbed',
			pours: [
				{ volumeG: 50, intervalS: 0, bloom: true },
				{ volumeG: 100, intervalS: 45, bloom: false },
				{ volumeG: 100, intervalS: 30, bloom: false }
			]
		},
		...overrides
	};
}

export function ratingInput(overrides: Partial<RatingInput> = {}): RatingInput {
	return {
		overall: 4,
		acidity: 3.5,
		sweetness: 3,
		body: 2,
		bitterness: 1,
		astringency: 1.5,
		clarity: 3.5,
		comment: 'Lovely',
		perceivedNotes: ['fruity.berry.blueberry'],
		...overrides
	};
}

/** A user with one bean, one grinder and one dripper, ready to log brews. */
export async function setupBrewer(db: Db, timezone?: string) {
	const userId = await createTestUser(db, timezone);
	const { id: beanId } = await createBean(db, userId, beanInput());
	const { id: grinderId } = await createGrinder(db, userId, {
		name: 'Comandante C40',
		settingUnit: 'clicks'
	});
	const { id: dripperId } = await createDripper(db, userId, {
		name: 'Hario V60 02',
		material: 'plastic'
	});
	return { userId, beanId, grinderId, dripperId };
}
