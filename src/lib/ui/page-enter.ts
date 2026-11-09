/**
 * The animation that brings a new page in (D39): visible blocks rise and fade in a short cascade while
 * the first heading's letters fade up in turn. It only ever starts after the page is in the DOM, so it
 * costs navigation no time, and nothing is hidden without JavaScript.
 */

const CASCADE_STEP_MS = 24;
const CASCADE_MAX_STEPS = 7;
export const BLOCK_MS = 280;
const RISE = 'translateY(14px)';
export const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

const LETTER_STEP_MS = 28;
const LETTER_SWEEP_MS = 180;
const LETTER_MS = 240;

/** Wrappers with no look of their own: their children are the blocks. */
const WRAPPER = ':is(section, form, .stack, .details-body, .rating-fields):not(.card)';

interface Navigation {
	type: string | null;
	from: { url: URL } | null;
	to: { url: URL } | null;
}

/**
 * Whether a navigation arrives on a different page. Going back is left out, since phones already
 * animate the swipe; so are the first load, hash links and query-only changes.
 */
export function changesPage({ type, from, to }: Navigation): boolean {
	return type !== 'popstate' && !!from && !!to && from.url.pathname !== to.url.pathname;
}

export const cascadeDelay = (index: number) => Math.min(index, CASCADE_MAX_STEPS) * CASCADE_STEP_MS;

/** The gap between letters, tightened so that a long name takes no longer than a short one. */
export const letterStep = (letters: number) =>
	Math.min(LETTER_STEP_MS, LETTER_SWEEP_MS / Math.max(1, letters - 1));

export function collectBlocks(parent: Element, blocks: Element[] = []): Element[] {
	for (const child of parent.children) {
		if (child.matches(WRAPPER)) {
			collectBlocks(child, blocks);
		} else {
			blocks.push(child);
			// A list's rows step in over its glass shell.
			if (child.matches('.list')) collectBlocks(child, blocks);
		}
	}
	return blocks;
}

export function isOnScreen(element: Element): boolean {
	const { top, bottom, height } = element.getBoundingClientRect();
	return height > 0 && top < window.innerHeight && bottom > 0;
}

/** Each block rises and fades in, a step behind the one before. */
export function riseIn(blocks: Element[]): Animation[] {
	return blocks.map((block, i) =>
		block.animate(
			block.matches('.list')
				? [{ opacity: 0 }, { opacity: 1 }]
				: [
						{ opacity: 0, transform: RISE },
						{ opacity: 1, transform: 'none' }
					],
			{ duration: BLOCK_MS, delay: cascadeDelay(i), easing: EASE_OUT, fill: 'backwards' }
		)
	);
}

/**
 * Fades the heading's letters in from `delay` and returns a function that restores it. The letters are
 * inline, so they wrap like the text they replace. The original text node goes back afterwards, so
 * Svelte's reference to it stays good; meanwhile it carries the heading for screen readers.
 */
function spellOut(heading: Element, text: Text, delay: number): () => void {
	const graphemes = Array.from(new Intl.Segmenter().segment(text.data), (part) => part.segment);
	const step = letterStep(graphemes.length);

	const hidden = document.createElement('span');
	hidden.className = 'visually-hidden';
	hidden.append(text);
	const shown = document.createElement('span');
	shown.setAttribute('aria-hidden', 'true');
	heading.replaceChildren(hidden, shown);

	const restore = () => heading.replaceChildren(text);
	const animations = graphemes.map((grapheme, i) => {
		const letter = document.createElement('span');
		letter.textContent = grapheme;
		shown.append(letter);
		return letter.animate([{ opacity: 0 }, { opacity: 1 }], {
			duration: LETTER_MS,
			delay: delay + i * step,
			easing: 'ease-out',
			fill: 'backwards'
		});
	});
	animations[animations.length - 1].onfinish = restore;
	return restore;
}

/** Plays the animation over the current page and returns a function that ends it early. */
export function enterPage(main: Element): () => void {
	const blocks = collectBlocks(main).filter(isOnScreen);
	const animations = riseIn(blocks);

	const heading = main.querySelector('h1') ?? main.querySelector('h2');
	const text = heading?.firstChild;
	const headingBlock = heading ? blocks.findIndex((block) => block.contains(heading)) : -1;
	const restoreHeading =
		heading && text instanceof Text && heading.childNodes.length === 1 && headingBlock >= 0
			? spellOut(heading, text, cascadeDelay(headingBlock))
			: undefined;

	return () => {
		for (const animation of animations) animation.cancel();
		restoreHeading?.();
	};
}
