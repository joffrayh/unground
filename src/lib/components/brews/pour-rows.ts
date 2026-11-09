/**
 * Pour-editor logic (D12, D26, D27), kept pure so it can be tested and shared by the server load and the
 * editor.
 *
 * A row is what the brewer types: the timer reading when the pour starts and the scale reading after
 * it, plus whether the pour is a bloom. Pour 0's start is fixed at 0:00. On a new brew each row also
 * carries the previous brew's readings as placeholders; a blank cell saves its placeholder, so every
 * calculation here uses the *effective* value (typed, else placeholder), exactly as the server does.
 * The server (parseBrewForm) is the authority; this only drives the live amounts, total and ratio.
 */
import { brewRatio } from '#lib/domain/derive.ts';
import {
	formatDuration,
	parseDuration,
	pourName,
	roundTenth,
	type PourEntry
} from '#lib/domain/pours.ts';

export interface PourRow {
	time: string;
	scale: string;
	bloom: boolean;
	/**
	 * Placeholders (posted as `pourTimeDefault` / `pourScaleDefault`): the previous brew's readings, or
	 * after a failed submit without JavaScript, the time estimates the form was showing.
	 */
	defaultTime: string;
	defaultScale: string;
}

export const FIRST_POUR_TIME = '0:00';

export const blankRow = (bloom = false): PourRow => ({
	time: '',
	scale: '',
	bloom,
	defaultTime: '',
	defaultScale: ''
});

/** Rows holding saved readings (editing a brew). */
export function rowsFromEntries(entries: readonly PourEntry[]): PourRow[] {
	return entries.map((e) => ({
		...blankRow(e.bloom),
		time: formatDuration(e.startS),
		scale: String(e.cumulativeG)
	}));
}

/** Blank rows with another brew's readings as placeholders (a new brew, D26). */
export function placeholderRowsFromEntries(entries: readonly PourEntry[]): PourRow[] {
	return entries.map((e) => ({
		...blankRow(e.bloom),
		defaultTime: formatDuration(e.startS),
		defaultScale: String(e.cumulativeG)
	}));
}

export interface PostedPours {
	times: readonly string[];
	scales: readonly string[];
	timeDefaults?: readonly string[];
	scaleDefaults?: readonly string[];
	/** Each row's id (`pourRow`); the bloom and drop boxes post these. Positions when missing. */
	rowIds?: readonly string[];
	bloom?: readonly string[];
	drop?: readonly string[];
}

/** Rebuilds the rows from a submitted form, leaving out the rows ticked "drop". */
export function rowsFromValues(p: PostedPours): PourRow[] {
	const n = Math.max(p.times.length, p.scales.length);
	const rows: PourRow[] = [];
	for (let i = 0; i < n; i++) {
		const id = p.rowIds?.[i] ?? String(i);
		if (p.drop?.includes(id)) continue;
		rows.push({
			time: p.times[i] ?? '',
			scale: p.scales[i] ?? '',
			bloom: p.bloom?.includes(id) ?? false,
			defaultTime: p.timeDefaults?.[i] ?? '',
			defaultScale: p.scaleDefaults?.[i] ?? ''
		});
	}
	return rows;
}

/** The scale reading that counts for a row: typed, else its placeholder. */
export function effectiveScale(row: PourRow): string {
	return row.scale.trim() || row.defaultScale;
}

/**
 * A row with nothing in it: no typed time and no scale reading, typed or placeholder. A time
 * placeholder alone doesn't make a pour (the server ignores it too), and pour 0's time is fixed.
 * (The server never skips pour 0, but it can't save it without a scale reading either.)
 */
export function isBlank(row: PourRow, index: number): boolean {
	const noTime = index === 0 || row.time.trim() === '';
	return noTime && effectiveScale(row) === '';
}

/**
 * Pads the rows to at least `min`, with at least `spare` blank rows after pour 0 at the end, so the
 * form stays usable without JavaScript.
 */
export function withSpareRows(rows: readonly PourRow[], spare = 1, min = 1): PourRow[] {
	const out = rows.map((r) => ({ ...r }));
	let trailing = 0;
	for (let i = out.length - 1; i >= 1 && isBlank(out[i], i); i--) trailing++;
	while (trailing < spare || out.length < Math.max(min, 1)) {
		out.push(blankRow());
		if (out.length > 1) trailing++;
	}
	return out;
}

/** The rows without their trailing blank ones, keeping at least `min` rows (pour 0 always stays). */
export function trimSpareRows<T extends PourRow>(rows: readonly T[], min = 1): T[] {
	let end = rows.length;
	while (end > Math.max(min, 1) && isBlank(rows[end - 1], end - 1)) end--;
	return rows.slice(0, end);
}

/** "15,5" → 15.5; null for blank or not a number. */
export function parseGrams(input: string | number | null | undefined): number | null {
	if (typeof input === 'number') return Number.isFinite(input) ? input : null;
	const s = (input ?? '').trim().replace(',', '.');
	if (s === '') return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}

