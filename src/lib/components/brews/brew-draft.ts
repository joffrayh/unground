/**
 * A new brew in progress (D43), kept in this browser when the user leaves the form. Its fields have the
 * shape of a failed submit's `values`, so the form restores from them the same way. It also keeps what
 * the form started from: the nav's Add Brew link carries no `?from=`, so the page alone can't rebuild it.
 */
import type { BeanOption, BrewFormValues, DripperOption, GrinderOption } from './brew-values.ts';

/** Bump when BrewDraft or BrewFormValues change shape; older drafts are then ignored. */
const VERSION = 3;

export type DraftFields = Record<string, string | string[]>;

export interface DraftCopiedFrom {
	id: string;
	brewedAt: Date;
	timezone: string;
	beanName: string;
	explicit: boolean;
	beanReset: boolean;
	grinderReset: boolean;
	grinderName: string;
}

export interface BrewDraft {
	fields: DraftFields;
	values: BrewFormValues;
	copiedFrom: DraftCopiedFrom | null;
}

/** What the page offers now, which the draft may have outlived. */
export interface DraftContext {
	values: BrewFormValues;
	beans: readonly BeanOption[];
	grinders: readonly GrinderOption[];
	drippers: readonly DripperOption[];
}

const storageKey = (owner: string) => `unground:brew-draft:${owner}`;

export function readBrewDraft(owner: string): BrewDraft | null {
	try {
		const stored = JSON.parse(localStorage.getItem(storageKey(owner)) ?? 'null');
		if (stored?.version !== VERSION) return null;
		const { fields, values, copiedFrom } = stored as BrewDraft;
		return {
			fields,
			values,
			copiedFrom: copiedFrom && { ...copiedFrom, brewedAt: new Date(copiedFrom.brewedAt) }
		};
	} catch {
		return null;
	}
}

export function writeBrewDraft(owner: string, draft: BrewDraft): void {
	try {
		localStorage.setItem(storageKey(owner), JSON.stringify({ version: VERSION, ...draft }));
	} catch {
		// Storage can be full or blocked; the brew just isn't kept.
	}
}

export function clearBrewDraft(owner: string): void {
	try {
		localStorage.removeItem(storageKey(owner));
	} catch {
		// As above.
	}
}

/**
 * The draft to show at this URL, or null when the URL asks for a copy of a different brew. A bean,
 * grinder or dripper just added (`?bean=` etc.) replaces the draft's, as does the page's own choice
 * when the draft's has since been archived.
 */
export function resumeBrewDraft(
	draft: BrewDraft,
	searchParams: Pick<URLSearchParams, 'get' | 'has'>,
	context: DraftContext
): BrewDraft | null {
	const from = searchParams.get('from');
	if (from && from !== draft.copiedFrom?.id) return null;

	const choose = (
		field: 'beanId' | 'grinderId' | 'dripperId',
		param: string,
		options: readonly { id: string }[]
	) => {
		const saved = draft.fields[field];
		return !searchParams.has(param) && options.some((o) => o.id === saved)
			? (saved as string)
			: context.values[field];
	};
	const fields: DraftFields = {
		...draft.fields,
		beanId: choose('beanId', 'bean', context.beans),
		grinderId: choose('grinderId', 'grinder', context.grinders),
		// '' is the dripper's "Not recorded".
		dripperId: choose('dripperId', 'dripper', [{ id: '' }, ...context.drippers])
	};
	return {
		...draft,
		fields,
		// Ratings and plans logged since the draft was kept count too (D58).
		values: {
			...draft.values,
			lastRatings: context.values.lastRatings,
			suggestionsByBean: context.values.suggestionsByBean
		},
		copiedFrom: draft.copiedFrom && {
			...draft.copiedFrom,
			beanReset: draft.copiedFrom.beanReset && !searchParams.has('bean'),
			grinderReset: fields.grinderId !== draft.values.defaults?.grindSettingFor
		}
	};
}
