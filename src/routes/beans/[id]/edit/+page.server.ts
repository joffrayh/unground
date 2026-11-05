import { fail, redirect } from '@sveltejs/kit';
import { localDate } from '#lib/domain/derive.ts';
import { parseBeanForm } from '#lib/domain/schemas.ts';
import { db } from '#lib/server/db/index.ts';
import { domainFailure, formValues, notFound, requireUser } from '#lib/server/http.ts';
import { getBean, updateBean, type Bean } from '#lib/server/services/beans.ts';
import { listRoasters } from '#lib/server/services/roasters.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	let bean: Bean;
	try {
		bean = await getBean(db, user.id, event.params.id);
	} catch (e) {
		notFound(e);
	}
	const roasters = await listRoasters(db, user.id);
	return {
		bean,
		roasters: roasters.map((r) => r.name),
		today: localDate(new Date(), user.timezone)
	};
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const parsed = parseBeanForm(fd);
		const values = formValues(fd, ['roasterNotes']);
		if (!parsed.ok) return fail(400, { errors: parsed.errors, values });
		try {
			await updateBean(db, user.id, event.params.id, parsed.data);
		} catch (e) {
			return domainFailure(e, values);
		}
		redirect(303, `/beans/${event.params.id}`);
	}
};
