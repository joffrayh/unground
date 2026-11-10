# Unground — Concept & Specification

> Status: living document. The data model here is the **current schema in outline**. It is meant to be extended and revised as the app develops; the authoritative definition is `src/lib/server/db/schema.ts`.
>
> **Implementation philosophy:** Build a **minimum viable product first**, then grow from it. Every design choice prioritizes **modularity and extensibility** so that future features (richer brew methods, live brew timer, water profiles, Stage 2 analysis) can be added without reworking what already exists. When in doubt, ship the simpler version behind a clean seam.

## 1. Premise

Home coffee brewing (currently V60 pour-over) is a **high-dimensional problem**: grind size, water temperature, pour structure, bean origin, processing, roast age, and many more variables all interact to affect the final cup. With so many variables, it is hard to attribute an enjoyable (or disappointing) cup to any specific change.

The hypothesis: **if enough structured data is collected over time, statistical / ML analysis can reveal which variables correlate most strongly with brews the user enjoys.**

## 2. Two stages

The project is deliberately split into two stages.

| Stage | Name                    | Purpose                                                                                                           | Status            |
| ----- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------- |
| **1** | Data acquisition        | Let the user log every detail of every coffee (bean + brew + their rating of it) in a structured, consistent way. | **Current focus** |
| **2** | Inference / conclusions | Apply statistics / ML over the accumulated logs to surface which variables correlate with enjoyment.              | Future            |

**Guiding principle:** Stage 1 exists _to feed_ Stage 2. Every logging decision should be made with the downstream analysis in mind — data should be structured, consistent, and quantitative wherever possible, not free-form. Free-text is allowed but should supplement, never replace, structured fields.

**Statistical reality check.** One person brewing daily produces ~365 rows a year against 15+ variables that are heavily confounded (roast age rises within a bag and resets when the bean changes). Stage 1 therefore also captures _experimental intent_ — which variable the user deliberately changed — and makes "same as last time, change one thing" the cheapest way to log (see D15, D16). Stage 2 will likely need within-bean comparisons / mixed-effects models rather than naive regression.

## 3. Scope

- **In scope now:** V60 pour-over brewing only.
- **Designed to extend:** The brew model must accommodate other methods later (espresso, AeroPress, etc.) without restructuring. Method-specific fields live in a method-specific section so adding a new method = adding a new section, not migrating everything.
- **Out of scope now:** Stage 2 analysis features; social/sharing features; water-chemistry logging (author uses tap water — deferred, acknowledged as important); a live brew timer (pour data is entered manually for now); blends (single-origin beans only); password reset by email.

