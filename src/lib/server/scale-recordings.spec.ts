import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ScaleRecording } from '../scale/recording';
import { recordingBaseName, recordingSchema, saveRecording } from './scale-recordings';

const recording: ScaleRecording = {
	version: 1,
	label: 'Pulse pours',
	startedAt: '2026-11-09T10:00:00.000Z',
	durationMs: 1000,
	scale: 'BOOKOO',
	flowSmoothing: true,
	samples: [[0, 0, 0, 0]],
	marks: [{ atMs: 10, label: 'Swirl' }],
	events: [{ atMs: 20, kind: 'command', detail: '03 0A 01 00 00 08' }]
};

describe('recordingBaseName', () => {
	it('starts with the time and ends with the label', () => {
		expect(recordingBaseName(recording)).toBe('20261109-100000-pulse-pours');
	});
	it('leaves out an empty label', () => {
		expect(recordingBaseName({ ...recording, label: ' !! ' })).toBe('20261109-100000');
	});
	it('cannot be steered out of the folder', () => {
		expect(recordingBaseName({ ...recording, label: '../../etc/passwd' })).toBe(
			'20261109-100000-etc-passwd'
		);
	});
});

describe('recordingSchema', () => {
	it('accepts a recording', () => {
		expect(recordingSchema.safeParse(recording).success).toBe(true);
	});
	it.each([
		['a wrong version', { ...recording, version: 2 }],
		['a malformed sample', { ...recording, samples: [[0, 0, 0]] }],
		['a sample that is not a number', { ...recording, samples: [[0, 0, 'x', 0]] }],
		['an unknown event kind', { ...recording, events: [{ atMs: 0, kind: 'x', detail: '' }] }],
		['a bad date', { ...recording, startedAt: 'yesterday' }]
	])('rejects %s', (_name, value) => {
		expect(recordingSchema.safeParse(value).success).toBe(false);
	});
});

describe('saveRecording', () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'scale-recordings-'));
	});
	afterEach(() => rm(dir, { recursive: true, force: true }));

	it('writes the recording, creating the folder', async () => {
		const nested = join(dir, 'a', 'b');
		const name = await saveRecording(nested, recording);
		expect(name).toBe('20261109-100000-pulse-pours.json');
		expect(JSON.parse(await readFile(join(nested, name), 'utf8'))).toEqual(recording);
	});

	it('never overwrites a recording', async () => {
		expect(await saveRecording(dir, recording)).toBe('20261109-100000-pulse-pours.json');
		expect(await saveRecording(dir, recording)).toBe('20261109-100000-pulse-pours-2.json');
		expect(await readdir(dir)).toHaveLength(2);
	});
});
