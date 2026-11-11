import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Brew } from '#lib/server/services/brews.ts';
import { brewCard, cardFilename, cardTag } from './card.ts';
import { renderCard } from './render.ts';

type RatedBrew = Brew & { rating: NonNullable<Brew['rating']> };

function rated(overrides: Partial<RatedBrew> = {}): RatedBrew {
	return {
		id: 'b1',
		method: 'v60',
		brewedAt: new Date('2026-11-03T08:15:00Z'),
		timezone: 'Europe/London',
		beanId: 'bean',
		beanName: 'Guji Hambela Ñano',
		roasterName: 'Square Mile',
		roastDate: '2026-10-20',
		grinderName: 'Comandante C40',
		grinderSettingUnit: 'clicks',
		grindSetting: 24,
		doseG: 15,
		waterG: 250,
		waterTempC: 94,
		totalTimeS: 185,
		overall: 8,
		grinderId: 'g',
		dripperId: 'd',
		dripperName: 'Hario V60 02',
		dripperMaterial: 'ceramic',
		scaleId: null,
		agitation: 3,
		storedFrozen: false,
		changed: [],
		notes: null,
		details: {
			filterType: 'paper_bleached',
			pours: [
				{ volumeG: 45, intervalS: 0, bloom: true },
				{ volumeG: 105, intervalS: 45, bloom: false },
				{ volumeG: 100, intervalS: 30, bloom: false }
			]
		},
		rating: {
			overall: 8,
			acidity: 7,
			sweetness: 8,
			body: 5,
			bitterness: 2,
			astringency: null,
			clarity: 9,
			aftertaste: null,
			perceivedNotes: [],
			comment: null,
			updatedAt: new Date('2026-11-03T09:00:00Z')
		},
		plan: null,
		...overrides
	} as RatedBrew;
}

describe('brew card', () => {
	it('keeps the shared fields and leaves out roast age, filter and agitation', () => {
		const card = brewCard(rated());
		expect(card.overall).toBe(8);
		expect(card.brewedAt).toBe('Tue 3 Nov, 08:15');
		expect(card.facts.map((f) => f.name)).toEqual([
			'Dose',
			'Water',
			'Ratio',
			'Temperature',
			'Grind',
			'Dripper'
		]);
		expect(card.facts[4]).toEqual({ name: 'Grind', value: '24 clicks', sub: 'Comandante C40' });
		expect(card.pours.map((p) => [p.scale, p.time, p.bloom])).toEqual([
			['45 g', '0:00', true],
			['150', '0:45', false],
			['250', '1:15', false]
		]);
		expect(card.totalTime).toBe('3:05');
	});

	it('tags the same values the same way', () => {
		expect(cardTag(brewCard(rated()))).toBe(cardTag(brewCard(rated())));
		expect(cardTag(brewCard(rated()))).not.toBe(cardTag(brewCard(rated({ waterTempC: 93 }))));
	});

	it('names the file after the bean', () => {
		expect(cardFilename(brewCard(rated()))).toBe('unground-guji-hambela-nano.png');
		expect(cardFilename(brewCard(rated({ beanName: '耶加雪菲' })))).toBe('unground.png');
	});

	it('renders a PNG', async () => {
		const png = await renderCard(brewCard(rated()));
		expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
		if (process.env.CARD_OUT) writeFileSync(process.env.CARD_OUT, png);
	});
});
