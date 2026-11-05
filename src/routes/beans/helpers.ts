/** Pure helpers for the catalogue pages (beans, equipment). Client-safe: no server imports. */
import { roundTenth } from '#lib/domain/pours.ts';

/**
 * `path` (already checked with `safeReturnPath`) with `key=value` set in its query, so a form that sent
 * the user off to create something gets it back preselected: `/brews/new` → `/brews/new?bean=<id>`.
 */
export function withParam(path: string, key: string, value: string): string {
	const base = 'http://same-origin.invalid';
	const url = new URL(path, base);
	url.searchParams.set(key, value);
	return url.pathname + url.search + url.hash;
}

/** "Roasted today", "1 day off roast", "12 days off roast"; null when the roast date is unknown. */
export function roastAgeText(days: number | null): string | null {
	if (days == null) return null;
	// The roast date may be a day "ahead" for zones east of the server (schemas.ts allows it).
	if (days <= 0) return 'Roasted today';
	return days === 1 ? '1 day off roast' : `${days} days off roast`;
}

/** "1,800–2,000 m", "1,900 m" for a single quoted altitude, null when unknown. */
export function altitudeText(min: number | null, max: number | null): string | null {
	if (min == null && max == null) return null;
	const fmt = (n: number) => n.toLocaleString('en-GB');
	if (min == null || max == null || min === max) return `${fmt((min ?? max)!)} m`;
	return `${fmt(min)}–${fmt(max)} m`;
}

/** Archived items after active ones, keeping the service's order within each group. */
export function activeFirst<T extends { archivedAt: Date | null }>(items: readonly T[]): T[] {
	return [...items].sort((a, b) => Number(a.archivedAt != null) - Number(b.archivedAt != null));
}

/** "143 g left" (grams rounded to 0.1). */
export function gramsLeftText(remainingG: number): string {
	return `${roundTenth(remainingG)} g left`;
}

/** "≈ 9 brews", or "≈ 9 brews at 15 g" with `withDose`; null when no dose is known. */
export function brewsLeftText(
	left: { brewsLeft: number | null; doseG: number | null },
	{ withDose = false }: { withDose?: boolean } = {}
): string | null {
	if (left.brewsLeft == null || left.doseG == null) return null;
	const n = left.brewsLeft;
	return `≈ ${n} ${n === 1 ? 'brew' : 'brews'}` + (withDose ? ` at ${left.doseG} g` : '');
}

/** "0 g left — 262.5 g logged from a 250 g bag": what an empty (or over-logged) bag says. */
export function bagEmptyText(bagWeightG: number, usedG: number): string {
	return `0 g left — ${roundTenth(usedG)} g logged from a ${bagWeightG} g bag`;
}

/** Share of the bag still left, clamped to 0–1 (for a progress bar). */
export function leftFraction(remainingG: number, bagWeightG: number): number {
	if (!(bagWeightG > 0)) return 0;
	return Math.min(1, Math.max(0, remainingG / bagWeightG));
}

/** A price in the user's own currency, no symbol: "14.50". */
export function priceText(price: number): string {
	return price.toFixed(2);
}

/**
 * What one brew at `doseG` costs out of a bag, rounded to 2 decimals; null unless the price, the bag
 * weight and a dose are all known.
 */
export function pricePerBrew(
	bagPrice: number | null,
	bagWeightG: number | null,
	doseG: number | null
): number | null {
	if (bagPrice == null || bagWeightG == null || doseG == null) return null;
	if (!(bagWeightG > 0) || !(doseG > 0)) return null;
	return Math.round(((bagPrice * doseG) / bagWeightG) * 100 + 1e-9) / 100;
}

/** "0.87 per 15 g brew"; null when `pricePerBrew` is. */
export function pricePerBrewText(
	bagPrice: number | null,
	bagWeightG: number | null,
	doseG: number | null
): string | null {
	const p = pricePerBrew(bagPrice, bagWeightG, doseG);
	return p == null ? null : `${priceText(p)} per ${doseG} g brew`;
}
