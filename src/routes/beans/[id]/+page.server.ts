import { redirect } from '@sveltejs/kit';
import { bagLeft, roastAgeDays } from '#lib/domain/derive.ts';
import { db } from '#lib/server/db/index.ts';
import { domainFailure, notFound, requireUser } from '#lib/server/http.ts';
import { deleteBean, getBean, setBeanArchived, type Bean } from '#lib/server/services/beans.ts';
import { listBrews } from '#lib/server/services/brews.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	let bean: Bean;
	try {
		bean = await getBean(db, user.id, event.params.id);
	} catch (e) {
		notFound(e);
	}
	const { brews } = await listBrews(db, user.id, { beanId: bean.id, limit: 10 });
	// No brews with this bean yet: "brews left" assumes the user's latest dose overall.
	const fallbackDoseG =
		bean.lastDoseG == null && bean.bagWeightG != null
			? ((await listBrews(db, user.id, { limit: 1 })).brews[0]?.doseG ?? null)
			: null;
	return {
		bean,
		bag: bagLeft(bean.bagWeightG, bean.usedG, bean.lastDoseG ?? fallbackDoseG),
		roastAge: roastAgeDays(bean.roastDate, new Date(), user.timezone),
		brews
	};
};

export const actions: Actions = {
	/** Sets the archived state sent by the button (idempotent, unlike a blind toggle). */
	archive: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const archived = fd.get('archived') === '1';
		try {
			await setBeanArchived(db, user.id, event.params.id, archived);
		} catch (e) {
			return domainFailure(e);
		}
		return { archived };
	},
	delete: async (event) => {
		const user = requireUser(event);
		try {
			await deleteBean(db, user.id, event.params.id);
		} catch (e) {
			// A bean with brews can't be deleted: the message says to archive it instead.
			return domainFailure(e);
		}
		redirect(303, '/beans');
	}
};
