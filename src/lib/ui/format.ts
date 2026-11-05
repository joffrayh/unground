/** Display formatting shared by every page. Pure and client-safe. */
import { LABELS } from '../domain/vocab';

export { formatDuration } from '../domain/pours';
export { label } from '../domain/vocab';

/** "Tue 3 Nov, 08:15" in the given zone. */
export function formatDateTime(instant: Date, timeZone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone,
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).format(instant);
}

/** "20 Oct 2026" for a YYYY-MM-DD date. */
export function formatDate(date: string | null): string {
	if (!date) return '—';
	return new Intl.DateTimeFormat('en-GB', {
		timeZone: 'UTC',
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	}).format(new Date(`${date}T00:00:00Z`));
}

/** "15 g", "15.5 g"; "—" for null. */
export function grams(value: number | null | undefined): string {
	return value == null ? '—' : `${value} g`;
}

/** "1:16.7"; "—" when it can't be computed. */
export function ratioText(ratio: number | null): string {
	return ratio == null ? '—' : `1:${ratio}`;
}

/** <select> options for a controlled vocabulary, labelled for display. */
export function options(values: readonly string[]): { value: string; label: string }[] {
	return values.map((value) => ({ value, label: LABELS[value] ?? value }));
}
