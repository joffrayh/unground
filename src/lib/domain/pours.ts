/**
 * Pour entry ⇄ storage conversion (D12).
 *
 * The brewer types what they see mid-brew: the timer reading when each pour starts and the scale's
 * running total after it. Storage keeps the spec's shape: per-pour volume and the interval since the
 * previous pour started (the first pour starts the brew, so its interval is 0).
 *
 * Pours are shown and named from 0 ("Pour 0", "Pour 1", …); any of them can be ticked as a bloom (D27).
 */

export interface PourEntry {
	/** Timer reading when this pour starts, in seconds from brew start. */
	startS: number;
	/** Scale reading (running total of water, g) after this pour. */
	cumulativeG: number;
	bloom: boolean;
}

export interface Pour {
	volumeG: number;
	intervalS: number;
	bloom: boolean;
}

/** "Pour 0", "Pour 1", …: pours are numbered from 0 everywhere they are shown (D27). */
export function pourName(index: number): string {
	return `Pour ${index}`;
}

export type PourResult = { ok: true; pours: Pour[] } | { ok: false; error: string };

/** Round to 0.1 g so float arithmetic never leaks into stored values. */
export function roundTenth(x: number): number {
	return Math.round(x * 10) / 10;
}

/** Parses "m:ss", "mm:ss" or plain seconds. Returns null for anything else. */
export function parseDuration(input: string): number | null {
	const s = input.trim();
	if (s === '') return null;
	const clock = /^(\d{1,3}):([0-5]\d)$/.exec(s);
	if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
	if (/^\d{1,5}$/.test(s)) return Number(s);
	return null;
}

export function formatDuration(totalSeconds: number): string {
	const m = Math.floor(totalSeconds / 60);
	const s = totalSeconds % 60;
	return `${m}:${String(s).padStart(2, '0')}`;
}

export function entriesToPours(entries: PourEntry[]): PourResult {
	if (entries.length === 0) return { ok: false, error: 'Add at least one pour.' };
	if (entries[0].startS !== 0) {
		return { ok: false, error: `${pourName(0)} starts the brew, so it must start at 0:00.` };
	}
	const pours: Pour[] = [];
	let prev: PourEntry | null = null;
	for (const [i, raw] of entries.entries()) {
		const name = pourName(i);
		// Round first, so readings that differ only past 0.1 g can't yield a 0 g pour.
		const entry = { ...raw, cumulativeG: roundTenth(raw.cumulativeG) };
		if (!Number.isInteger(entry.startS) || entry.startS < 0) {
			return { ok: false, error: `${name}: start time must be a whole number of seconds.` };
		}
		if (!Number.isFinite(entry.cumulativeG) || entry.cumulativeG <= 0) {
			return { ok: false, error: `${name}: scale reading must be more than 0 g.` };
		}
		if (prev && entry.startS <= prev.startS) {
			return { ok: false, error: `${name} must start after ${pourName(i - 1).toLowerCase()}.` };
		}
		if (prev && entry.cumulativeG <= prev.cumulativeG) {
			return {
				ok: false,
				error: `${name}: scale reading must be higher than ${pourName(i - 1).toLowerCase()} (${prev.cumulativeG} g).`
			};
		}
		pours.push({
			volumeG: roundTenth(entry.cumulativeG - (prev?.cumulativeG ?? 0)),
			intervalS: entry.startS - (prev?.startS ?? 0),
			bloom: entry.bloom
		});
		prev = entry;
	}
	return { ok: true, pours };
}

export function poursToEntries(pours: Pour[]): PourEntry[] {
	let startS = 0;
	let cumulativeG = 0;
	return pours.map((p) => {
		startS += p.intervalS;
		cumulativeG = roundTenth(cumulativeG + p.volumeG);
		return { startS, cumulativeG, bloom: p.bloom };
	});
}

export function totalWater(pours: Pour[]): number {
	return roundTenth(pours.reduce((sum, p) => sum + p.volumeG, 0));
}
