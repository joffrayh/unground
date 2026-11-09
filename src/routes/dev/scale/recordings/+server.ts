import { error, json } from '@sveltejs/kit';
import { SCALE_RECORDINGS_DIR } from '$app/env/private';
import { requireUser } from '#lib/server/http.ts';
import { recordingSchema, saveRecording } from '#lib/server/scale-recordings.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	requireUser(event);
	if (!SCALE_RECORDINGS_DIR) error(404, 'Not found');
	const body: unknown = await event.request.json().catch(() => null);
	const parsed = recordingSchema.safeParse(body);
	if (!parsed.success) error(400, 'Invalid recording');
	return json({ file: await saveRecording(SCALE_RECORDINGS_DIR, parsed.data) });
};
