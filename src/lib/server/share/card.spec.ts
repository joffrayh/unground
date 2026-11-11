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
	it('sums up the recipe and leaves out roast age and filter', () => {
		const card = brewCard(rated());
		expect(card.overall).toBe(8);
		expect(card.brewedAt).toBe('Tue 3 Nov, 08:15');
		expect(card.facts.map((f) => [f.name, f.value])).toEqual([
			['Dose', '15 g'],
			['Water', '250 g'],
			['Ratio', '1:16.7'],
			['Temperature', '94 °C'],
			['Grind', '24 clicks'],
			['Dripper', 'Hario V60 02'],
			['Pours', '3'],
			['Drawdown', '3:05'],
			['Agitation', '3 / 5']
		]);
		expect(card.facts[4].sub).toBe('Comandante C40');
		expect(brewCard(rated({ agitation: null })).facts[8].value).toBe('—');
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
