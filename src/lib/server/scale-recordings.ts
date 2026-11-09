/** Saves scale recordings to a folder on the machine running the app (`SCALE_RECORDINGS_DIR`). */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
	MAX_RECORDING_SAMPLES,
	RECORDING_EVENT_KINDS,
	RECORDING_VERSION,
	type ScaleRecording
} from '../scale/recording';

const MAX_LOG_ENTRIES = 5000;
const number = z.number().finite();

export const recordingSchema: z.ZodType<ScaleRecording> = z.object({
	version: z.literal(RECORDING_VERSION),
	label: z.string().max(100),
	startedAt: z.iso.datetime(),
	durationMs: z.number().int().nonnegative(),
	scale: z.string().max(200),
	flowSmoothing: z.boolean().nullable(),
	samples: z.array(z.tuple([number, number, number, number])).max(MAX_RECORDING_SAMPLES),
	marks: z.array(z.object({ atMs: number, label: z.string().max(40) })).max(MAX_LOG_ENTRIES),
	events: z
		.array(
			z.object({
				atMs: number,
				kind: z.enum(RECORDING_EVENT_KINDS),
				detail: z.string().max(200)
			})
		)
		.max(MAX_LOG_ENTRIES)
});

/** "20261109-100000-pulse-pours": sorts by time, and the label can't leave the folder. */
export function recordingBaseName(recording: Pick<ScaleRecording, 'label' | 'startedAt'>): string {
	const stamp = recording.startedAt.slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
	const slug = recording.label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
	return slug ? `${stamp}-${slug}` : stamp;
}

const isFileExists = (e: unknown) => (e as NodeJS.ErrnoException).code === 'EEXIST';

/** Never overwrites: a repeated name gets a number. Returns the file's name. */
export async function saveRecording(dir: string, recording: ScaleRecording): Promise<string> {
	await mkdir(dir, { recursive: true });
	const base = recordingBaseName(recording);
	for (let n = 1; ; n++) {
		const name = `${base}${n === 1 ? '' : `-${n}`}.json`;
		try {
			await writeFile(join(dir, name), JSON.stringify(recording) + '\n', { flag: 'wx' });
			return name;
		} catch (e) {
			if (!isFileExists(e)) throw e;
		}
	}
}
