import { error } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { notFound, requireUser } from '#lib/server/http.ts';
import { getBrew, type Brew } from '#lib/server/services/brews.ts';
import { brewCard, cardFilename, cardTag } from '#lib/server/share/card.ts';
import { renderCard } from '#lib/server/share/render.ts';
import type { RequestHandler } from './$types';

/**
 * A rated brew as an image to share (D54). Rendered per request and never stored; the ETag lets the
 * browser reuse its copy until the brew or rating changes, without rendering again.
 */
export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	let brew: Brew;
	try {
		brew = await getBrew(db, user.id, event.params.id);
	} catch (e) {
		notFound(e);
	}
	const { rating } = brew;
	if (!rating) error(404, 'Not rated');

	const card = brewCard({ ...brew, rating });
	const etag = cardTag(card);
	const headers = { etag, 'cache-control': 'private, no-cache' };
	if (event.request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers });
	}
	const png = await renderCard(card);
	return new Response(png, {
		headers: {
			...headers,
			'content-type': 'image/png',
			'content-disposition': `inline; filename="${cardFilename(card)}"`
		}
	});
};