export interface RowInfo {
	label: string;
	/** Water added by this pour (g), or null when its scale reading is blank or unreadable. */
	added: number | null;
	/** The row can't be right as it stands (time or scale not after the previous pour, bad time). */
	problem: boolean;
	/**
	 * Timer placeholder: the previous brew's reading, else extrapolated from the pours above. A blank
	 * time saves it (the editor posts it as `pourTimeDefault`).
	 */
	timePlaceholder: string;
	/** Effective start (s) and scale reading (g), null when blank or unreadable. */
	startS: number | null;
	scaleG: number | null;
}

/** The live totals the brew form shares with its next-time card. */
export interface PourStats {
	/** Pours with something in them, typed or placeholder. */
	count: number;
	totalG: number | null;
	ratio: number | null;
}

export interface PourSummary {
	rows: RowInfo[];
	/** Rows with something in them, typed or placeholder. */
	count: number;
	/** Last scale reading (the running total), or null when there is none yet. */
	totalG: number | null;
	ratio: number | null;
}

/** Pours are named from 0 (D27). */
export const rowLabel = pourName;

export function summarizePours(
	rows: readonly PourRow[],
	dose: string | number | null | undefined
): PourSummary {
	const infos: RowInfo[] = [];
	let prevScale = 0;
	let prevTime: number | null = null;
	/**
	 * The clock the estimates run on: it also moves through blank rows, so spare rows on a first brew
	 * read 0:45, 1:30, … rather than all 0:45 (without JavaScript those are what gets posted).
	 */
	let clock: number | null = null;
	let clockStep: number | null = null;
	let totalG: number | null = null;
	let count = 0;

	rows.forEach((row, i) => {
		const blank = isBlank(row, i);
		if (!blank) count++;

		let timePlaceholder = '';
		if (i === 0) timePlaceholder = FIRST_POUR_TIME;
		else if (row.defaultTime) timePlaceholder = row.defaultTime;
		else if (clock !== null) timePlaceholder = formatDuration(clock + (clockStep ?? 45));

		// What the server will read: typed, else the placeholder (pour 0 always starts at 0:00).
		const timeText = i === 0 ? FIRST_POUR_TIME : blank ? '' : row.time.trim() || timePlaceholder;
		const scaleText = effectiveScale(row);
		const time = timeText === '' ? null : parseDuration(timeText);
		const scale = parseGrams(scaleText);
		const added = scale === null ? null : roundTenth(scale - prevScale);

		let problem = false;
		if (!blank) {
			if (timeText !== '' && time === null) problem = true;
			if (time !== null && prevTime !== null && i > 0 && time <= prevTime) problem = true;
			if (scaleText !== '' && (scale === null || (added !== null && added <= 0))) problem = true;
		}

		infos.push({
			label: rowLabel(i),
			added,
			problem,
			timePlaceholder,
			startS: time,
			scaleG: scale
		});

		if (scale !== null) {
			prevScale = scale;
			totalG = roundTenth(scale);
		}
		// Pour 0 always starts the clock, even before its scale reading is typed.
		if (time !== null && (!blank || i === 0)) prevTime = time;
		// A blank row moves the estimate clock on by its own estimate; a time that goes backwards doesn't.
		const at = time ?? (timePlaceholder === '' ? null : parseDuration(timePlaceholder));
		if (at !== null && (clock === null || at > clock)) {
			if (clock !== null) clockStep = at - clock;
			clock = at;
		}
	});

	const doseG = parseGrams(dose);
	return {
		rows: infos,
		count,
		totalG,
		ratio: doseG === null || totalG === null ? null : brewRatio(doseG, totalG)
	};
}

/** What a pour is planned to do: start time (s) and the running total to reach (g). */
export interface PourTarget {
	startS: number | null;
	cumulativeG: number;
}

/** The pours that have a target, in order. Blank rows have none and the server skips them too. */
export function pourTargets(summary: PourSummary): PourTarget[] {
	return summary.rows.flatMap((r) =>
		r.scaleG === null ? [] : [{ startS: r.startS, cumulativeG: r.scaleG }]
	);
}

/**
 * Which row a server `errors.pours` message is about, so that row can be marked invalid. The server
 * names pours from 0 by the rows it kept: pour 0 always counts (its time is posted as 0:00) and blank
 * rows are skipped. Returns null when the message isn't about one row.
 */
export function errorRowIndex(
	rows: readonly PourRow[],
	message: string | undefined
): number | null {
	if (!message) return null;
	const m = /^Pour (\d+)/.exec(message);
	if (!m) return /at least one pour/i.test(message) ? 0 : null;
	const n = Number(m[1]);
	if (n === 0) return 0;
	let seen = 0;
	for (let i = 1; i < rows.length; i++) {
		if (isBlank(rows[i], i)) continue;
		seen++;
		if (seen === n) return i;
	}
	return null;
}
