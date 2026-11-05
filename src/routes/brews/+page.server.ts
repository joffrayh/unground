import { db } from '#lib/server/db/index.ts';
import { notFound, requireUser } from '#lib/server/http.ts';
import { getBean } from '#lib/server/services/beans.ts';
import { listBrews, type BrewPage } from '#lib/server/services/brews.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const before = event.url.searchParams.get('before');
	const beanId = event.url.searchParams.get('bean') || undefined;

	let page: BrewPage;
	let bean: { id: string; name: string; roasterName: string } | null = null;
	try {
		[page, bean] = await Promise.all([
			listBrews(db, user.id, { before, beanId }),
			beanId ? getBean(db, user.id, beanId) : null
		]);
	} catch (e) {
		notFound(e);
	}

	return {
		brews: page.brews,
		nextCursor: page.nextCursor,
		older: !!before,
		bean: bean && { id: bean.id, name: bean.name, roasterName: bean.roasterName }
	};
};
