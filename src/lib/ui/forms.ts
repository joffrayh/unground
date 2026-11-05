/**
 * Reading an action's `form` result back into fields.
 *
 * Every action that fails returns `fail(status, { errors, values })` (see #lib/server/http.ts): `errors`
 * maps field name → message (`_form` for form-wide), `values` is the submitted form so a no-JS reload
 * can re-populate the fields. Pages pass `form` and their defaults through these helpers.
 */
export type FormState =
	{ errors?: Record<string, string>; values?: Record<string, unknown> } | null | undefined;

/** The submitted value after a failure, else the fallback. */
export function val(
	form: FormState,
	key: string,
	fallback: string | number | null | undefined = ''
): string {
	const v = form?.values?.[key];
	if (typeof v === 'string') return v;
	return fallback == null ? '' : String(fallback);
}

/** Multi-value field (checkbox group / tags) after a failure, else the fallback. */
export function vals(form: FormState, key: string, fallback: readonly string[] = []): string[] {
	const v = form?.values?.[key];
	if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
	if (form?.values && !(key in form.values)) return [];
	return [...fallback];
}

/** Whether a checkbox should be checked: submitted state after a failure, else the fallback. */
export function checked(form: FormState, key: string, fallback: boolean): boolean {
	if (form?.values) return form.values[key] === 'on';
	return fallback;
}

export function err(form: FormState, key: string): string | undefined {
	return form?.errors?.[key];
}
