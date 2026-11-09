# Unground

Log every V60 brew (bean, recipe, pours and how it tasted) as clean, structured data. The goal is that
statistics can later show which variables make the cups you enjoy. The product spec and every design
decision live in [concept.md](concept.md).

## Stack

| Layer      | Choice                                                                       |
| ---------- | ---------------------------------------------------------------------------- |
| App        | SvelteKit 3 (Svelte 5, TypeScript strict), server-rendered, `adapter-node`   |
| Database   | PostgreSQL 18, Drizzle ORM, SQL migrations in `drizzle/`                     |
| Validation | Zod 4 (`src/lib/domain/schemas.ts`)                                          |
| Auth       | Email + password (argon2id), server-side sessions in Postgres                |
| Tests      | Vitest, with DB tests on an in-process Postgres (PGlite); Playwright for e2e |
| Deploy     | Render (Docker, free) + Neon Postgres; or Docker Compose self-hosted         |

Why this stack ([D19](concept.md#8-decision-log)):

- One language and one type system run from the database schema to the UI.
- Forms are plain server-rendered POSTs that also work without JavaScript, so they're robust on a phone at the kettle.
- Svelte ships very little JavaScript.
- Postgres enforces the data rules itself: CHECK constraints, composite foreign keys for per-user isolation, and deferred triggers for cross-row pour invariants.

## Quick start (development)

```sh
npm install
cp .env.example .env          # edit INVITE_CODE
npm run db:start              # Postgres in Docker on port 5433
npm run dev                   # http://localhost:5173 (migrations run on start)
```

Sign up at `/signup`. By default this needs the `INVITE_CODE` from `.env`.

### Environment

| Variable               | Meaning                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Postgres connection string                                                                                                                                           |
| `REGISTRATION`         | `open`, `invite` (default; needs `INVITE_CODE`) or `closed`                                                                                                          |
| `INVITE_CODE`          | Code required to sign up in `invite` mode                                                                                                                            |
| `ORIGIN`               | **Build time.** The public URL, e.g. `https://coffee.example.com`, used for CSRF checks. If it's unset, the app derives it from the `Host` header and assumes https. |
| `SCALE_RECORDINGS_DIR` | Folder where `/dev/scale` saves recordings. Unset: saving is off.                                                                                                    |

## Scripts

| Command               | What it does                                                 |
| --------------------- | ------------------------------------------------------------ |
| `npm run dev`         | Dev server                                                   |
| `npm run check`       | Type-check (svelte-check)                                    |
| `npm run lint`        | Prettier + ESLint                                            |
| `npm run test:unit`   | Unit + DB integration tests (no external database needed)    |
| `npm run test:e2e`    | Playwright end-to-end tests (builds the app; needs Postgres) |
| `npm run db:generate` | Generate a migration after editing `schema.ts`               |

## Deploying

### Render + Neon (D32)

[`render.yaml`](render.yaml) defines the app. Every push to `main` deploys it, and the app applies
pending migrations and refreshes the flavour vocabulary when it starts.

1. **Neon:** create a project (Postgres 18, AWS Frankfurt). Under **Connect**, turn off connection
   pooling and copy the string. Replace its query string (`?sslmode=require&channel_binding=require`)
   with `?sslmode=verify-full`: postgres.js skips certificate checks under `require` and would send
   `channel_binding` to the server as a setting, which fails.
2. **Render:** New → Blueprint → this repo. Paste the string as `DATABASE_URL`. The invite code is
   generated; it's under the service's **Environment**.
3. **Keep-alive:** a free Render service sleeps after 15 idle minutes (about 1 minute to wake). Have a
   cron service (e.g. cron-job.org) fetch `https://<service>.onrender.com/login` every 10 minutes.
   `/login` doesn't touch the database, so Neon still scales to zero.
4. Once everyone has signed up, set `REGISTRATION=closed`.

Backup from any machine with a Postgres 18 client: `pg_dump "$DATABASE_URL" -Fc > unground.dump`.

### Self-hosted (Docker Compose)

On the server, create `.env` next to `compose.prod.yaml`:

```sh
DOMAIN=coffee.example.com     # DNS A record must point at the server; ports 80 and 443 open
POSTGRES_PASSWORD=…
INVITE_CODE=…
REGISTRATION=invite           # set to closed once everyone has signed up
```

```sh
docker compose -f compose.prod.yaml up -d --build    # also to update, after git pull
```

Caddy gets a TLS certificate for `DOMAIN` automatically and proxies to the app. The app applies pending
migrations and refreshes the flavour vocabulary when it starts. Back up nightly with
[`scripts/backup.sh`](scripts/backup.sh) from cron.

## Exporting data (Stage 2)

Go to **Settings → Export**, or fetch the files directly while signed in:

- `/export/brews.csv` has one row per brew: bean (with bag weight and price), grinder, dripper, scale, recipe (incl. `agitation`), method-specific columns (`pour_count`, `bloom_pours`, `bloom_g`, `bloom_time_s`, …), rating (`rating_acidity` … `rating_clarity`, plus the legacy `rating_aftertaste`), the next-time plan (`next_*`, blank = keep as it was), and derived values (`ratio`, `roast_age_days`, `brewed_local_date`, …).
- `/export/pours.csv` has one row per pour (`brew_id`, `idx` from 1, `pour_number` from 0 as the app shows it, `volume_g`, `interval_s`, `bloom`, plus derived `start_s` and `cumulative_g`, and for pours a scale measured, `planned_start_s`, `planned_cumulative_g` and `duration_s`).

Flavour tags are `;`-separated wheel paths such as `fruity.berry.blueberry`, so you can roll them up with a prefix match. Blank cells mean "not recorded", never zero.

```python
import pandas as pd
brews = pd.read_csv("brews.csv", parse_dates=["brewed_at_utc"])
pours = pd.read_csv("pours.csv")
```

## Code layout

```text
src/
  hooks.server.ts            session validation, auth guard (deny by default), security headers
  env.ts                     environment variables (validated at start-up)
  lib/
    domain/                  pure logic, shared by server and browser
      vocab.ts               controlled vocabularies (source of truth for DB CHECKs, validators, selects)
      flavors.ts             tasting-note vocabulary (wheel + D29 additions), aliases, search
      pours.ts, derive.ts    pour conversion, ratio, roast age, bag left, time zones
      plan.ts                next-time plan: −/+ steps, kept changes, suggested pours
      schemas.ts             form parsing and validation
    server/
      db/                    Drizzle schema, client, seeding
      services/              all data access; every function takes the user id
      methods/               brew-method registry (V60 today)
      auth/                  passwords, sessions, rate limiting
      http.ts                helpers for actions and loads
    scale/                   Bookoo Bluetooth protocol and the link to the scale
    components/              shared Svelte components (TagPicker, ScoreInput, …)
    ui/                      formatting and form-state helpers
  routes/                    pages and endpoints
drizzle/                     SQL migrations (generated, plus custom triggers in 0001)
```

### Conventions

- **Validate, then call a service.** Actions parse with a `parse*Form` function, return `fail(status, { errors, values })` on bad input, and call a service. Services re-check ownership and throw `NotFoundError`/`ConflictError`, which `domainFailure` and `notFound` turn into responses.
- **Every query is scoped by `userId`.** The database backs this up with composite `(id, user_id)` foreign keys.
- **Imports** use Node subpath imports with explicit extensions, e.g. `#lib/server/db/index.ts`.
- **Vocabularies:** change them only in `src/lib/domain/vocab.ts`, then run `npm run db:generate` so the CHECK constraints follow. Append values; never rename stored ones.
- **Placeholders (D26):** on a new brew, fields show the previous brew's values as placeholders and a blank field saves its placeholder. The form posts each one as `<field>Default` (`pourTimeDefault[]` / `pourScaleDefault[]` per pour row); `parseBrewForm` fills blanks from them. Pour rows post a stable `pourRow` id that the `pourBloom` / `pourDrop` boxes refer to.
- **Data migrations:** a migration that rewrites rows of `brews`, `pours` or `brew_v60` must do so after its `ALTER TABLE`s on them, inside `SET CONSTRAINTS ALL IMMEDIATE`: pending deferred-trigger events make Postgres refuse a later `ALTER` in the same transaction (see `drizzle/0002_todo_features.sql` and `src/lib/server/db/migration.spec.ts`).

### Adding a brew method (e.g. espresso)

1. Add `'espresso'` to `BREW_METHODS` in `vocab.ts`.
2. Add a `brew_espresso` table in `schema.ts`, following `brew_v60`: a constant `method` column and an FK to `brews(id, method)`. Then run `npm run db:generate`.
3. Implement `MethodModule` in `src/lib/server/methods/espresso.ts` and register it in `methods/index.ts`. The compiler flags the registry until it's there.
4. Add its details to `BrewInput` (a union keyed by `method`), its parser in `schemas.ts`, and its form section.

The core `brews` table and existing data stay untouched.
