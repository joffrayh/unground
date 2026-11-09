import { SCALE_RECORDINGS_DIR } from '$app/env/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ canSave: !!SCALE_RECORDINGS_DIR });
