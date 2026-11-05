/** Derived values (concept.md §5): computed on read, never stored. */
import { roundTenth } from './pours';

/** Water:dose ratio, e.g. 16.7 for 15 g → 250 g. */
export function brewRatio(doseG: number, waterG: number): number | null {
	if (!(doseG > 0) || !(waterG > 0)) return null;
	return Math.round((waterG / doseG) * 10) / 10;
}

export interface BagLeft {
	/** Grams left in the bag (never below 0). */
	remainingG: number;
	/** Whole brews left at `doseG`, or null when no dose is known yet. */
	brewsLeft: number | null;
	/** The dose `brewsLeft` assumes. */
	doseG: number | null;
}

/**
 * What's left in a bag (D28): its weight minus the doses of every brew logged with it. Brews left use
 * the bean's latest dose. Null when the bag weight isn't recorded.
 */
export function bagLeft(
	bagWeightG: number | null,
	usedG: number,
	lastDoseG: number | null
): BagLeft | null {
	if (bagWeightG == null) return null;
	const remainingG = Math.max(0, roundTenth(bagWeightG - usedG));
	const doseG = lastDoseG != null && lastDoseG > 0 ? lastDoseG : null;
	return {
		remainingG,
		brewsLeft: doseG === null ? null : Math.floor(remainingG / doseG + 1e-9),
		doseG
	};
}

function zonedParts(instant: Date, timeZone: string) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-GB', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		})
			.formatToParts(instant)
			.map((p) => [p.type, p.value])
	);
	return parts as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;
}

/** The calendar date (YYYY-MM-DD) of an instant in the given IANA timezone. */
export function localDate(instant: Date, timeZone: string): string {
	const p = zonedParts(instant, timeZone);
	return `${p.year}-${p.month}-${p.day}`;
}

/** Formats a UTC instant as a datetime-local value ("2026-11-03T08:15") in `timeZone`. */
export function utcToZonedLocal(instant: Date, timeZone: string): string {
	const p = zonedParts(instant, timeZone);
	return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Days from roast date to the brewer's local brew date. Null when the roast date is unknown. */
export function roastAgeDays(
	roastDate: string | null,
	brewedAt: Date,
	timeZone: string
): number | null {
	if (!roastDate) return null;
	const brewDay = Date.parse(`${localDate(brewedAt, timeZone)}T00:00:00Z`);
	const roastDay = Date.parse(`${roastDate}T00:00:00Z`);
	return Math.round((brewDay - roastDay) / 86_400_000);
}

export function isValidTimeZone(timeZone: string): boolean {
	try {
		new Intl.DateTimeFormat('en', { timeZone });
		return true;
	} catch {
		return false;
	}
}

/** Zone offset (local − UTC) in ms at an instant. */
function offsetMs(instant: Date, timeZone: string): number {
	const p = zonedParts(instant, timeZone);
	const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
	return asUtc - Math.floor(instant.getTime() / 60_000) * 60_000;
}

/**
 * Converts a datetime-local value ("2026-11-03T08:15") entered in `timeZone` into a UTC instant.
 *
 * DST policy: in an autumn overlap (the wall time happens twice) the earlier instant is used; in a
 * spring gap (the wall time never happens) the time is shifted forward by the gap, as a clock would.
 * Returns null for malformed or out-of-range input (e.g. Feb 30).
 */
export function zonedLocalToUtc(local: string, timeZone: string): Date | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
	if (!m) return null;
	const [y, mo, d, h, mi] = m.slice(1).map(Number);
	const wallClock = Date.UTC(y, mo - 1, d, h, mi);
	const check = new Date(wallClock);
	if (
		check.getUTCFullYear() !== y ||
		check.getUTCMonth() !== mo - 1 ||
		check.getUTCDate() !== d ||
		h > 23 ||
		mi > 59
	) {
		return null;
	}

	// The zone's offsets either side of this wall time; at most two distinct ones around a transition.
	const before = offsetMs(new Date(wallClock - 86_400_000), timeZone);
	const after = offsetMs(new Date(wallClock + 86_400_000), timeZone);
	const candidates = [...new Set([before, after])]
		.map((offset) => wallClock - offset)
		.filter((t) => utcToZonedLocal(new Date(t), timeZone) === local)
		.sort((a, b) => a - b);
	if (candidates.length > 0) return new Date(candidates[0]);
	// Spring gap: interpret with the pre-transition offset, which lands just after the gap.
	return new Date(wallClock - before);
}
