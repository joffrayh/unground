import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	user: locals.user ? { email: locals.user.email, timezone: locals.user.timezone } : null,
	theme: locals.theme
});
