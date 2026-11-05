/**
 * Tasting-note vocabulary (D5, D29): the tiers of the SCA / WCR Coffee Taster's Flavor Wheel, extended
 * with notes that recur on roaster pages and cupping forms, and a tier-1 "Character" for body, acidity
 * and finish words roasters list as notes.
 *
 * Only the descriptor hierarchy is used, as a tag vocabulary; the wheel's visual design is not reproduced.
 * Ids are dotted paths ("fruity.berry.blueberry") so exported data is self-describing and Stage 2 can
 * roll a tag up to any tier with a prefix match. Ids are stored in the database: never rename or remove
 * one (flavors.spec.ts pins every shipped id); add new notes under the most fitting existing node.
 */

type Tree = { [name: string]: Tree | null };

const WHEEL: Tree = {
	Floral: {
		'Black Tea': {
			'Earl Grey': null,
			'Iced Tea': null,
			Darjeeling: null
		},
		Floral: {
			Chamomile: null,
			Rose: null,
			Jasmine: null,
			'Orange Blossom': null,
			Honeysuckle: null,
			Lavender: null,
			Hibiscus: null,
			Elderflower: null,
			Lilac: null,
			Violet: null,
			Magnolia: null,
			'Coffee Blossom': null,
			'Cherry Blossom': null,
			'Rose Hip': null,
			Geranium: null,
			Gardenia: null,
			'White Flowers': null,
			Lily: null,
			Orchid: null
		},
		'Green Tea': null,
		'White Tea': null,
		Oolong: null,
		Rooibos: null
	},
	Fruity: {
		Berry: {
			Blackberry: null,
			Raspberry: null,
			Blueberry: null,
			Strawberry: null,
			'Black Currant': null,
			'Red Currant': null,
			Cranberry: null,
			Gooseberry: null,
			Mulberry: null,
			Boysenberry: null,
			Elderberry: null,
			'Goji Berry': null,
			'Forest Fruit': null,
			Huckleberry: null,
			Lingonberry: null
		},
		'Dried Fruit': {
			Raisin: null,
			Prune: null,
			Fig: null,
			Date: null,
			'Dried Apricot': null,
			'Dried Cherry': null,
			'Golden Raisin': null,
			'Dried Mango': null
		},
		'Other Fruit': {
			Coconut: null,
			Cherry: null,
			Pomegranate: null,
			Pineapple: null,
			Grape: null,
			Apple: null,
			Peach: null,
			Pear: null,
			'Stone Fruit': null,
			Apricot: null,
			Nectarine: null,
			Plum: null,
			Pluot: null,
			Mirabelle: null,
			'White Peach': null,
			'Yellow Peach': null,
			'Black Cherry': null,
			'Sour Cherry': null,
			'Rainier Cherry': null,
			Melon: null,
			Honeydew: null,
			Cantaloupe: null,
			Watermelon: null,
			'Green Apple': null,
			'Red Apple': null,
			'Baked Apple': null,
			Quince: null,
			Rhubarb: null,
			Persimmon: null,
			Tomato: null,
			'White Grape': null,
			'Red Grape': null,
			'Concord Grape': null,
			Muscat: null,
			'Prickly Pear': null,
			'Asian Pear': null
		},
		'Citrus Fruit': {
			Grapefruit: null,
			Orange: null,
			Lemon: null,
			Lime: null,
			Bergamot: null,
			Tangerine: null,
			Mandarin: null,
			Clementine: null,
			'Blood Orange': null,
			Yuzu: null,
			Kumquat: null,
			Pomelo: null,
			'Meyer Lemon': null,
			'Key Lime': null,
			'Lemon Zest': null,
			'Orange Zest': null,
			Lemonade: null,
			Marmalade: null,
			'Candied Orange': null,
			Calamansi: null,
			Tangelo: null
		},
		'Tropical Fruit': {
			Mango: null,
			'Passion Fruit': null,
			Papaya: null,
			Guava: null,
			Lychee: null,
			Banana: null,
			Kiwi: null,
			'Dragon Fruit': null,
			Mangosteen: null,
			'Star Fruit': null,
			Tamarind: null,
			Jackfruit: null,
			Soursop: null,
			Lulo: null,
			'Tree Tomato': null,
			Rambutan: null,
			Longan: null,
			Plantain: null
		},
		'Red Fruit': null,
		'Dark Fruit': null,
		'Fruit Punch': null,
		Jam: null
	},
	'Sour/Fermented': {
		Sour: {
			'Sour Aromatics': null,
			'Acetic Acid': null,
			'Butyric Acid': null,
			'Isovaleric Acid': null,
			'Citric Acid': null,
			'Malic Acid': null,
			'Lactic Acid': null,
			'Tartaric Acid': null,
			'Phosphoric Acid': null
		},
		'Alcohol/Fermented': {
			Winey: null,
			Whiskey: null,
			Fermented: null,
			Overripe: null,
			'Red Wine': null,
			'White Wine': null,
			Rum: null,
			Brandy: null,
			Liqueur: null,
			Boozy: null,
			Champagne: null,
			Cider: null,
			Kombucha: null,
			Yogurt: null,
			Sake: null
		}
	},
	'Green/Vegetative': {
		'Olive Oil': null,
		Raw: null,
		'Green/Vegetative': {
			'Under-ripe': null,
			Peapod: null,
			Fresh: null,
			'Dark Green': null,
			Vegetative: null,
			'Hay-like': null,
			'Herb-like': null,
			Mint: null,
			Basil: null,
			Thyme: null,
			Sage: null,
			Rosemary: null,
			Tarragon: null,
			Lemongrass: null,
			'Lemon Verbena': null,
			'Lemon Balm': null,
			Eucalyptus: null,
			Grassy: null,
			'Bell Pepper': null,
			Potato: null,
			Cucumber: null
		},
		Beany: null
	},
	Other: {
		'Papery/Musty': {
			Stale: null,
			Cardboard: null,
			Papery: null,
			Woody: null,
			'Moldy/Damp': null,
			'Musty/Dusty': null,
			'Musty/Earthy': null,
			Animalic: null,
			'Meaty Brothy': null,
			Phenolic: null,
			Baggy: null
		},
		Chemical: {
			Bitter: null,
			Salty: null,
			Medicinal: null,
			Petroleum: null,
			Skunky: null,
			Rubber: null,
			Metallic: null,
			Rioy: null
		},
		Savory: null,
		Mineral: null,
		Cedar: null,
		Sandalwood: null,
		Oak: null,
		Pine: null,
		Leather: null
	},
	Roasted: {
		'Pipe Tobacco': null,
		Tobacco: null,
		Burnt: {
			Acrid: null,
			Ashy: null,
			Smoky: null,
			'Brown, Roast': null
		},
		Cereal: {
			Grain: null,
			Malt: null,
			Biscuit: null,
			'Graham Cracker': null,
			Toast: null,
			Bread: null
		}
	},
	Spices: {
		Pungent: null,
		Pepper: {
			'Black Pepper': null,
			'Pink Peppercorn': null
		},
		'Brown Spice': {
			Anise: null,
			Nutmeg: null,
			Cinnamon: null,
			Clove: null,
			Cardamom: null,
			Allspice: null,
			'Star Anise': null,
			'Baking Spice': null,
			Chai: null,
			Licorice: null
		},
		Ginger: null,
		Saffron: null
	},
	'Nutty/Cocoa': {
		Nutty: {
			Peanuts: null,
			Hazelnut: null,
			Almond: null,
			Pecan: null,
			Walnut: null,
			Cashew: null,
			Macadamia: null,
			Pistachio: null,
			'Brazil Nut': null,
			Chestnut: null,
			'Peanut Butter': null,
			'Roasted Nut': null,
			Sesame: null
		},
		Cocoa: {
			Chocolate: null,
			'Dark Chocolate': null,
			'Milk Chocolate': null,
			'Cocoa Nib': null,
			'Cocoa Powder': null,
			'Baking Chocolate': null,
			'Bittersweet Chocolate': null,
			'White Chocolate': null,
			'Hot Chocolate': null,
			Carob: null
		}
	},
	Sweet: {
		'Brown Sugar': {
			Molasses: null,
			'Maple Syrup': null,
			Caramelized: null,
			Honey: null,
			Caramel: null,
			Toffee: null,
			Butterscotch: null,
			Panela: null,
			'Cane Sugar': null,
			Honeycomb: null,
			'Golden Syrup': null,
			Agave: null,
			'Dulce de Leche': null,
			Cola: null
		},
		Vanilla: null,
		Vanillin: null,
		'Overall Sweet': null,
		'Sweet Aromatics': null,
		Confectionery: {
			Nougat: null,
			Marzipan: null,
			Praline: null,
			Fudge: null,
			Marshmallow: null,
			'Cotton Candy': null,
			Bubblegum: null,
			'Turkish Delight': null,
			'Wine Gum': null,
			'Hard Candy': null,
			Sherbet: null,
			'Jelly Bean': null
		},
		Dessert: {
			Custard: null,
			'Creme Brulee': null,
			Tiramisu: null,
			Cheesecake: null,
			Cake: null,
			Pastry: null,
			Brownie: null,
			Cookie: null,
			Pie: null,
			Cream: null,
			'Ice Cream': null
		}
	},
	Character: {
		Body: {
			'Tea-Like': null,
			Silky: null,
			Syrupy: null,
			Creamy: null,
			Velvety: null,
			Juicy: null,
			Round: null,
			Smooth: null,
			Buttery: null,
			'Light Body': null,
			'Medium Body': null,
			'Full Body': null,
			Thin: null,
			Chewy: null
		},
		Acidity: {
			Bright: null,
			Sparkling: null,
			Tart: null,
			Crisp: null,
			Vibrant: null,
			Zesty: null,
			Tangy: null,
			Mellow: null,
			Sharp: null
		},
		Finish: {
			'Long Finish': null,
			'Short Finish': null,
			Astringent: null,
			'Sweet Finish': null
		},
		Clean: null,
		Balanced: null,
		Complex: null,
		Elegant: null,
		Delicate: null,
		Refreshing: null,
		Rich: null,
		Structured: null,
		Muddy: null,
		Hollow: null,
		Harsh: null,
		Flat: null
	}
};

