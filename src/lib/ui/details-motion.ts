/**
 * Dropdowns slide open with the page animation's rise and fade (D41). One listener on the page covers
 * every <details>. Without JavaScript, or with reduced motion, they open and close natively.
 */
import { prefersReducedMotion } from 'svelte/motion';
import { BLOCK_MS, EASE_OUT, collectBlocks, isOnScreen, riseIn } from './page-enter.ts';

const CLOSE_MS = 180;

const slides = new WeakMap<HTMLDetailsElement, Animation>();

function slide(
	details: HTMLDetailsElement,
	from: number,
	to: number,
	duration: number,
	done?: () => void
) {
	slides.get(details)?.cancel();
	details.style.overflow = 'hidden';
	const animation = details.animate(
		{ height: [`${from}px`, `${to}px`] },
		{ duration, easing: EASE_OUT }
	);
	slides.set(details, animation);
	animation.onfinish = () => {
		done?.();
		details.style.overflow = '';
		slides.delete(details);
	};
}

function open(details: HTMLDetailsElement) {
	const from = details.getBoundingClientRect().height;
	const reopening = details.open;
	slides.get(details)?.cancel();
	details.classList.remove('closing');
	details.open = true;
	const to = details.getBoundingClientRect().height;
	slide(details, from, to, BLOCK_MS);
	if (!reopening) {
		riseIn(collectBlocks(details).filter((b) => !b.matches('summary') && isOnScreen(b)));
	}
}

function close(details: HTMLDetailsElement, summary: Element) {
	const box = details.getBoundingClientRect();
	// A corner toggle sits outside the flow, so nothing is left of a closed one.
	const to = details.matches('.corner') ? 0 : summary.getBoundingClientRect().bottom - box.top;
	details.classList.add('closing');
	slide(details, box.height, to, CLOSE_MS, () => {
		details.open = false;
		details.classList.remove('closing');
	});
}

export function animateDetails(root: HTMLElement) {
	const onClick = (e: MouseEvent) => {
		const summary = (e.target as Element).closest('summary');
		const details = summary?.parentElement;
		if (
			!summary ||
			!(details instanceof HTMLDetailsElement) ||
			details.querySelector(':scope > summary') !== summary ||
			e.defaultPrevented ||
			prefersReducedMotion.current
		) {
			return;
		}
		e.preventDefault();
		if (details.open && !details.classList.contains('closing')) close(details, summary);
		else open(details);
	};
	root.addEventListener('click', onClick);
	return { destroy: () => root.removeEventListener('click', onClick) };
}
