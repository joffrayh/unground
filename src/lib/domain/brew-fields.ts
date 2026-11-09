/** Brew-form fields that post several values; the browser's draft needs this without Zod. */
export const BREW_MULTI = [
	'pourTime',
	'pourScale',
	'pourTimeDefault',
	'pourScaleDefault',
	'pourRow',
	'pourBloom',
	'pourDrop',
	'perceivedNotes'
] as const;