/**
 * Other words people type for a note ("cacao" for Cocoa), keyed by id. Search only; never stored.
 */
export const FLAVOR_ALIASES: Readonly<Record<string, readonly string[]>> = {
	'character.acidity.bright': ['brightness'],
	'character.acidity.mellow': ['low acidity', 'soft acidity'],
	'character.acidity.sparkling': ['effervescent', 'fizzy'],
	'character.acidity.vibrant': ['lively'],
	'character.body.full_body': ['full-bodied', 'heavy', 'heavy body'],
	'character.body.light_body': ['light-bodied'],
	'character.body.medium_body': ['medium-bodied'],
	'character.body.round': ['rounded'],
	'character.body.syrupy': ['viscous', 'coating'],
	'character.body.tea_like': ['tea like', 'tealike'],
	'character.body.thin': ['watery', 'weak'],
	'character.body.velvety': ['plush', 'velvet'],
	'character.clean': ['clarity', 'transparent', 'clear'],
	'character.finish.astringent': ['drying', 'dry finish', 'chalky'],
	'character.finish.long_finish': ['lingering', 'long aftertaste'],
	'character.finish.short_finish': ['short aftertaste'],
	'character.finish.sweet_finish': ['sweet aftertaste'],
	'character.flat': ['dull', 'lifeless'],
	'character.hollow': ['empty'],
	'character.muddy': ['murky', 'dirty'],
	'character.refreshing': ['thirst-quenching'],
	'floral.black_tea': ['tea'],
	'floral.black_tea.earl_grey': ['earl grey tea'],
	'floral.black_tea.iced_tea': ['sweet tea', 'peach tea'],
	'floral.floral': ['florals', 'flowery', 'floral notes'],
	'floral.floral.chamomile': ['camomile'],
	'floral.floral.cherry_blossom': ['sakura'],
	'floral.floral.coffee_blossom': ['coffee flower'],
	'floral.floral.elderflower': ['elder flower'],
	'floral.floral.hibiscus': ['hibiscus tea', 'sorrel'],
	'floral.floral.jasmine': ['jasmine tea'],
	'floral.floral.orange_blossom': ['citrus blossom', 'neroli', 'lemon blossom', 'orange flower'],
	'floral.floral.rose': ['rosewater', 'rose water'],
	'floral.floral.rose_hip': ['rosehip'],
	'floral.floral.violet': ['candied violet'],
	'floral.floral.white_flowers': ['white florals', 'white floral'],
	'floral.green_tea': ['sencha'],
	'floral.oolong': ['oolong tea'],
	'floral.rooibos': ['redbush', 'red tea'],
	'floral.white_tea': ['silver needle'],
	fruity: ['fruit', 'fruit-forward'],
	'fruity.berry': ['berries', 'berry-like'],
	'fruity.berry.black_currant': ['blackcurrant', 'cassis'],
	'fruity.berry.blackberry': ['bramble'],
	'fruity.berry.forest_fruit': ['mixed berries', 'wild berries', 'summer fruits', 'forest fruits'],
	'fruity.berry.goji_berry': ['goji', 'wolfberry'],
	'fruity.berry.red_currant': ['redcurrant', 'currant'],
	'fruity.berry.strawberry': ['wild strawberry'],
	'fruity.citrus_fruit': ['citrus', 'citrusy'],
	'fruity.citrus_fruit.bergamot': ['earl grey citrus'],
	'fruity.citrus_fruit.calamansi': ['calamondin'],
	'fruity.citrus_fruit.candied_orange': ['candied citrus', 'candied orange peel', 'candied lemon'],
	'fruity.citrus_fruit.grapefruit': ['pink grapefruit', 'ruby grapefruit'],
	'fruity.citrus_fruit.lemon_zest': ['lemon peel', 'citrus zest'],
	'fruity.citrus_fruit.lemonade': ['pink lemonade', 'limeade'],
	'fruity.citrus_fruit.lime': ['lime zest'],
	'fruity.citrus_fruit.mandarin': ['satsuma', 'mandarine'],
	'fruity.citrus_fruit.orange': ['navel orange', 'sweet orange'],
	'fruity.citrus_fruit.orange_zest': ['orange peel'],
	'fruity.citrus_fruit.pomelo': ['pummelo'],
	'fruity.dark_fruit': ['dark fruits', 'black fruit'],
	'fruity.dried_fruit.date': ['dates', 'medjool'],
	'fruity.dried_fruit.fig': ['dried fig'],
	'fruity.dried_fruit.golden_raisin': ['sultana'],
	'fruity.dried_fruit.prune': ['dried plum'],
	'fruity.fruit_punch': ['punch', 'tropical punch'],
	'fruity.jam': ['jammy', 'preserves', 'compote', 'berry jam'],
	'fruity.other_fruit.apple': ['apple juice'],
	'fruity.other_fruit.asian_pear': ['nashi'],
	'fruity.other_fruit.black_cherry': ['dark cherry'],
	'fruity.other_fruit.cantaloupe': ['rockmelon'],
	'fruity.other_fruit.cherry': ['red cherry', 'bing cherry'],
	'fruity.other_fruit.coconut': ['toasted coconut'],
	'fruity.other_fruit.grape': ['grape juice'],
	'fruity.other_fruit.muscat': ['muscat grape', 'moscato'],
	'fruity.other_fruit.pineapple': ['ananas'],
	'fruity.other_fruit.plum': ['red plum', 'black plum', 'yellow plum', 'damson'],
	'fruity.other_fruit.prickly_pear': ['cactus pear'],
	'fruity.other_fruit.rainier_cherry': ['white cherry', 'yellow cherry'],
	'fruity.other_fruit.sour_cherry': ['tart cherry', 'morello'],
	'fruity.other_fruit.stone_fruit': ['drupe', 'stonefruit'],
	'fruity.other_fruit.tomato': ['cherry tomato'],
	'fruity.other_fruit.white_grape': ['green grape'],
	'fruity.red_fruit': ['red berries', 'red fruits'],
	'fruity.tropical_fruit.dragon_fruit': ['dragonfruit', 'pitaya'],
	'fruity.tropical_fruit.guava': ['pink guava'],
	'fruity.tropical_fruit.kiwi': ['kiwifruit'],
	'fruity.tropical_fruit.lulo': ['naranjilla'],
	'fruity.tropical_fruit.lychee': ['litchi'],
	'fruity.tropical_fruit.papaya': ['pawpaw'],
	'fruity.tropical_fruit.passion_fruit': ['passionfruit', 'maracuya', 'granadilla'],
	'fruity.tropical_fruit.soursop': ['guanabana'],
	'fruity.tropical_fruit.star_fruit': ['starfruit', 'carambola'],
	'fruity.tropical_fruit.tree_tomato': ['tamarillo'],
	'green_vegetative.green_vegetative.bell_pepper': ['green pepper', 'capsicum'],
	'green_vegetative.green_vegetative.grassy': ['grass', 'cut grass'],
	'green_vegetative.green_vegetative.hay_like': ['hay', 'straw'],
	'green_vegetative.green_vegetative.herb_like': ['herbal', 'herbaceous', 'herby'],
	'green_vegetative.green_vegetative.lemongrass': ['lemon grass'],
	'green_vegetative.green_vegetative.mint': ['spearmint', 'peppermint'],
	'green_vegetative.green_vegetative.peapod': ['snap pea', 'green pea'],
	'green_vegetative.green_vegetative.potato': ['raw potato', 'potato defect', 'ptd'],
	'green_vegetative.green_vegetative.under_ripe': ['unripe'],
	'nutty_cocoa.cocoa': ['cacao'],
	'nutty_cocoa.cocoa.baking_chocolate': ["baker's chocolate", 'unsweetened chocolate'],
	'nutty_cocoa.cocoa.chocolate': ['chocolatey', 'chocolaty', 'choc'],
	'nutty_cocoa.cocoa.cocoa_nib': ['cacao nib', 'cacao nibs', 'cocoa nibs'],
	'nutty_cocoa.cocoa.hot_chocolate': ['hot cocoa', 'drinking chocolate'],
	'nutty_cocoa.cocoa.milk_chocolate': ['milk choc'],
	'nutty_cocoa.nutty': ['nuts', 'nut'],
	'nutty_cocoa.nutty.almond': ['toasted almond', 'roasted almond'],
	'nutty_cocoa.nutty.chestnut': ['roasted chestnut'],
	'nutty_cocoa.nutty.hazelnut': ['filbert', 'roasted hazelnut'],
	'nutty_cocoa.nutty.macadamia': ['macadamia nut'],
	'nutty_cocoa.nutty.peanuts': ['peanut'],
	'nutty_cocoa.nutty.roasted_nut': ['toasted nut', 'roasted nuts', 'mixed nuts'],
	'nutty_cocoa.nutty.sesame': ['tahini'],
	'other.cedar': ['cedarwood'],
	'other.chemical.metallic': ['metal', 'tinny'],
	'other.chemical.rioy': ['rio', 'iodine'],
	'other.chemical.salty': ['saline', 'salt'],
	'other.mineral': ['minerality', 'flinty', 'stony'],
	'other.oak': ['oaky'],
	'other.papery_musty.baggy': ['burlap', 'jute', 'past crop', 'faded'],
	'other.papery_musty.musty_earthy': ['earthy', 'earth'],
	'other.papery_musty.papery': ['paper', 'filter paper'],
	'other.papery_musty.woody': ['wood'],
	'other.pine': ['fir', 'pine needle'],
	'other.savory': ['savoury', 'umami'],
	'roasted.burnt': ['charred', 'scorched'],
	'roasted.burnt.brown_roast': ['roasty'],
	'roasted.burnt.smoky': ['smoke', 'smokey'],
	'roasted.cereal.biscuit': ['biscuity', 'cracker'],
	'roasted.cereal.bread': ['bread crust', 'bready'],
	'roasted.cereal.grain': ['grainy'],
	'roasted.cereal.malt': ['malty'],
	'roasted.cereal.toast': ['toasty', 'toasted bread'],
	'roasted.tobacco': ['cigar'],
	'sour_fermented.alcohol_fermented.boozy': ['alcoholic', 'liquor'],
	'sour_fermented.alcohol_fermented.brandy': ['cognac'],
	'sour_fermented.alcohol_fermented.champagne': ['sparkling wine', 'prosecco'],
	'sour_fermented.alcohol_fermented.cider': ['apple cider'],
	'sour_fermented.alcohol_fermented.fermented': ['funky', 'ferment', 'fermenty'],
	'sour_fermented.alcohol_fermented.liqueur': ['cherry liqueur', 'amaretto'],
	'sour_fermented.alcohol_fermented.rum': ['rum raisin'],
	'sour_fermented.alcohol_fermented.whiskey': ['whisky'],
	'sour_fermented.alcohol_fermented.winey': ['wine-like', 'vinous', 'wine'],
	'sour_fermented.alcohol_fermented.yogurt': ['yoghurt'],
	'sour_fermented.sour.acetic_acid': ['vinegar'],
	'sour_fermented.sour.citric_acid': ['citric'],
	'sour_fermented.sour.lactic_acid': ['lactic'],
	'sour_fermented.sour.malic_acid': ['malic'],
	'sour_fermented.sour.phosphoric_acid': ['phosphoric'],
	'sour_fermented.sour.tartaric_acid': ['tartaric'],
	spices: ['spice', 'spicy'],
	'spices.brown_spice.anise': ['aniseed'],
	'spices.brown_spice.baking_spice': ['sweet spice', 'spice cake', 'mixed spice'],
	'spices.brown_spice.chai': ['chai tea', 'masala chai'],
	'spices.brown_spice.cinnamon': ['cinnamon bark'],
	'spices.brown_spice.licorice': ['liquorice'],
	'spices.ginger': ['candied ginger', 'ginger root'],
	'spices.pepper': ['peppery'],
	'spices.pepper.pink_peppercorn': ['pink pepper'],
	'sweet.brown_sugar': ['demerara', 'muscovado', 'turbinado'],
	'sweet.brown_sugar.agave': ['agave syrup', 'agave nectar'],
	'sweet.brown_sugar.cane_sugar': ['sugarcane', 'sugar cane', 'raw sugar'],
	'sweet.brown_sugar.caramel': ['salted caramel'],
	'sweet.brown_sugar.caramelized': ['caramelised', 'burnt sugar'],
	'sweet.brown_sugar.cola': ['root beer'],
	'sweet.brown_sugar.dulce_de_leche': ['cajeta', 'milk caramel'],
	'sweet.brown_sugar.honey': ['wildflower honey', 'raw honey', 'acacia honey', 'floral honey'],
	'sweet.brown_sugar.maple_syrup': ['maple'],
	'sweet.brown_sugar.molasses': ['treacle', 'blackstrap'],
	'sweet.brown_sugar.panela': ['rapadura', 'piloncillo', 'jaggery'],
	'sweet.confectionery.bubblegum': ['bubble gum'],
	'sweet.confectionery.cotton_candy': ['candy floss', 'fairy floss'],
	'sweet.confectionery.fudge': ['chocolate fudge'],
	'sweet.confectionery.hard_candy': ['candy', 'boiled sweets', 'lollipop', 'candied'],
	'sweet.confectionery.praline': ['brittle', 'almond brittle'],
	'sweet.confectionery.sherbet': ['sherbet lemon'],
	'sweet.confectionery.wine_gum': ['gummy', 'gummy bear', 'gummies'],
	'sweet.dessert.cake': ['sponge cake', 'pound cake'],
	'sweet.dessert.cookie': ['shortbread', 'snickerdoodle'],
	'sweet.dessert.cream': ['whipped cream', 'fresh cream'],
	'sweet.dessert.creme_brulee': ['cr\u00e8me br\u00fbl\u00e9e', 'burnt cream'],
	'sweet.dessert.custard': ['pudding', 'vanilla custard'],
	'sweet.dessert.ice_cream': ['gelato'],
	'sweet.dessert.pastry': ['croissant', 'danish'],
	'sweet.dessert.pie': ['apple pie', 'crumble', 'apple crisp', 'cobbler'],
	'sweet.overall_sweet': ['sweetness'],
	'sweet.vanilla': ['vanilla bean']
};

