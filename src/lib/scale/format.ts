/** A scale reading to 0.1 g. A tiny negative is shown as 0.0, and no reading as a dash. */
export function formatReading(grams: number | null | undefined): string {
	if (grams == null) return '—';
	const rounded = Math.round(grams * 10) / 10;
	return `${(rounded === 0 ? 0 : rounded).toFixed(1)}g`;
}
