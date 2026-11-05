import { describe, expect, it } from 'vitest';
import {
	FLAVORS,
	FLAVOR_ALIASES,
	FLAVOR_BY_ID,
	childrenOf,
	flavorPath,
	isFlavorId,
	searchFlavors
} from './flavors';

/** Every id the first vocabulary shipped with. Stored tags use them, so none may go or change. */
const SHIPPED_IDS = [
	'floral',
	'floral.black_tea',
	'floral.floral',
	'floral.floral.chamomile',
	'floral.floral.rose',
	'floral.floral.jasmine',
	'fruity',
	'fruity.berry',
	'fruity.berry.blackberry',
	'fruity.berry.raspberry',
	'fruity.berry.blueberry',
	'fruity.berry.strawberry',
	'fruity.dried_fruit',
	'fruity.dried_fruit.raisin',
	'fruity.dried_fruit.prune',
	'fruity.other_fruit',
	'fruity.other_fruit.coconut',
	'fruity.other_fruit.cherry',
	'fruity.other_fruit.pomegranate',
	'fruity.other_fruit.pineapple',
	'fruity.other_fruit.grape',
	'fruity.other_fruit.apple',
	'fruity.other_fruit.peach',
	'fruity.other_fruit.pear',
	'fruity.citrus_fruit',
	'fruity.citrus_fruit.grapefruit',
	'fruity.citrus_fruit.orange',
	'fruity.citrus_fruit.lemon',
	'fruity.citrus_fruit.lime',
	'sour_fermented',
	'sour_fermented.sour',
	'sour_fermented.sour.sour_aromatics',
	'sour_fermented.sour.acetic_acid',
	'sour_fermented.sour.butyric_acid',
	'sour_fermented.sour.isovaleric_acid',
	'sour_fermented.sour.citric_acid',
	'sour_fermented.sour.malic_acid',
	'sour_fermented.alcohol_fermented',
	'sour_fermented.alcohol_fermented.winey',
	'sour_fermented.alcohol_fermented.whiskey',
	'sour_fermented.alcohol_fermented.fermented',
	'sour_fermented.alcohol_fermented.overripe',
	'green_vegetative',
	'green_vegetative.olive_oil',
	'green_vegetative.raw',
	'green_vegetative.green_vegetative',
	'green_vegetative.green_vegetative.under_ripe',
	'green_vegetative.green_vegetative.peapod',
	'green_vegetative.green_vegetative.fresh',
	'green_vegetative.green_vegetative.dark_green',
	'green_vegetative.green_vegetative.vegetative',
	'green_vegetative.green_vegetative.hay_like',
	'green_vegetative.green_vegetative.herb_like',
	'green_vegetative.beany',
	'other',
	'other.papery_musty',
	'other.papery_musty.stale',
	'other.papery_musty.cardboard',
	'other.papery_musty.papery',
	'other.papery_musty.woody',
	'other.papery_musty.moldy_damp',
	'other.papery_musty.musty_dusty',
	'other.papery_musty.musty_earthy',
	'other.papery_musty.animalic',
	'other.papery_musty.meaty_brothy',
	'other.papery_musty.phenolic',
	'other.chemical',
	'other.chemical.bitter',
	'other.chemical.salty',
	'other.chemical.medicinal',
	'other.chemical.petroleum',
	'other.chemical.skunky',
	'other.chemical.rubber',
	'roasted',
	'roasted.pipe_tobacco',
	'roasted.tobacco',
	'roasted.burnt',
	'roasted.burnt.acrid',
	'roasted.burnt.ashy',
	'roasted.burnt.smoky',
	'roasted.burnt.brown_roast',
	'roasted.cereal',
	'roasted.cereal.grain',
	'roasted.cereal.malt',
	'spices',
	'spices.pungent',
	'spices.pepper',
	'spices.brown_spice',
	'spices.brown_spice.anise',
	'spices.brown_spice.nutmeg',
	'spices.brown_spice.cinnamon',
	'spices.brown_spice.clove',
	'nutty_cocoa',
	'nutty_cocoa.nutty',
	'nutty_cocoa.nutty.peanuts',
	'nutty_cocoa.nutty.hazelnut',
	'nutty_cocoa.nutty.almond',
	'nutty_cocoa.cocoa',
	'nutty_cocoa.cocoa.chocolate',
	'nutty_cocoa.cocoa.dark_chocolate',
	'sweet',
	'sweet.brown_sugar',
	'sweet.brown_sugar.molasses',
	'sweet.brown_sugar.maple_syrup',
	'sweet.brown_sugar.caramelized',
	'sweet.brown_sugar.honey',
	'sweet.vanilla',
	'sweet.vanillin',
	'sweet.overall_sweet',
	'sweet.sweet_aromatics'
];

