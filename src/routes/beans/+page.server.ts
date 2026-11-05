import { bagLeft, roastAgeDays } from '#lib/domain/derive.ts';
import { db } from '#lib/server/db/index.ts';
import { requireUser } from '#lib/server/http.ts';
import { listBeans } from '#lib/server/services/beans.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const showArchived = event.url.searchParams.get('archived') === '1';
	// Always fetch archived too (they sort last), so the page can say how many are hidden.
	const all = await listBeans(db, user.id, { includeArchived: true });
	const now = new Date();
	const beans = all
		.filter((b) => showArchived || b.archivedAt == null)
		.map((b) => ({
			...b,
			roastAge: roastAgeDays(b.roastDate, now, user.timezone),
			bag: bagLeft(b.bagWeightG, b.usedG, b.lastDoseG)
		}));
	return {
		beans,
		showArchived,
		archivedCount: all.filter((b) => b.archivedAt != null).length
	};
};
