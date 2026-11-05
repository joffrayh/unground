import { fail, redirect } from '@sveltejs/kit';
import {
	beanOptions,
	dripperOptions,
	editValues,
	grinderOptions
} from '#lib/components/brews/brew-values.ts';
import { utcToZonedLocal } from '#lib/domain/derive.ts';
import { BREW_MULTI, parseBrewForm } from '#lib/domain/schemas.ts';
import { db } from '#lib/server/db/index.ts';
import { domainFailure, formValues, notFound, requireUser } from '#lib/server/http.ts';
import { listBeans } from '#lib/server/services/beans.ts';
import { getBrew, updateBrew, type Brew } from '#lib/server/services/brews.ts';
import { listDrippers } from '#lib/server/services/drippers.ts';
import { listGrinders } from '#lib/server/services/grinders.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	let brew: Brew;
	try {
		brew = await getBrew(db, user.id, event.params.id);
	} catch (e) {
		notFound(e);
	}
	const [allBeans, allGrinders, allDrippers] = await Promise.all([
		listBeans(db, user.id, { includeArchived: true }),
		listGrinders(db, user.id, { includeArchived: true }),
		listDrippers(db, user.id, { includeArchived: true })
	]);
	return {
		brew: {
			id: brew.id,
			beanName: brew.beanName,
			brewedAt: brew.brewedAt,
			timezone: brew.timezone
		},
		// The brew's own bean and grinder stay pickable even when archived.
		beans: beanOptions(allBeans, [brew.beanId]),
		grinders: grinderOptions(allGrinders, [brew.grinderId]),
		drippers: dripperOptions(allDrippers, brew.dripperId ? [brew.dripperId] : []),
		values: editValues(brew, utcToZonedLocal(brew.brewedAt, brew.timezone)),
		showZone: brew.timezone !== user.timezone
	};
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireUser(event);
		const { id } = event.params;
		let brew: Brew;
		try {
			brew = await getBrew(db, user.id, id);
		} catch (e) {
			notFound(e);
		}
		const fd = await event.request.formData();
		// Brewed-at is local time where the brew was logged, not where the user is now.
		const parsed = parseBrewForm(fd, brew.timezone);
		const values = formValues(fd, BREW_MULTI);
		if (!parsed.ok) return fail(400, { errors: parsed.errors, values });
		try {
			// A blank rating (or next-time) section removes the rating (or plan).
			await updateBrew(db, user.id, id, parsed.data.brew, parsed.data.rating, parsed.data.plan);
		} catch (e) {
			return domainFailure(e, values);
		}
		redirect(303, `/brews/${id}`);
	}
};
