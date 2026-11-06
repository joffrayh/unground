// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Session, SessionUser } from '#lib/server/auth/session.ts';
import type { Theme } from '#lib/ui/theme.ts';

declare global {
	namespace App {
		interface Locals {
			user: SessionUser | null;
			session: Session | null;
			theme: Theme;
		}
	}
}

export {};
