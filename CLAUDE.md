# Unground

A mobile-first V60 brew logger (SvelteKit 3, Svelte 5, Postgres, Drizzle). The spec and decision log are in
`concept.md`; the stack, layout and code conventions are in `README.md`. Read both before changing behaviour,
and record new product decisions in `concept.md` §8.

## Principles

- **Mobile first.** Every UI decision starts from a phone in one hand at the kettle: 44px tap targets, no
  horizontal scroll, the keyboard's Enter/Go moves to the next field instead of submitting.
- **Low verbosity.** UI copy is labels, units and short errors. Don't add hints that explain the UI or state
  the obvious; cut them when you see them. Replies and docs are brief too.
- **Works without JavaScript.** Forms are plain POSTs; JS only enhances them (`hydrated` flags gate JS-only
  controls). Keep both paths working.
- **Structured data for Stage 2.** Prefer controlled vocabularies and numbers over free text. Never rename or
  remove a stored vocabulary id (`vocab.ts`, `flavors.ts`); only append.

## Commands

```sh
npm run check        # svelte-check (must be 0 errors, 0 warnings)
npm run lint         # prettier + eslint
npx vitest --run     # unit + DB tests (PGlite, no Docker needed)
npm run test:e2e     # Playwright on a production build; needs `npm run db:start`
```

Run check, lint and the unit tests before calling work done; run e2e after UI changes.

## Gotchas

- Imports use `#lib/...` with explicit `.ts` extensions.
- `use:enhance` ignores `preventDefault`; call `cancel()`.
- `ORIGIN` is read at build time (`paths.origin`), and Kit validates env vars during `vite build`.
- Drizzle drops table qualifiers in single-table queries; use `col()` from `db/sql.ts`.
- Data migrations on `brews`/`pours`/`brew_v60` go after their `ALTER`s, inside
  `SET CONSTRAINTS ALL IMMEDIATE` (see `migration.spec.ts`).
- After editing `schema.ts` or a vocabulary, run `npm run db:generate`.
