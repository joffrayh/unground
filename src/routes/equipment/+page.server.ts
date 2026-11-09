import { fail, redirect } from '@sveltejs/kit';
import {
	parseDripperForm,
	parseGrinderForm,
	parseRoasterForm,
	parseScaleForm
} from '#lib/domain/schemas.ts';
import { db } from '#lib/server/db/index.ts';
import { domainFailure, formValues, requireUser, safeReturnPath } from '#lib/server/http.ts';
import {
	createDripper,
	deleteDripper,
	listDrippers,
	setDripperArchived,
	updateDripper
} from '#lib/server/services/drippers.ts';
import {
	createGrinder,
	deleteGrinder,
	listGrinders,
	setGrinderArchived,
	updateGrinder
} from '#lib/server/services/grinders.ts';
import {
	deleteRoaster,
	listRoasters,
	setRoasterArchived,
	updateRoaster
} from '#lib/server/services/roasters.ts';
import {
	createScale,
	deleteScale,
	listScales,
	setScaleArchived,
	updateScale
} from '#lib/server/services/scales.ts';
import { activeFirst, withParam } from '../beans/helpers.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * Many small forms share this page, so every result carries a `target` naming the form it belongs to
 * ('newGrinder', 'grinder:<id>', 'newDripper', 'dripper:<id>', 'newScale', 'scale:<id>', 'roaster:<id>'); the page shows errors next to that form only.
 */

/** `?return=<path>`: where to go after adding a grinder or dripper (e.g. the brew form), or null. */
function returnPath(url: URL): string | null {
	return safeReturnPath(url.searchParams.get('return'), '') || null;
}

function idOf(fd: FormData): string {
	const id = fd.get('id');
	return typeof id === 'string' ? id : '';
}

/** `domainFailure` (404 / conflict / check violation) tagged with the form it belongs to. */
function failureFor(target: string, e: unknown, values?: Record<string, unknown>) {
	const failure = domainFailure(e, values);
	return fail(failure.status, { ...failure.data, target });
}

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const [grinders, drippers, scales, roasters] = await Promise.all([
		listGrinders(db, user.id, { includeArchived: true }),
		listDrippers(db, user.id, { includeArchived: true }),
		listScales(db, user.id, { includeArchived: true }),
		listRoasters(db, user.id, { includeArchived: true })
	]);
	return {
		grinders: activeFirst(grinders),
		drippers: activeFirst(drippers),
		scales: activeFirst(scales),
		roasters: activeFirst(roasters),
		returnTo: returnPath(event.url)
	};
};