export interface Flavor {
	id: string;
	name: string;
	parentId: string | null;
	tier: 1 | 2 | 3;
}

export function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '');
}

function flatten(tree: Tree, parent: Flavor | null, out: Flavor[]): Flavor[] {
	for (const [name, children] of Object.entries(tree)) {
		const slug = slugify(name);
		const flavor: Flavor = {
			id: parent ? `${parent.id}.${slug}` : slug,
			name,
			parentId: parent?.id ?? null,
			tier: (parent ? parent.tier + 1 : 1) as Flavor['tier']
		};
		out.push(flavor);
		if (children) flatten(children, flavor, out);
	}
	return out;
}

/** Every flavor, parents before children, in wheel order. */
export const FLAVORS: readonly Flavor[] = Object.freeze(flatten(WHEEL, null, []));

export const FLAVOR_BY_ID: ReadonlyMap<string, Flavor> = new Map(FLAVORS.map((f) => [f.id, f]));

export function isFlavorId(id: string): boolean {
	return FLAVOR_BY_ID.has(id);
}

/** "fruity.berry.blueberry" → ["Fruity", "Berry", "Blueberry"] */
export function flavorPath(id: string): string[] {
	const names: string[] = [];
	let current = FLAVOR_BY_ID.get(id);
	while (current) {
		names.unshift(current.name);
		current = current.parentId ? FLAVOR_BY_ID.get(current.parentId) : undefined;
	}
	return names;
}

