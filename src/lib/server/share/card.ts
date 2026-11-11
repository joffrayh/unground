/**
 * The shareable image of a rated brew (D54): rating, bean, recipe, pours and taste profile, drawn as a
 * satori element tree. Pure: `brewCard` picks the values, `cardTree` lays them out; render.ts turns the
 * tree into a PNG.
 */
import { createHash } from 'node:crypto';
import logoSvg from '#lib/assets/logo-full-dark.svg?raw';
import {
	labelPlacement,
	pointFor,
	polar,
	polygonPoints,
	valueRadius
} from '#lib/components/radar.ts';
import type { RadarGeometry } from '#lib/components/radar.ts';
import { brewRatio } from '#lib/domain/derive.ts';
import { formatDuration, pourName, poursToEntries } from '#lib/domain/pours.ts';
import { RATING_DIMENSIONS, label } from '#lib/domain/vocab.ts';
import type { Brew } from '#lib/server/services/brews.ts';
import { formatDateTime, grams, ratioText } from '#lib/ui/format.ts';

/** Bump when the layout changes, so browsers drop their cached copies. */
const CARD_VERSION = 3;

export interface Card {
	overall: number;
	bean: string;
	roaster: string;
	brewedAt: string;
	facts: { name: string; value: string; sub?: string }[];
	pours: { name: string; bloom: boolean; scale: string; time: string }[];
	totalTime: string;
	profile: { name: string; value: number | null }[];
}

/** The card's values for a rated brew. */
export function brewCard(brew: Brew & { rating: NonNullable<Brew['rating']> }): Card {
	const entries = poursToEntries(brew.details.pours);
	const unit = brew.grinderSettingUnit ? ` ${brew.grinderSettingUnit}` : '';
	return {
		overall: brew.rating.overall,
		bean: brew.beanName,
		roaster: brew.roasterName,
		brewedAt: formatDateTime(brew.brewedAt, brew.timezone),
		facts: [
			{ name: 'Dose', value: grams(brew.doseG) },
			{ name: 'Water', value: grams(brew.waterG) },
			{
				name: 'Ratio',
				value: ratioText(brew.waterG > 0 ? brewRatio(brew.doseG, brew.waterG) : null)
			},
			{ name: 'Temperature', value: `${brew.waterTempC} °C` },
			{ name: 'Grind', value: `${brew.grindSetting}${unit}`, sub: brew.grinderName },
			{
				name: 'Dripper',
				value: brew.dripperName ?? '—',
				sub: brew.dripperMaterial ? label(brew.dripperMaterial) : undefined
			}
		],
		pours: entries.map((p, i) => ({
			name: pourName(i),
			bloom: p.bloom,
			scale: i === 0 ? grams(p.cumulativeG) : String(p.cumulativeG),
			time: formatDuration(p.startS)
		})),
		totalTime: formatDuration(brew.totalTimeS),
		profile: RATING_DIMENSIONS.map((d) => ({ name: label(d), value: brew.rating[d] ?? null }))
	};
}

/** An ETag for the card: the same values (and layout) give the same image. */
export function cardTag(card: Card): string {
	const hash = createHash('sha256')
		.update(JSON.stringify([CARD_VERSION, card]))
		.digest('base64url');
	return `"${hash.slice(0, 27)}"`;
}

/** A download name like `unground-ethiopia-guji.png`. */
export function cardFilename(card: Card): string {
	const slug = card.bean
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 40);
	return `unground${slug ? `-${slug}` : ''}.png`;
}

// --- Layout -------------------------------------------------------------------------------------

/** A satori element: React's shape, without React. */
export interface Node {
	type: string;
	props: { style?: Style; children?: Child | Child[]; [attr: string]: unknown };
}
type Child = Node | string;
type Style = Record<string, string | number>;

function h(type: string, style: Style, ...children: (Child | null | false)[]): Node {
	const kids = children.filter((c): c is Child => c != null && c !== false);
	return { type, props: { style: { display: 'flex', ...style }, children: kids } };
}

