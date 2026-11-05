import { localDate } from '#lib/domain/derive.ts';
import { db } from '#lib/server/db/index.ts';
import { requireUser } from '#lib/server/http.ts';
import { brewsCsv } from '#lib/server/services/export.ts';
import type { RequestHandler } from './$types';

/** brews.csv for Stage 2 analysis (concept.md D14), named with today's date in the user's zone. */
export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	const csv = await brewsCsv(db, user.id);
	const date = localDate(new Date(), user.timezone);
	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="coffee-brews-${date}.csv"`,
			'cache-control': 'no-store'
		}
	});
};
