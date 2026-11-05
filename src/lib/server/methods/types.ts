import type { BrewMethod } from '../../domain/vocab';
import type { Queryable, Tx } from '../db/types';

/**
 * Everything the core brew service needs to know about a brew method (D8, R5).
 * Adding a method = a `brew_<method>` table + a module implementing this + a registry entry.
 */
export interface MethodModule<Details> {
	id: BrewMethod;
	/** Total water (g) determined by the method details, e.g. the sum of the pours. */
	waterG(details: Details): number;
	/** Writes (or replaces) the method-specific block for a brew. Runs inside the brew's transaction. */
	save(tx: Tx, brewId: string, details: Details): Promise<void>;
	/** Loads the method-specific block for many brews at once. */
	load(q: Queryable, brewIds: string[]): Promise<Map<string, Details>>;
	/** Method-specific columns appended to brews.csv (D14); other methods' brews leave them blank. */
	exportColumns: readonly string[];
	exportRow(details: Details): Record<string, CsvValue>;
}

export type CsvValue = string | number | boolean | null;
