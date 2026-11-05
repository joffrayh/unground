import { defineEnvVars } from '@sveltejs/kit/env';

const REGISTRATION_MODES = ['open', 'invite', 'closed'] as const;

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'PostgreSQL connection string. Required at run time (checked at server start).',
		// Optional here because Kit validates env during `vite build`, where no database exists.
		schema: (value) => value || undefined
	},
	REGISTRATION: {
		description:
			'Who may sign up: "open", "invite" (requires INVITE_CODE) or "closed". Default: invite.',
		schema: (value) => {
			const mode = value || 'invite';
			if (!(REGISTRATION_MODES as readonly string[]).includes(mode)) {
				throw new Error(`REGISTRATION must be one of ${REGISTRATION_MODES.join(', ')}`);
			}
			return mode as (typeof REGISTRATION_MODES)[number];
		}
	},
	INVITE_CODE: {
		description: 'Code required to sign up when REGISTRATION=invite.',
		schema: (value) => value || undefined
	}
});