const ids = (q: string, opts?: Parameters<typeof searchFlavors>[1]) =>
	searchFlavors(q, opts).map((f) => f.id);

describe('flavor vocabulary', () => {
	it('has the nine wheel categories, then Character (D29)', () => {
		expect(childrenOf(null).map((f) => f.name)).toEqual([
			'Floral',
			'Fruity',
			'Sour/Fermented',
			'Green/Vegetative',
			'Other',
			'Roasted',
			'Spices',
			'Nutty/Cocoa',
			'Sweet',
			'Character'
		]);
	});

	it('has unique ids, and every parent comes before its children', () => {
		expect(new Set(FLAVORS.map((f) => f.id)).size).toBe(FLAVORS.length);
		const seen = new Set<string>();
		for (const f of FLAVORS) {
			if (f.parentId) expect(seen.has(f.parentId)).toBe(true);
			seen.add(f.id);
		}
	});

	it('encodes the hierarchy in the id and tier', () => {
		const blueberry = FLAVOR_BY_ID.get('fruity.berry.blueberry');
		expect(blueberry).toMatchObject({ name: 'Blueberry', parentId: 'fruity.berry', tier: 3 });
		expect(flavorPath('fruity.berry.blueberry')).toEqual(['Fruity', 'Berry', 'Blueberry']);
		for (const f of FLAVORS) {
			expect(f.id.split('.').length).toBe(f.tier);
			if (f.parentId) expect(f.id.startsWith(f.parentId + '.')).toBe(true);
		}
	});

	it('keeps every id it has shipped', () => {
		for (const id of SHIPPED_IDS) expect(isFlavorId(id), id).toBe(true);
	});

	it('has unique names under each parent, and no tier deeper than 3', () => {
		const seen = new Set<string>();
		for (const f of FLAVORS) {
			const key = `${f.parentId}/${f.name.toLowerCase()}`;
			expect(seen.has(key), key).toBe(false);
			seen.add(key);
			expect(f.tier).toBeLessThanOrEqual(3);
		}
	});

	it('finds new notes by name and by alias', () => {
		expect(ids('bergamot')[0]).toBe('fruity.citrus_fruit.bergamot');
		expect(ids('cacao')[0]).toBe('nutty_cocoa.cocoa');
		expect(ids('tea-like')[0]).toBe('character.body.tea_like');
		expect(ids('creme brulee')[0]).toBe('sweet.dessert.creme_brulee');
	});

	it('gives aliases only to notes that exist, and finds every note by its own name', () => {
		for (const id of Object.keys(FLAVOR_ALIASES)) expect(isFlavorId(id), id).toBe(true);
		for (const f of FLAVORS) expect(ids(f.name, { limit: 400 }), f.id).toContain(f.id);
	});

	it('validates ids', () => {
		expect(isFlavorId('nutty_cocoa.cocoa.chocolate')).toBe(true);
		expect(isFlavorId('chocolate')).toBe(false);
	});
});

describe('searchFlavors', () => {
	it('finds nothing for a blank query', () => {
		expect(ids('')).toEqual([]);
		expect(ids('  ')).toEqual([]);
	});

	it('puts an exact name first, then names starting with the query', () => {
		expect(ids('blueberry')[0]).toBe('fruity.berry.blueberry');
		expect(ids('berry')[0]).toBe('fruity.berry');
		expect(ids('choc').slice(0, 2)).toEqual([
			'nutty_cocoa.cocoa.chocolate',
			'nutty_cocoa.cocoa.dark_chocolate'
		]);
	});

	it('ignores case, accents and punctuation', () => {
		expect(ids('CHOCOLATE')[0]).toBe('nutty_cocoa.cocoa.chocolate');
		expect(ids('chocolaté')[0]).toBe('nutty_cocoa.cocoa.chocolate');
		expect(ids('sour/ferm')[0]).toBe('sour_fermented');
	});

	it('finds the notes under a matching category, after the category itself', () => {
		const citrus = ids('citrus', { limit: 50 });
		expect(citrus[0]).toBe('fruity.citrus_fruit');
		expect(citrus).toContain('fruity.citrus_fruit.lemon');
	});

	it('matches inside a name only from three letters', () => {
		expect(ids('erry', { limit: 50 })).toContain('fruity.berry.blackberry');
		expect(ids('er', { limit: 50 })).not.toContain('fruity.berry.blackberry');
	});

	it('leaves out what is already picked, and stops at the limit', () => {
		expect(ids('blueberry', { exclude: ['fruity.berry.blueberry'] })).not.toContain(
			'fruity.berry.blueberry'
		);
		expect(ids('a', { limit: 3 })).toHaveLength(3);
	});
});
