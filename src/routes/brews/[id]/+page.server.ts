import { fail, redirect } from '@sveltejs/kit';
import { parsePlanForm, parseRatingForm } from '#lib/domain/schemas.ts';
import { db } from '#lib/server/db/index.ts';
import { domainFailure, formValues, notFound, requireUser } from '#lib/server/http.ts';
import { getBean } from '#lib/server/services/beans.ts';
import {
	deleteBrew,
	getBrew,
	getPreviousRating,
	savePlan,
	saveRating,
	type Brew
} from '#lib/server/services/brews.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	let brew: Brew;
	try {
		brew = await getBrew(db, user.id, event.params.id);
	} catch (e) {
		notFound(e);
	}
	const [bean, previousRating] = await Promise.all([
		getBean(db, user.id, brew.beanId),
		brew.rating ? null : getPreviousRating(db, user.id, brew)
	]);
	return {
		brew,
		previousRating,
		claimed: { notes: bean.roasterNotes, raw: bean.roasterNotesRaw }
	};
};

/** A failure from domainFailure, tagged with the form it belongs to. */
function failureFor(target: string, e: unknown, values: Record<string, unknown>) {
	const failure = domainFailure(e, values);
	return fail(failure.status, { ...failure.data, target });
}

/**
 * The rating and plan forms share this page, so their failures carry a `target` naming the form, and
 * each form shows only its own errors.
 */
export const actions: Actions = {
	rate: async (event) => {
		const target = 'rate';
		const user = requireUser(event);
		const { id } = event.params;
		const fd = await event.request.formData();
		const values = formValues(fd, ['perceivedNotes']);
		let rating = null;
		if (fd.get('intent') !== 'remove') {
			const parsed = parseRatingForm(fd);
			if (!parsed.ok) return fail(400, { target, errors: parsed.errors, values });
			if (!parsed.data) {
				return fail(400, {
					target,
					errors: { overall: 'Pick an overall score to save the rating' },
					values
				});
			}
			rating = parsed.data;
		}
		try {
			await saveRating(db, user.id, id, rating);
		} catch (e) {
			return failureFor(target, e, values);
		}
		redirect(303, `/brews/${id}#rate`);
	},

	plan: async (event) => {
		const target = 'plan';
		const user = requireUser(event);
		const { id } = event.params;
		const fd = await event.request.formData();
		const values = formValues(fd);
		let plan = null;
		if (fd.get('intent') !== 'remove') {
			const parsed = parsePlanForm(fd);
			if (!parsed.ok) return fail(400, { target, errors: parsed.errors, values });
			plan = parsed.data;
		}
		try {
			await savePlan(db, user.id, id, plan);
		} catch (e) {
			return failureFor(target, e, values);
		}
		redirect(303, `/brews/${id}#next`);
	},

	delete: async (event) => {
		const user = requireUser(event);
		try {
			await deleteBrew(db, user.id, event.params.id);
		} catch (e) {
			return domainFailure(e);
		}
		redirect(303, '/brews');
	}
};
