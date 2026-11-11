/**
 * Turns a card (card.ts) into a PNG in memory: satori lays it out as SVG with the text as outlines,
 * resvg rasterises it. Nothing is written to disk (D54).
 */
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import corben from '@fontsource/corben/files/corben-latin-400-normal.woff?inline';
import corbenExt from '@fontsource/corben/files/corben-latin-ext-400-normal.woff?inline';
import lato from '@fontsource/lato/files/lato-latin-400-normal.woff?inline';
import latoBold from '@fontsource/lato/files/lato-latin-700-normal.woff?inline';
import latoExt from '@fontsource/lato/files/lato-latin-ext-400-normal.woff?inline';
import latoBoldExt from '@fontsource/lato/files/lato-latin-ext-700-normal.woff?inline';
import { CARD_WIDTH, cardTree, type Card } from './card.ts';

/** Pixels per CSS pixel in the PNG: sharp on a phone opened full screen. */
const SCALE = 3;

/** The fonts are inlined into the server bundle (base64), since @fontsource isn't deployed. */
function font(name: string, weight: 400 | 700, dataUrl: string) {
	const data = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
	return { name, weight, style: 'normal' as const, data };
}

let fonts: ReturnType<typeof font>[] | undefined;

export async function renderCard(card: Card): Promise<Uint8Array<ArrayBuffer>> {
	fonts ??= [
		font('Lato', 400, lato),
		font('Lato', 700, latoBold),
		font('Lato', 400, latoExt),
		font('Lato', 700, latoBoldExt),
		font('Corben', 400, corben),
		font('Corben', 400, corbenExt)
	];
	const svg = await satori(cardTree(card), { width: CARD_WIDTH, fonts });
	const png = new Resvg(svg, {
		fitTo: { mode: 'zoom', value: SCALE },
		font: { loadSystemFonts: false }
	})
		.render()
		.asPng();
	return new Uint8Array(png);
}
