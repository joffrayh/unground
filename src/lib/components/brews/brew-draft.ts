/**
 * A new brew in progress (D43), kept in this browser when the user leaves the form. Its fields have the
 * shape of a failed submit's `values`, so the form restores from them the same way. It also keeps what
 * the form started from: the nav's Add Brew link carries no `?from=`, so the page alone can't rebuild it.
 */
import type {
	BeanOption,
	BrewFormValues,
	BrewTemplate,
	DripperOption,
	GrinderOption
} from './brew-values.ts';

/** Bump when BrewDraft or BrewFormValues change shape; older drafts are then ignored. */
const VERSION = 3;

export type DraftFields = Record<string, string | string[]>;

/** The brew the page copied (its template, D15); the form follows each bean's own (D60). */
export interface DraftCopiedFrom {
	id: string;
	beanName: string;
	/** Asked for with `?from=`. */
	explicit: boolean;
	/** Its bean is archived, so another was picked. */
	beanReset: boolean;
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
		const dated = (t: BrewTemplate): BrewTemplate => ({
			...t,
			from: { ...t.from, brewedAt: new Date(t.from.brewedAt) }
		});
		return {
			fields,
			values: {
				...values,
				templates: Object.fromEntries(
					Object.entries(values.templates ?? {}).map(([bean, t]) => [bean, dated(t)])
				),
				fallbackTemplate: values.fallbackTemplate ? dated(values.fallbackTemplate) : null
			},
			copiedFrom
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
		// Brews and ratings logged since the draft was kept count too (D58, D60); a brew asked for with
		// `?from=` still speaks for its bean.
		values: {
			...draft.values,
			lastRatings: context.values.lastRatings,
			templates: { ...context.values.templates, ...copiedTemplate(draft) },
			fallbackTemplate: context.values.fallbackTemplate
		},
		copiedFrom: draft.copiedFrom && {
			...draft.copiedFrom,
			beanReset: draft.copiedFrom.beanReset && !searchParams.has('bean')
		}
	};
}

/** The draft's template for the brew it was asked to copy, by bean id. */
function copiedTemplate(draft: BrewDraft): Record<string, BrewTemplate> {
	const id = draft.copiedFrom?.explicit ? draft.copiedFrom.id : null;
	const entry = Object.entries(draft.values.templates ?? {}).find(([, t]) => t.from.id === id);
	return entry ? { [entry[0]]: entry[1] } : {};
}