/** The dark palette (D36), the brand's own look and legible in either chat theme. */
const C = {
	bg: '#101118',
	surface: '#181c24',
	surface2: '#2a3240',
	text: '#ffffff',
	cream: '#f4ebde',
	muted: '#b4bac6',
	border: '#2a3240',
	accent: '#faa956',
	accentInk: '#febd7b',
	accentSoft: 'rgba(250, 169, 86, 0.14)'
};

/** Card width in CSS pixels: about a phone's, so text reads at app size when the image is opened. */
export const CARD_WIDTH = 420;
const PAD = 16;

function card(...children: (Child | null | false)[]): Node {
	return h(
		'div',
		{
			flexDirection: 'column',
			padding: PAD,
			borderRadius: 18,
			background: C.surface,
			border: `1px solid ${C.border}`
		},
		...children
	);
}

function heading(text: string): Node {
	return h('div', { fontFamily: 'Corben', fontSize: 18, marginBottom: 8 }, text);
}

function scoreBadge(overall: number): Node {
	return h(
		'div',
		{
			alignItems: 'center',
			justifyContent: 'center',
			flexShrink: 0,
			// Content-box, like everything in satori: 56 wide in all with the padding.
			minWidth: 32,
			height: 40,
			paddingLeft: 12,
			paddingRight: 12,
			borderRadius: 999,
			border: `2px solid ${C.accent}`,
			background: C.accentSoft,
			color: C.cream,
			fontSize: 20,
			fontWeight: 700,
			lineHeight: 1
		},
		String(overall)
	);
}

function facts(items: Card['facts']): Node {
	return card(
		h(
			'div',
			{ flexWrap: 'wrap', rowGap: 12 },
			...items.map((f) =>
				h(
					'div',
					{ flexDirection: 'column', width: '33.33%' },
					h('div', { fontSize: 13, color: C.muted }, f.name),
					h('div', { fontSize: 16 }, f.value),
					f.sub ? h('div', { fontSize: 12.5, color: C.muted }, f.sub) : null
				)
			)
		)
	);
}

function pours(rows: Card['pours'], total: string): Node {
	const row = (cells: [Child, Child, Child], style: Style = {}) =>
		h(
			'div',
			{ alignItems: 'center', paddingTop: 4, paddingBottom: 4, ...style },
			h('div', { flex: 1.4, alignItems: 'center' }, cells[0]),
			h('div', { flex: 1 }, cells[1]),
			h('div', { flex: 1, justifyContent: 'flex-end' }, cells[2])
		);
	return card(
		heading('Pours'),
		row(['Pour', 'Scale', 'Time'], {
			fontSize: 13,
			color: C.muted,
			borderBottom: `1px solid ${C.border}`
		}),
		...rows.map((p, i) =>
			row(
				[
					h(
						'div',
						{ alignItems: 'center' },
						p.name,
						p.bloom
							? h(
									'div',
									{
										marginLeft: 6,
										paddingLeft: 8,
										paddingRight: 8,
										paddingBottom: 1,
										borderRadius: 999,
										background: C.surface2,
										fontSize: 12
									},
									'bloom'
								)
							: null
					),
					p.scale,
					p.time
				],
				{ fontSize: 15, paddingTop: i === 0 ? 8 : 4 }
			)
		),
		row(['Total draw', '', h('div', { fontWeight: 700 }, total)], {
			fontSize: 17,
			paddingTop: 10,
			borderTop: `1px solid ${C.border}`,
			marginTop: 6
		})
	);
}

// The radar, as RadarChart.svelte draws it read-only: same geometry and viewBox. The shapes are an
// SVG image; the labels are laid out here so satori turns them into outlines with the card's font.
const G: RadarGeometry = { radius: 90, inner: 19 };
const VIEW = { x: -170, y: -138, w: 332, h: 274 };
const LABEL_W = 110;

