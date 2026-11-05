import { bagLeft } from '#lib/domain/derive.ts';
import { db } from '#lib/server/db/index.ts';
import { requireUser } from '#lib/server/http.ts';
import { listBeans } from '#lib/server/services/beans.ts';
import { countBrews, listBrews } from '#lib/server/services/brews.ts';
import { listGrinders } from '#lib/server/services/grinders.ts';
import type { PageServerLoad } from './$types';

/** How far back "waiting for a rating" looks: a rating from memory a week later is weak data. */
const RECENT = 20;

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const [beans, grinders, total, recent] = await Promise.all([
		listBeans(db, user.id),
		listGrinders(db, user.id),
		countBrews(db, user.id),
		listBrews(db, user.id, { limit: RECENT })
	]);
	// A bean with no brews yet assumes the user's latest dose overall (the newest of `recent`).
	const latestDoseG = recent.brews[0]?.doseG ?? null;
	const bags = beans.flatMap((b) => {
		const left = bagLeft(b.bagWeightG, b.usedG, b.lastDoseG ?? latestDoseG);
		if (!left || b.bagWeightG == null || left.remainingG <= 0) return [];
		return [
			{
				id: b.id,
				name: b.name,
				roasterName: b.roasterName,
				bagWeightG: b.bagWeightG,
				...left,
				/** The dose is the user's latest overall, not this bean's: say which one it assumes. */
				assumedDose: b.lastDoseG == null
			}
		];
	});
	return {
		hasBean: beans.length > 0,
		bags,
		/** Active beans without a bag weight, for the "add bag weights" nudge. */
		unweighedCount: beans.filter((b) => b.bagWeightG == null).length,
		hasGrinder: grinders.length > 0,
		total,
		latest: recent.brews.slice(0, 5),
		unrated: recent.brews.filter((b) => b.overall == null).slice(0, 5)
	};
};