export function childrenOf(parentId: string | null): Flavor[] {
	return FLAVORS.filter((f) => f.parentId === parentId);
}

// --- search -----------------------------------------------------------------------------------

/** Lower case, accents and punctuation dropped: "Crème Brûlée" → "creme brulee". */
function normalize(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

interface SearchEntry {
	flavor: Flavor;
	name: string;
	aliases: string[];
	/** Ancestor names, nearest first. */
	ancestors: string[];
}

let searchIndex: SearchEntry[] | null = null;
function index(): SearchEntry[] {
	searchIndex ??= FLAVORS.map((flavor) => ({
		flavor,
		name: normalize(flavor.name),
		aliases: (FLAVOR_ALIASES[flavor.id] ?? []).map(normalize),
		ancestors: flavorPath(flavor.id).slice(0, -1).reverse().map(normalize)
	}));
	return searchIndex;
}

const startsWord = (text: string, q: string) => text.startsWith(q) || text.includes(` ${q}`);

/** Lower is better; null = no match. */
function rank(e: SearchEntry, q: string): number | null {
	if (e.name === q) return 0;
	if (e.name.startsWith(q)) return 1;
	if (startsWord(e.name, q)) return 2;
	if (e.aliases.some((a) => startsWord(a, q))) return 3;
	if (q.length >= 3 && e.name.includes(q)) return 4;
	// "citrus" also finds what sits under Citrus Fruit, after the notes named for it.
	if (e.ancestors.some((a) => startsWord(a, q))) return 5;
	return null;
}

/**
 * The tasting notes matching what's typed, best first: name, then a word in it, then an alias, then
 * a parent category. Ties keep wheel order, broader tiers first. `exclude` = ids already picked.
 */
export function searchFlavors(
	query: string,
	{ exclude = [], limit = 8 }: { exclude?: readonly string[]; limit?: number } = {}
): Flavor[] {
	const q = normalize(query);
	if (q === '') return [];
	const skip = new Set(exclude);
	const hits: { flavor: Flavor; score: number; order: number }[] = [];
	index().forEach((e, order) => {
		if (skip.has(e.flavor.id)) return;
		const score = rank(e, q);
		if (score !== null) hits.push({ flavor: e.flavor, score, order });
	});
	hits.sort((a, b) => a.score - b.score || a.flavor.tier - b.flavor.tier || a.order - b.order);
	return hits.slice(0, limit).map((h) => h.flavor);
}