function radarSvg(values: (number | null)[]): string {
	const n = values.length;
	const rings = [2, 4, 6, 8, 10]
		.map((v) => `<circle r="${valueRadius(v, G)}" fill="none" stroke="${C.border}"/>`)
		.join('');
	const spokes = values
		.map((_, i) => {
			const e = polar(i, n, G.radius);
			return `<line x1="0" y1="0" x2="${e.x}" y2="${e.y}" stroke="${C.border}"/>`;
		})
		.join('');
	const rated = values.some((v) => v != null);
	const shape = rated
		? `<polygon points="${polygonPoints(values, G)}" fill="${C.accent}" fill-opacity="0.16" stroke="${C.accentInk}" stroke-width="2" stroke-linejoin="round"/>`
		: '';
	const dots = values
		.map((v, i) => {
			if (v == null) {
				const p = polar(i, n, G.inner / 2);
				return `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${C.surface}" stroke="${C.muted}" stroke-width="1.5"/>`;
			}
			const p = pointFor(i, v, n, G);
			return `<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="${C.accentInk}" stroke="${C.surface}" stroke-width="2"/>`;
		})
		.join('');
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}" ` +
		`width="${VIEW.w}" height="${VIEW.h}">${rings}${spokes}${shape}${dots}</svg>`
	);
}

function radar(profile: Card['profile']): Node {
	const n = profile.length;
	const values = profile.map((p) => p.value);
	const src = `data:image/svg+xml;base64,${Buffer.from(radarSvg(values)).toString('base64')}`;
	const labels = profile.map((p, i) => {
		const place = labelPlacement(i, n, G.radius + 10);
		// Baselines as in RadarChart.svelte; each line box is 17 high with its baseline about 13 down.
		const nameBaseline =
			place.vertical === 'above'
				? place.y - 21
				: place.vertical === 'below'
					? place.y + 13
					: place.y - 1;
		const x = place.x - VIEW.x;
		const left =
			place.anchor === 'start' ? x : place.anchor === 'end' ? x - LABEL_W : x - LABEL_W / 2;
		const align =
			place.anchor === 'start' ? 'flex-start' : place.anchor === 'end' ? 'flex-end' : 'center';
		const unset = p.value == null;
		return h(
			'div',
			{
				position: 'absolute',
				left,
				top: nameBaseline - VIEW.y - 13,
				width: LABEL_W,
				flexDirection: 'column',
				alignItems: align,
				lineHeight: '17px',
				color: unset ? C.muted : C.text
			},
			h('div', { fontSize: 14 }, p.name),
			h('div', { fontSize: 15, fontWeight: unset ? 400 : 700 }, unset ? '–' : String(p.value))
		);
	});
	return card(
		heading('Taste profile'),
		h(
			'div',
			{ justifyContent: 'center' },
			h(
				'div',
				{ position: 'relative', width: VIEW.w, height: VIEW.h },
				{ type: 'img', props: { src, width: VIEW.w, height: VIEW.h } },
				...labels
			)
		)
	);
}

/** The whole image. */
export function cardTree(c: Card): Node {
	return h(
		'div',
		{
			flexDirection: 'column',
			// Satori sizes boxes content-box, so the padding comes out of the width here.
			width: CARD_WIDTH - 2 * PAD,
			padding: PAD,
			rowGap: 12,
			background: C.bg,
			color: C.text,
			fontFamily: 'Lato',
			fontSize: 16
		},
		h(
			'div',
			{ alignItems: 'center', columnGap: 14, paddingTop: 4, paddingBottom: 4 },
			h(
				'div',
				{ flexDirection: 'column', flex: 1, minWidth: 0 },
				h('div', { fontFamily: 'Corben', fontSize: 22, lineHeight: 1.2 }, c.bean),
				h('div', { fontSize: 14, color: C.muted, marginTop: 2 }, `${c.roaster} · ${c.brewedAt}`)
			),
			scoreBadge(c.overall)
		),
		facts(c.facts),
		pours(c.pours, c.totalTime),
		radar(c.profile),
		h(
			'div',
			{ justifyContent: 'flex-end' },
			{
				type: 'img',
				props: { src: LOGO, width: LOGO_H * (731 / 188), height: LOGO_H }
			}
		)
	);
}

/** The full wordmark in its dark-theme colours (D35), 731 × 188. */
const LOGO = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;
const LOGO_H = 26;
