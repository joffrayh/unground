import { fail, redirect } from '@sveltejs/kit';
import { localDate } from '#lib/domain/derive.ts';
import { parseBeanForm } from '#lib/domain/schemas.ts';
import { db } from '#lib/server/db/index.ts';
import { domainFailure, formValues, requireUser, safeReturnPath } from '#lib/server/http.ts';
import { createBean } from '#lib/server/services/beans.ts';
import { listRoasters } from '#lib/server/services/roasters.ts';
import { withParam } from '../helpers.ts';
import type { Actions, PageServerLoad } from './$types';

/** `?return=<path>`: where to go after creating the bean (e.g. back to the brew form), or null. */
function returnPath(url: URL): string | null {
	return safeReturnPath(url.searchParams.get('return'), '') || null;
}

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const roasters = await listRoasters(db, user.id);
	return {
		roasters: roasters.map((r) => r.name),
		today: localDate(new Date(), user.timezone),
		returnTo: returnPath(event.url)
	};
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const parsed = parseBeanForm(fd);
		const values = formValues(fd, ['roasterNotes']);
		if (!parsed.ok) return fail(400, { errors: parsed.errors, values });
		let id: string;
		try {
			({ id } = await createBean(db, user.id, parsed.data));
		} catch (e) {
			return domainFailure(e, values);
		}
		const back = returnPath(event.url);
		redirect(303, back ? withParam(back, 'bean', id) : `/beans/${id}`);
	}
};
