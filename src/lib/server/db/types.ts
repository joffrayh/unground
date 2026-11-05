import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type * as schema from './schema';

/** Driver-agnostic database handle: postgres-js in the app, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** A transaction handle; it supports the same query API as `Db`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Anything you can run queries on. */
export type Queryable = Db | Tx;
