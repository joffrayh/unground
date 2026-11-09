import { fail, redirect } from '@sveltejs/kit';
import {
	beanOptions,
	chooseId,
	dripperOptions,
	grinderOptions,
	newBrewValues
} from '#lib/components/brews/brew-values.ts';
import { utcToZonedLocal } from '#lib/domain/derive.ts';
import { BREW_MULTI, parseBrewForm } from '#lib/domain/schemas.ts';
import { db } from '#lib/server/db/index.ts';
import { domainFailure, formValues, notFound, requireUser } from '#lib/server/http.ts';
import { listBeans } from '#lib/server/services/beans.ts';
import { createBrew, getBrew, getLatestBrew, type Brew } from '#lib/server/services/brews.ts';
import { listDrippers } from '#lib/server/services/drippers.ts';
import { listGrinders } from '#lib/server/services/grinders.ts';
import { listScales } from '#lib/server/services/scales.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const { searchParams } = event.url;
	const [allBeans, allGrinders, allDrippers, allScales] = await Promise.all([
		listBeans(db, user.id),
		listGrinders(db, user.id),
		listDrippers(db, user.id),
		listScales(db, user.id)
	]);
	const scales = allScales.map(({ id, name }) => ({ id, name }));
	const beans = beanOptions(allBeans);
	const grinders = grinderOptions(allGrinders);
	const drippers = dripperOptions(allDrippers);
	const brewedAt = utcToZonedLocal(new Date(), user.timezone);

	if (beans.length === 0 || grinders.length === 0) {
		return {
			setup: { hasBean: beans.length > 0, hasGrinder: grinders.length > 0 },
			beans,
			grinders,
			drippers,
			scales,
			values: newBrewValues(null, brewedAt),
			copiedFrom: null
		};
	}

	// D15: copy the brew asked for, else the latest one.
	const from = searchParams.get('from');
	let template: Brew | null;
	if (from) {
		try {
			template = await getBrew(db, user.id, from);
		} catch (e) {
			notFound(e);
		}
	} else {
		template = await getLatestBrew(db, user.id);
	}

	const values = newBrewValues(template, brewedAt);
	// The catalogue pages come back with ?bean= / ?grinder=; an archived template bean falls back too.
	values.beanId = prefer(searchParams.get('bean'), values.beanId, beans);
	values.grinderId = prefer(searchParams.get('grinder'), values.grinderId, grinders);
	// The dripper is optional: an archived or unknown one falls back to "not recorded". A first brew
	// starts on the first dripper, as it does on the first grinder.
	const wantedDripper =
		searchParams.get('dripper') ?? (template ? values.dripperId : (drippers[0]?.id ?? ''));
	values.dripperId = drippers.some((d) => d.id === wantedDripper) ? wantedDripper : '';
	// A grind setting only means something on its own grinder (D2): the form only offers the
	// template's grind as a placeholder (and suggestion) while that grinder is picked.
	const grinderReset = !!template && values.grinderId !== template.grinderId;

	return {
		setup: null,
		beans,
		grinders,
		drippers,
		scales,
		values,
		copiedFrom: template
			? {
					id: template.id,
					brewedAt: template.brewedAt,
					timezone: template.timezone,
					beanName: template.beanName,
					explicit: !!from,
					beanReset: values.beanId !== template.beanId && !searchParams.has('bean'),
					grinderReset,
					grinderName: template.grinderName
				}
			: null
	};
};

/** The requested id when it is an option, else the current one if it is, else the first option. */
function prefer(wanted: string | null, current: string, opts: readonly { id: string }[]): string {
	return chooseId(opts.some((o) => o.id === wanted) ? wanted : current, opts);
}

export const actions: Actions = {
	default: async (event) => {
		const user = requireUser(event);
		const fd = await event.request.formData();
		const parsed = parseBrewForm(fd, user.timezone);
		const values = formValues(fd, BREW_MULTI);
		if (!parsed.ok) return fail(400, { errors: parsed.errors, values });
		let id: string;
		try {
			({ id } = await createBrew(
				db,
				user.id,
				parsed.data.brew,
				parsed.data.rating,
				parsed.data.plan
			));
		} catch (e) {
			return domainFailure(e, values);
		}
		redirect(303, `/brews/${id}`);
	}
};
