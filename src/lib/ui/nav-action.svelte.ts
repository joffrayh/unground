import { createContext } from 'svelte';

/** Lets the nav's save button, outside the form, show that the form is saving (D38). */
export class NavAction {
	submitting = $state(false);
}

export const [getNavAction, setNavAction] = createContext<NavAction>();

export const BREW_FORM_ID = 'brew-form';