export const actions: Actions = {
	createGrinder: async (event) => {
		const user = requireUser(event);
		const target = 'newGrinder';
		const fd = await event.request.formData();
		const parsed = parseGrinderForm(fd);
		const values = formValues(fd);
		if (!parsed.ok) return fail(400, { target, errors: parsed.errors, values });
		let id: string;
		try {
			({ id } = await createGrinder(db, user.id, parsed.data));
		} catch (e) {
			return failureFor(target, e, values);
		}
		const back = returnPath(event.url);
		if (back) redirect(303, withParam(back, 'grinder', id));
		return { target, created: id };
	},

	updateGrinder: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const id = idOf(fd);
		const target = `grinder:${id}`;
		const parsed = parseGrinderForm(fd);
		const values = formValues(fd);
		if (!parsed.ok) return fail(400, { target, errors: parsed.errors, values });
		try {
			await updateGrinder(db, user.id, id, parsed.data);
		} catch (e) {
			return failureFor(target, e, values);
		}
		return { target };
	},

	archiveGrinder: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const id = idOf(fd);
		const target = `grinder:${id}`;
		try {
			await setGrinderArchived(db, user.id, id, fd.get('archived') === '1');
		} catch (e) {
			return failureFor(target, e);
		}
		return { target };
	},

	deleteGrinder: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const id = idOf(fd);
		const target = `grinder:${id}`;
		try {
			await deleteGrinder(db, user.id, id);
		} catch (e) {
			return failureFor(target, e);
		}
		return { target };
	},

	createDripper: async (event) => {
		const user = requireUser(event);
		const target = 'newDripper';
		const fd = await event.request.formData();
		const parsed = parseDripperForm(fd);
		const values = formValues(fd);
		if (!parsed.ok) return fail(400, { target, errors: parsed.errors, values });
		let id: string;
		try {
			({ id } = await createDripper(db, user.id, parsed.data));
		} catch (e) {
			return failureFor(target, e, values);
		}
		const back = returnPath(event.url);
		if (back) redirect(303, withParam(back, 'dripper', id));
		return { target, created: id };
	},

	updateDripper: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const id = idOf(fd);
		const target = `dripper:${id}`;
		const parsed = parseDripperForm(fd);
		const values = formValues(fd);
		if (!parsed.ok) return fail(400, { target, errors: parsed.errors, values });
		try {
			await updateDripper(db, user.id, id, parsed.data);
		} catch (e) {
			return failureFor(target, e, values);
		}
		return { target };
	},

	archiveDripper: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const id = idOf(fd);
		const target = `dripper:${id}`;
		try {
			await setDripperArchived(db, user.id, id, fd.get('archived') === '1');
		} catch (e) {
			return failureFor(target, e);
		}
		return { target };
	},

	deleteDripper: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const id = idOf(fd);
		const target = `dripper:${id}`;
		try {
			await deleteDripper(db, user.id, id);
		} catch (e) {
			return failureFor(target, e);
		}
		return { target };
	},

	createScale: async (event) => {
		const user = requireUser(event);
		const target = 'newScale';
		const fd = await event.request.formData();
		const parsed = parseScaleForm(fd);
		const values = formValues(fd);
		if (!parsed.ok) return fail(400, { target, errors: parsed.errors, values });
		let id: string;
		try {
			({ id } = await createScale(db, user.id, parsed.data));
		} catch (e) {
			return failureFor(target, e, values);
		}
		return { target, created: id };
	},

	updateScale: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const id = idOf(fd);
		const target = `scale:${id}`;
		const parsed = parseScaleForm(fd);
		const values = formValues(fd);
		if (!parsed.ok) return fail(400, { target, errors: parsed.errors, values });
		try {
			await updateScale(db, user.id, id, parsed.data);
		} catch (e) {
			return failureFor(target, e, values);
		}
		return { target };
	},

	archiveScale: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const id = idOf(fd);
		const target = `scale:${id}`;
		try {
			await setScaleArchived(db, user.id, id, fd.get('archived') === '1');
		} catch (e) {
			return failureFor(target, e);
		}
		return { target };
	},

	deleteScale: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const id = idOf(fd);
		const target = `scale:${id}`;
		try {
			await deleteScale(db, user.id, id);
		} catch (e) {
			return failureFor(target, e);
		}
		return { target };
	},

	updateRoaster: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const id = idOf(fd);
		const target = `roaster:${id}`;
		const parsed = parseRoasterForm(fd);
		const values = formValues(fd);
		if (!parsed.ok) return fail(400, { target, errors: parsed.errors, values });
		try {
			await updateRoaster(db, user.id, id, parsed.data);
		} catch (e) {
			return failureFor(target, e, values);
		}
		return { target };
	},

	archiveRoaster: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const id = idOf(fd);
		const target = `roaster:${id}`;
		try {
			await setRoasterArchived(db, user.id, id, fd.get('archived') === '1');
		} catch (e) {
			return failureFor(target, e);
		}
		return { target };
	},

	deleteRoaster: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const id = idOf(fd);
		const target = `roaster:${id}`;
		try {
			await deleteRoaster(db, user.id, id);
		} catch (e) {
			return failureFor(target, e);
		}
		return { target };
	}
};
