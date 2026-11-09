/**
 * "Enter moves to the next field" for the brew form: on a phone keyboard, Go/Enter must not submit a
 * half-filled brew (R3). Pure DOM helpers, no Svelte.
 */

/** Input types where Enter would otherwise trigger an implicit form submit. */
const TEXT_LIKE = new Set(['text', 'number', 'date', 'datetime-local', 'time', 'range']);

export function isTextLike(el: EventTarget | null): el is HTMLInputElement {
	return el instanceof HTMLInputElement && TEXT_LIKE.has(el.type);
}

function isEditable(el: HTMLElement): boolean {
	if (el instanceof HTMLInputElement && ['hidden', 'submit', 'button', 'reset'].includes(el.type)) {
		return false;
	}
	const field = el as HTMLInputElement;
	if (field.disabled || field.readOnly) return false;
	// Fields inside a collapsed <details> can't take focus.
	return !el.closest('details:not([open])');
}

/** Focuses the next editable field after `from` in its form. Returns false when there is none. */
export function focusNextField(from: Element): boolean {
	const form = from.closest('form');
	if (!form) return false;
	const next = [...form.querySelectorAll<HTMLElement>('input, select, textarea')].find(
		(el) =>
			isEditable(el) && (from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
	);
	next?.focus();
	return !!next;
}
