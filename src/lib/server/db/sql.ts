import { getTableName, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * A table-qualified column reference ("beans"."id"). Drizzle omits the table name in single-table
 * queries, which silently breaks correlated subqueries; always use this inside them.
 */
export function col(column: AnyPgColumn): SQL {
	return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;
}