See the [decision log](#8-decision-log) for the rationale behind these and other settled choices.

## 4. Core domain concepts

Two primary entities, plus the user's evaluation of a brew, plus reusable **equipment / reference** entities (Roaster, Grinder, Dripper).

### 4.1 Bean (reusable)

A **Bean** represents a bag/batch of coffee. It is logged **once** and then **reused**: when logging a brew, the user selects an existing bean rather than re-entering its details. Finished bags can be **archived** so they disappear from pickers but stay in the history.

Bean attributes are organized into three **logical sections**. This is a grouping for clarity, not three separate tables — they are all 1:1 with the bean and live as grouped columns on a single `Bean` table (see [§5](#5-data-model-overview)):

#### Origin

- **Country** — ISO 3166-1 alpha-2 code from a list of coffee-producing countries (controlled vocabulary).
- **Farm** — free text (too open-ended to enumerate).
- **Altitude** — stored as a **range** in metres (`min`/`max`); a single quoted altitude sets both.
- _(extensible: region, variety/cultivar, producer, …)_

#### Process

- **Processing method** — a **controlled vocabulary**: washed, natural, honey, anaerobic, carbonic maceration, co-ferment, wet-hulled, other.

#### Roast

- **Roaster** — references a separate **Roaster** entity (reused across many beans). Typing a new roaster name while adding a bean creates it.
- **Bean name / type** — the product name.
- **Roast level** — controlled vocabulary: light, medium-light, medium, medium-dark, dark.
- **Roast date** — used to derive _roast age_ (days since roast) at brew time.
- **Stored frozen** — flag. Frozen storage pauses staling, so roast age means something different for these beans; Stage 2 can treat them separately.
- **Roaster's tasting notes** — **SCA flavor-wheel tags** (any tier), plus the **raw text from the bag** because roaster wording often doesn't map cleanly ("lemon sherbet").

#### Bag

- **Bag weight** (g) and **price paid** (in the user's own currency): both optional.
- **What's left** is derived: bag weight minus the doses of every brew logged with the bean. The home screen lists each non-empty bag with the grams left and the brews left at the bean's latest dose (D28).

_(extensible: decaf flag is included)_

### 4.2 Brew

A **Brew** is a single brewing event. It references one **Bean**, one **Grinder** and (optionally) one **Dripper**, and records the parameters used. A brew can be logged before it is tasted; the rating is added later.

**Logging a new brew (D26):** every field shows the previous brew's value as a grey placeholder; a field left blank saves its placeholder, and typing replaces it. What the previous brew's _next-time plan_ suggests is shown as a green "› 17" button inside the field and applied with a tap; a planned agitation level is a green dot on its slider, with the same button (D30). A blank pour time saves the time its box shows, whether copied from the previous brew or estimated from the pours above.

**Common (method-agnostic) attributes:**

- **Method** — for now always `v60`, but the field exists from day one.
- **Date / time** of the brew (timezone-aware; roast age uses the brewer's local date).
- **Grinder** — a reusable **Grinder** entity. Grind settings are only meaningful relative to a specific grinder, so Stage 2 compares grind sizes **within each grinder**.
- **Grind setting** — a **number** on that grinder's own scale (e.g. 24 clicks, 5.3 on a dial). Multi-ring grinders are entered as total clicks. The grinder records the unit label.
- **Dripper** — a reusable **Dripper** entity (name + material), chosen and added like a grinder (D23). Optional: older brews have none.
- **Agitation** — swirl / stir, unitless **0–5**; a new brew starts at the previous brew's value, else 3 (D24).
- **Dose** — dry coffee weight (g).
- **Water** — total water (g) and **water temperature** (°C). For V60 the total is _derived_ from the pours (see below) so it can never disagree with them.
- **Ratio** — water:dose, always derived.
- **Next time** ("Adjustments" on the brew form) — what the user means to change on the next brew (D25): temperature, ratio, grind, number of pours, agitation, plus free-text refinements. Each is set with −/+ buttons around the current value. Only values that differ from this brew's are stored. The next brew shows them as green suggestions (D30): a ratio change keeps the dose and changes the water; a pour-count change drops pours from (red) or appends pours to (green) the end; **Accept** spreads the water evenly over the non-bloom pours, blooms keeping their amount.
- **What changed** _(legacy, D16 → D25)_ — no longer asked; brews that recorded it keep it and it is still exported.
- **Notes** — free text about the brewing (e.g. "stalled drawdown").

**V60-specific attributes** (the method-specific block):

- **Filter** (Hario tabbed, Hario tabless, Cafec, Sibarist, other) — optional. (The dripper's material now lives on the Dripper entity, D23.)
- **Pours** — an ordered list, **entered manually** for now (a live tap-to-mark timer is a future enhancement that would not change this data shape). Each pour stores:
  - **volume** (g) poured in that pour,
  - **interval** — seconds since the previous pour _started_. The first pour starts the brew, so its interval is **0** by definition.
  - **bloom** — a tick box per pour (D27). Pours are named from 0 ("Pour 0", "Pour 1", …); any of them can be a bloom, e.g. a double bloom. The bloom wait is the time to the first pour that isn't a bloom.
  - **Entry UX:** the user types what they see — the **timer reading** when each pour starts and the **scale reading** (running total) after it. The app converts these into per-pour volume and interval.
- **Total brew time** (drawdown complete), stored on the common block since every method has one.
- Number of pours is derived (count of pours).
- _(extensible: water profile, etc.)_

### 4.3 Rating / Tasting (the target variable)

This is **the most important data point** for Stage 2 — it is what every other variable will be correlated against. Each brew gets one rating:

- **Overall score** — integer **1–10**, the headline _quality_ metric (higher = better). Required whenever a rating is saved.
- **Sub-scores** — integer **1–10** each, measuring **intensity, not quality** (higher = _more_ of it). Optional individually so logging stays fast, but the UI prompts for all of them:
  - Acidity — higher = more acidic
  - Sweetness — higher = sweeter
  - Body — higher = heavier
  - Bitterness — higher = more bitter
  - Astringency — higher = more drying
  - Clarity — higher = cleaner, more distinct flavours
  - _(set extensible; aftertaste was collected until D22 and is kept on old ratings)_
- The sub-scores are entered and shown on a **radar chart** (one axis each); a point at the centre means "not rated". A slider under it moves the axis last touched (D40).
- **Tasting notes** — tags from the tasting-note vocabulary (D5, D29; any tier), picked by search, to compare against the roaster's claimed notes.
- **Comment** — free text.

## 5. Data model overview

> Shown to make relationships concrete. The authoritative schema is `src/lib/server/db/schema.ts`.

```text
User    (1) ──< (many) Roaster | Grinder | Dripper | Bean | Brew   # everything is per-user
Roaster (1) ──< (many) Bean       # many beans share one roaster
Bean    (1) ──< (many) Brew       # a bag of beans is brewed many times
Grinder (1) ──< (many) Brew       # grind settings only compare within a grinder
Dripper (1) ──< (many) Brew       # optional on a brew
Brew    (1) ──  (0..1) BrewV60    # method-specific block
Brew    (1) ──< (many) Pour       # ordered pours within one pour-over brew
Brew    (1) ──  (0..1) Rating     # added at or after brew time
Brew    (1) ──  (0..1) BrewPlan   # what to change next time
Flavor  (1) ──< (many) Flavor     # SCA wheel hierarchy (tier 1 → 2 → 3)
Bean   >──< Flavor                # roaster's claimed notes
Rating >──< Flavor                # user's perceived notes
```

```text
User
  id, email (unique, case-insensitive), password_hash, timezone (IANA), created_at

Roaster  (per user, name unique per user, archivable)
  id, user_id, name, website?, archived_at?

Grinder  (per user, name unique per user, archivable)
  id, user_id, name, setting_unit?   # "clicks", "dial", ...

Dripper  (per user, name unique per user, archivable)
  id, user_id, name, material?       # plastic | ceramic | glass | metal

Bean  (per user, archivable)
  id, user_id, roaster_id -> Roaster, name
  # --- origin ---
  country?            # ISO alpha-2
  farm?
  altitude_min_m?, altitude_max_m?
  # --- process ---
  process?            # washed | natural | honey | anaerobic | carbonic_maceration | co_ferment | wet_hulled | other
  # --- roast ---
  roast_level?        # light | medium_light | medium | medium_dark | dark
  roast_date?
  decaf, stored_frozen
  roaster_notes_raw?  # text from the bag; tags live in bean_roaster_notes
  # --- bag ---
  bag_weight_g?, bag_price?

Brew
  id, user_id, bean_id -> Bean, grinder_id -> Grinder, dripper_id? -> Dripper
  method              # 'v60'
  brewed_at           # timestamptz
  timezone            # IANA zone it was logged in; local date & roast age use it (D20)
  grind_setting, dose_g, water_g, water_temp_c, total_time_s
  agitation?          # 0–5
  changed[]           # legacy: what the user deliberately changed (no longer asked, D25)
  notes?

BrewV60  (1:1 with a v60 brew)
  brew_id, method ('v60'), filter_type?   # FK (brew_id, method) -> brews (D21)

Pour
  brew_id, idx (1..n), volume_g, interval_s, bloom   # idx 1 ⇔ interval 0; shown as "Pour idx-1"

Rating  (1:1 with brew)
  brew_id, overall (1-10), acidity?, sweetness?, body?, bitterness?, astringency?, clarity? (1-10 intensity),
  aftertaste? (legacy), comment?

BrewPlan  (1:1 with brew, only while something is planned)
  brew_id, water_temp_c?, ratio?, grind_setting?, pour_count?, agitation?, notes?   # null = keep as it was

Flavor  (seeded SCA wheel)
  id                  # dotted path, e.g. "fruity.berry.blueberry" — stable, self-describing in exports
  name, parent_id?, tier (1-3)
```

**Extensibility & integrity notes:**

- Separate tables are used only for **relationships** (one-to-many / many-to-many), **reused entities** (Roaster, Grinder), or **method-specific blocks** (BrewV60). One-to-one bean detail stays as grouped columns on `Bean`.
- Adding a method (e.g. espresso) = a new `brew_espresso` table + a new entry in the method registry (`src/lib/server/methods/`). The core `Brew` table and existing data are untouched.
- Rating dimensions are a defined-but-growable set; a new dimension is a new nullable column, so old ratings read as "not recorded", never as zero.
- Categorical fields use **controlled vocabularies** enforced by database CHECK constraints, not just the UI.
- Optional fields are **nullable**: "unknown" is never stored as a fake value.
- **Per-user isolation is enforced by the database**: every child row's foreign key includes `user_id`, so a brew cannot reference another user's bean or grinder even if application code has a bug.
- Derived values (roast age, ratio, pour count, absolute pour start times, cumulative water) are **computed**, not stored. The one exception is `water_g`, a common field every method needs; for V60 the server always sets it to the sum of the pours, and a deferred database trigger rejects any commit where they disagree (D21).
- Cross-row V60 invariants (block present, ≥ 1 pour, pours numbered 1..n, `water_g` = Σ pours) are enforced by **deferred constraint triggers** at commit (D21).

## 6. Users & rollout

Rating/logging is single-perspective, but the app is **multi-user from the start**:

1. **Now:** the author and a few beta friends, each with a real account (email + password).
2. **Eventually:** publicly available.

Registration can be open or gated behind an invite code (server configuration), so a beta can be private. Data is scoped per-user everywhere (see the isolation note in §5).

## 7. Key requirements (Stage 1)

- **R1 — Reusable beans:** log a bag once, select it for many brews.
- **R2 — Structured, quantitative logging:** prefer numeric/enumerated fields over free text so data is analysable.
- **R3 — Low-friction logging:** logging a brew must be fast, since it happens daily/often. A new brew is pre-filled from the previous one; the UI is phone-first.
- **R4 — Multi-dimensional rating** on every brew (the Stage 2 target).
- **R5 — Extensible to other brew methods** without restructuring.
- **R6 — Per-user data isolation** to allow beta users and eventual public release.
- **R7 — Exportable data** — CSV export for Stage 2 (see D14).

## 8. Decision log

The substance of each decision lives in the section noted under _Where_; this table is the at-a-glance index and the home for deliberate deferrals/exclusions that don't otherwise appear in the spec body.

| ID  | Decision                                                                                                                                                                                                                                            | Rationale                                                                                                                                                                                                                                                                | Where                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| D1  | Pour data entered **manually** in the MVP; live tap-to-mark timer is a future add-on.                                                                                                                                                               | Timer is a UX nicety, not core; data shape is identical either way, so it can be added without migration.                                                                                                                                                                | [§4.2](#42-brew)                                                           |
| D2  | Grind setting stored as the **per-grinder setting** (a number); no cross-grinder normalization.                                                                                                                                                     | Logging the grinder lets Stage 2 analyse grind **within each grinder**, so settings only compare against themselves.                                                                                                                                                     | [§4.2](#42-brew)                                                           |
| D3  | Water chemistry **deferred** — not logged in the MVP.                                                                                                                                                                                               | Author uses tap water; acknowledged as important and an eventual addition.                                                                                                                                                                                               | [§3](#3-scope)                                                             |
| D4  | Bean detail grouped into **origin / process / roast** sections but kept as columns on one `Bean` table; **Roaster** promoted to its own table; `process` is a controlled vocab.                                                                     | Origin/process/roast are 1:1 with a bean — separate tables would only add joins. Roaster is reused across beans (a real many-to-one) and enables per-roaster analysis.                                                                                                   | [§4.1](#41-bean-reusable), [§5](#5-data-model-overview)                    |
| D5  | Tasting notes (roaster's **and** user's) use the **SCA flavor wheel** as a hierarchical tag vocabulary; tags may be chosen at any tier and use dotted-path ids.                                                                                     | Consistent categories let the two be compared; the hierarchy lets Stage 2 roll "blueberry" up to "berry" → "fruity". The descriptor list is used as a vocabulary only (the wheel's visual design is not reproduced); revisit licensing before public launch.             | [§4.1](#41-bean-reusable), [§4.3](#43-rating--tasting-the-target-variable) |
| D6  | ~~Bean depletion / inventory out of scope.~~ Superseded by D28. Beans can be **archived** to hide them from pickers.                                                                                                                                | Archiving is just a picker filter.                                                                                                                                                                                                                                       | [§3](#3-scope)                                                             |
| D7  | Sub-scores are **intensity** (higher = more acidic / sweeter / heavier …); **overall** is the only quality score. All are integers 1–10.                                                                                                            | "Good acidity" and "a lot of acidity" are different targets; intensity is less subjective and makes overall the single quality target.                                                                                                                                   | [§4.3](#43-rating--tasting-the-target-variable)                            |
| D8  | Method-specific fields live in a **1:1 table per method** (`brew_v60`) plus a code-level method registry.                                                                                                                                           | New methods add a table and a registry entry, never a migration of `brew`.                                                                                                                                                                                               | [§5](#5-data-model-overview)                                               |
| D9  | **Grinder** is its own per-user table; grind setting is numeric; multi-ring grinders entered as total clicks.                                                                                                                                       | Reused across brews (same rule as Roaster); numeric values are orderable for analysis.                                                                                                                                                                                   | [§4.2](#42-brew)                                                           |
| D10 | Roasters, grinders and beans are **private per user**, not a shared catalogue.                                                                                                                                                                      | Avoids duplicate/moderation problems at public launch; a shared catalogue can be layered on later.                                                                                                                                                                       | [§5](#5-data-model-overview)                                               |
| D11 | **Real accounts** from day one: email + password (argon2id), server-side sessions in Postgres, optional invite-code gate on sign-up. No email-based reset in the MVP.                                                                               | Beta friends need separate, secure accounts; server sessions are revocable; email delivery is infrastructure the MVP doesn't need yet.                                                                                                                                   | [§6](#6-users--rollout)                                                    |
| D12 | V60 total water is **derived from the pours**; the first pour has interval 0 (blooms: D27); pours are entered as timer + scale readings.                                                                                                            | One source of truth; entry matches what the brewer actually sees mid-brew.                                                                                                                                                                                               | [§4.2](#42-brew)                                                           |
| D13 | Beans are **single-origin** only in the MVP; altitude is a min/max range; country is an ISO code.                                                                                                                                                   | Blends would need an origin child table — deferred until wanted. Ranges match how bags quote altitude.                                                                                                                                                                   | [§4.1](#41-bean-reusable)                                                  |
| D14 | Export is **CSV**: `brews.csv` (one denormalised row per brew with bean, grinder, rating and derived columns; tag lists `;`-separated) and `pours.csv` (one row per pour, keyed by `brew_id`).                                                      | Loads straight into pandas/R; keeps the one-to-many pours tidy instead of wide columns.                                                                                                                                                                                  | [§7](#7-key-requirements-stage-1)                                          |
| D15 | A new brew is **pre-filled from the user's previous brew** (as placeholders, D26); any brew can be copied.                                                                                                                                          | Biggest friction win (R3) and nudges one-variable-at-a-time experiments.                                                                                                                                                                                                 | [§4.2](#42-brew)                                                           |
| D16 | ~~Brews record **what changed** (controlled multi-select).~~ Superseded by D25; stored values are kept and exported.                                                                                                                                | Captures experimental intent, which Stage 2 can't recover from the data alone.                                                                                                                                                                                           | [§4.2](#42-brew)                                                           |
| D17 | **Stored-frozen** flag on beans.                                                                                                                                                                                                                    | Frozen storage breaks the meaning of roast age; a flag lets Stage 2 separate those beans.                                                                                                                                                                                | [§4.1](#41-bean-reusable)                                                  |
| D18 | Optional fields are nullable; vocabularies and ranges enforced by **DB CHECK constraints**; per-user isolation enforced by **composite foreign keys**.                                                                                              | Data integrity is the product — the database is the last line of defence.                                                                                                                                                                                                | [§5](#5-data-model-overview)                                               |
| D19 | **Tech stack:** SvelteKit (TypeScript, strict) full-stack on Node, PostgreSQL, Drizzle ORM + SQL migrations, Zod validation, Vitest (with in-process PGlite Postgres for DB tests), Playwright for end-to-end tests, Docker Compose for deployment. | One language and one type system from database to UI; server-rendered form actions work without JavaScript (robust on a phone in the kitchen); Svelte ships small bundles (fast on mobile); Postgres gives strong constraints. Stage 2 reads the CSV export from Python. | README                                                                     |
| D20 | Each brew stores the **time zone it was logged in**; local date and roast age are derived from it, not from the user's current zone.                                                                                                                | Moving or travelling must never rewrite historic Stage 2 data.                                                                                                                                                                                                           | [§5](#5-data-model-overview)                                               |
| D21 | Method blocks reference `brews(id, method)` so a brew can only carry its own method's block; cross-row V60 invariants are **deferred constraint triggers**.                                                                                         | Keeps the DB the last line of defence (D18) for rules a CHECK can't express; prepares for a second method.                                                                                                                                                               | [§5](#5-data-model-overview)                                               |

| D22 | Sub-scores are **acidity, sweetness, body, bitterness, astringency, clarity**, entered on a radar chart. Aftertaste stays stored on old ratings but is no longer collected, and saving a rating never overwrites it. | Clarity and astringency respond to grind, filter and agitation, so they inform recipe changes; "uniqueness" was considered and rejected because it is mostly a property of the bean and overlaps with Overall. | [§4.3](#43-rating--tasting-the-target-variable) |
| D23 | **Dripper** is a per-user entity (name, material) like Grinder, referenced by an optional `brews.dripper_id` with a composite `(dripper_id, user_id)` FK. Migration 0002 turned each recorded `brew_v60.dripper_material` into a dripper. | Drippers are reused across brews; keeping the reference on `brews` gives the same DB-enforced isolation as the grinder. Optional because older brews have none. | [§4.2](#42-brew) |
| D24 | **Agitation** is a core brew field, unitless 0–5, default 3. | Most methods agitate (swirl, stir); a small integer scale is quick on a phone and orderable. | [§4.2](#42-brew) |
| D25 | A brew carries a **next-time plan** (`brew_plans`) of deliberate changes; it replaces the "what changed" question. Only values that differ from the brew are stored. | The plan is made right after tasting, when intent is clearest, and drives the next brew's suggestions, so recording intent costs nothing extra. | [§4.2](#42-brew) |
| D26 | A new brew shows the previous brew's values as **placeholders; a blank field saves its placeholder** (posted as `<field>Default`). A grind placeholder only counts on its own grinder. | Repeating a brew stays fast (R3), and changing a value means typing it, not deleting the old one first. | [§4.2](#42-brew) |
| D27 | Each pour has a **bloom** flag; pours are named from 0. Migration 0002 marked every pour 1 as a bloom (D12's old rule). | Double blooms and no-bloom recipes exist; a flag records them without a convention. | [§4.2](#42-brew) |
| D28 | **Bag tracking:** optional bag weight and price on the bean; grams and brews left are derived from the doses logged. | Knowing when a bag runs out helps plan the next purchase; deriving it keeps a single source of truth. | [§4.1](#41-bean-reusable) |
| D29 | The tasting-note vocabulary **extends the wheel** with ~250 notes that recur on roaster pages, cupping forms and brewing forums (bergamot, lychee, milk chocolate, nougat …), placed under the wheel's own categories, plus new groups Fruity › Tropical Fruit, Sweet › Confectionery, Sweet › Dessert and a tier-1 **Character** (Body, Acidity, Finish; Clean, Balanced …). Search-only aliases ("cacao", "earthy"). Notes are picked by **search, as tags**, from the vocabulary only; the full tree stays as the no-JS fallback. | The wheel alone missed most of what bags say; a fixed vocabulary keeps tags comparable for Stage 2, and the hierarchy still rolls up by id prefix. Character holds the non-flavour words roasters list as notes, kept out of the flavour categories so they don't skew them. | [§4.3](#43-rating--tasting-the-target-variable) |
| D30 | Plan suggestions are **green**, inside the box they apply to. | Green reads as "go/next" and matches the pours the plan adds; inside the box the previous value (the placeholder) and the target sit together. | [§4.2](#42-brew) |
| D31 | The app is named **Unground**; it shows no app-name header. UI copy is **low-verbosity** (see `CLAUDE.md`). | Screen space on a phone goes to the brew. | — |
| D32 | **Hosting:** the app runs on Render's free plan (Docker, auto-deploy from `main`), the database on Neon's free plan. A pinger keeps the app awake; Docker Compose stays as the self-hosted fallback. | Free, nothing to maintain, built-in HTTPS and deploys. Render's own free Postgres expires after 30 days; Oracle's free VM needs server upkeep and its limits were cut in 2026. | README |
| D33 | **Theme** is System, Light or Dark, set in Settings and stored in a cookie on the device, not on the account. System (no cookie) follows the device. | A phone and a laptop can differ; a cookie lets the server render the right theme first, without JavaScript and without a flash. | — |
| D34 | ~~**Temporary:** the palette is **Paper**.~~ Superseded by D36. | The data stays the focus while the branding is undecided. | — |
| D35 | **Logo:** the full wordmark tops the home page (in place of a Log a Brew button) and sits above the sign-in and sign-up cards, in its light or dark version to match the theme. The square mark is the favicon, following the browser's theme, and on amber it's the home-screen icon. | Add Brew already lives in the nav (D37). | — |
| D36 | **Look (Issue #7, Figma `example-glass`):** navy and amber dark theme with a cream light theme derived from it; Corben for headings, buttons and titles, Lato for data; self-hosted fonts; translucent "glass" cards with a lit rim. | A warmer identity that keeps numbers legible. Self-hosting needs no third-party requests. | — |
| D37 | **Navigation** is one floating glass bar at every width, with a notch holding the Add Brew button; the current tab is tinted amber. | The bar sits under the thumb, and Add Brew is the app's main action. | — |
| D38 | **On the new-brew form the nav's centre button is Save Brew.** The swirl unravels into the save icon. Scrolling down folds the rest of the nav away and the button stretches into a labelled pill; scrolling up brings the nav back. The form has no other save button. Editing a brew keeps its own. | One save control, always under the thumb, and no Add Brew button where it would do nothing. It's a real submit button tied to the form, so it works without JavaScript. | — |
| D39 | **Page changes animate in:** visible blocks rise and fade in a short cascade, the first heading's letters fade up in turn, and the old page dims while a slow one loads. Going back, the first load, hash links and query-only changes don't animate; neither does reduced motion. Enter only, using the Web Animations API rather than View Transitions. | It starts once the page is in the DOM, so it adds no wait and never blocks a tap; View Transitions would, and would freeze the nav's morph. Phones already animate swiping back. Nothing is hidden without JavaScript. | — |
| D40 | **A slider under the radar** moves the axis last touched (the first axis until then); its label follows that axis, and position 0 is "not rated". JavaScript only, like the radar. | Dragging a point on a phone is fiddly. The chart still picks the axis and shows the shape. | [§4.3](#43-rating--tasting-the-target-variable) |
| D41 | **Dropdowns animate:** opening slides the height and brings the contents in with D39's rise and fade; closing only slides. One listener on the page covers every `<details>`. No JavaScript or reduced motion keeps the native toggle. | Matches the page transitions, and the content below no longer jumps. | — |
| D42 | **The brew form's Rating section starts open.** An untouched one still saves no rating. | The rating is the Stage 2 target, so it shouldn't be hidden behind a tap. | [§4.3](#43-rating--tasting-the-target-variable) |
| D43 | **A new brew in progress is kept as a draft** in the browser's local storage (one per account) when the form is left or hidden, and restored on return. Saving or **Cancel brew** (bottom of the form; asks first if anything was entered) clears it. Copying a different brew shows that copy instead; the draft is replaced only once the copy is edited. JavaScript only. | Checking another page mid-brew shouldn't cost the input. Unfinished brews stay out of the database, so Stage 2 never sees them. | [§4.2](#42-brew) |
| D44 | **A card's toggle sits in its top right corner**, level with the heading; what it opens flows below. Covers the plan, the rating and each equipment row, and the Edit toggles read just "Edit". CSS only, so it works without JavaScript. | The action is where the eye lands and the card stays compact while closed. The heading already says what's being edited. | — |
| D45 | **Overall, agitation and the radar's fine control are one stepped slider: a disc in a slot, a small dot at each step.** Scores start at the far left, "not rated", and a planned agitation is a larger green dot. Without JavaScript they stay radio pills. | One control, usable one-handed. Starting unset means no default biases the data (D7). | [§4.3](#43-rating--tasting-the-target-variable) |

## 9. Open questions / decisions to revisit

- **Flavor wheel licensing** before public launch (D5).
- **Password reset** needs email delivery — add before public launch (D11).
- **Blends** — add an origin child table if/when needed (D13).
- **Final logo** (D35) is a placeholder.
