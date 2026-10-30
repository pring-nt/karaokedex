# KaraokeDex: Agent Build Plan

A virtual songbook for **Platinum Karaoke only**. It compiles song codes, titles, and artists from Platinum's official songlist PDFs into a fast, searchable web app. No other karaoke brand's data is ever ingested.

This file is the source of truth for any agent working on the repo. Read it fully before starting a phase. When this file conflicts with a habit or default, this file wins. Appendix A (design system) is authoritative for all visual decisions.

---

## 0. Standing directives

These apply to every phase.

### 0.1 Workflow

1. **Work one phase at a time.** Do not start a phase until the previous phase's gate (§0.3) passes and the user has approved the phase review.
2. **Never commit, create branches, push, or open PRs without explicit user approval.** At the end of each phase, stage nothing. Present a summary of the changed files, the proposed branch name, and the proposed commit message(s), then wait.
3. **Follow standard git conventions** once approved:
   - Branches: `feat/<phase-slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`
   - Commits: Conventional Commits (`feat(parser): anchor rows on code column`)
   - One logical change per commit
4. **Use bun for everything:** `bun install`, `bun run`, `bun test`, `bunx`. Do not introduce npm, pnpm, or yarn lockfiles.
5. **The user's shell is Windows cmd.** Every command shown to the user must be cmd-compatible: no `\` line continuations, no `mkdir -p`, no brace expansion, no `cp`/`rm`, backslash paths. Scripts in `package.json` must be cross-platform (call `bun scripts/x.ts`, never shell one-liners with `&&` chains that rely on bash features beyond `&&`).
6. **Check before installing tools.** You may check what's available on PATH (`where` on Windows, `which` in CI), but ask before installing anything globally.
7. **Stop and ask** when the spec is ambiguous, a sample PDF contradicts an assumption here, or a fix would require changing a gate rule.
8. **Platinum only.** Data sources are limited to `platinumkaraoke.com` / `platinumkaraoke.ph` and the files it links to. Do not add, scrape, or import any other brand's catalog, even to "fill gaps".

### 0.2 Code rules

- **No unnecessary comments.** Comments exist only to explain non-obvious *why* or to document public APIs (TSDoc on exported functions in `src/lib/server` and `scripts/`). Never narrate what the code does.
- **TypeScript strict everywhere.** No `any`; use `unknown` and narrow it. No non-null assertions (`!`) outside tests.
- **Zod at every boundary:** parsed PDF rows, release objects, the catalog JSON (on write *and* on load), URL search params, `corrections.json`, `aliases.json`, `sources.json`, and the remote `songList` data the watcher reads.
- **Song codes are strings, never numbers.** The full list has codes with leading zeros (`0088`, 724 of them). Converting to a number destroys them.
- **Tokens, never raw values.** Components never contain hex colors, raw px radii, or ad-hoc durations. See §A2 and the token check in §0.3.
- **Svelte 5 runes only:** `$state`, `$derived`, `$effect`, `$props`. No legacy `export let` or stores for component state.
- Pure logic (parsing, normalization, search ranking, watcher diffing) lives in framework-free TS modules so it can be unit tested with `bun test`.
- **Never `eval` remote content.** Anything fetched from the Platinum site is parsed as data (AST or JSON), never executed.

### 0.3 Deterministic gate: `bun run verify`

Every phase ends with `bun run verify` passing **with zero warnings**. Do not disable rules, add `eslint-disable`, `@ts-ignore`, or `@ts-expect-error`, or loosen configs to make the gate pass. If a rule seems wrong, stop and ask.

| Check | Tool | Script |
| --- | --- | --- |
| Formatting | Prettier + `prettier-plugin-svelte` + `prettier-plugin-tailwindcss` | `format:check` |
| Linting | ESLint flat config: `typescript-eslint` (strict, type-checked), `eslint-plugin-svelte`, `eslint-config-prettier` | `lint` |
| Types + Svelte diagnostics | `svelte-check` (after `svelte-kit sync`) | `check` |
| Unused files, exports, deps | `knip` | `knip` |
| Design-token enforcement | `scripts/check-tokens.ts` (fails on hex/rgb literals, raw px radii, or raw ms durations in `src/lib/components/**` and `src/routes/**`; tokens file excluded) | `check:tokens` |
| Unit + fixture tests | `bun test` | `test` |
| E2E (from Phase 6) | Playwright | `test:e2e` |
| Production build | `vite build` (also runs the catalog build) | `build` |

```jsonc
// package.json scripts (target shape)
{
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "lint": "eslint . --max-warnings 0",
  "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --fail-on-warnings",
  "check:tokens": "bun scripts/check-tokens.ts",
  "knip": "knip",
  "test": "bun test",
  "test:e2e": "playwright test",
  "import": "bun scripts/import.ts",
  "sources:check": "bun scripts/sources-check.ts",
  "sources:status": "bun scripts/sources-status.ts",
  "catalog:build": "bun scripts/build-catalog.ts",
  "build": "bun run catalog:build && vite build",
  "verify": "bun run format:check && bun run lint && bun run check && bun run check:tokens && bun run knip && bun run test && bun run build"
}
```

### 0.4 Phase review template

At the end of each phase, report in this shape:

```
Phase N: <name>
Gate: bun run verify ✓ (paste the final summary line of each check)
Acceptance criteria: each item ✓/✗ with a one-line note
Files changed: grouped list
Deviations from PLAN.md: none / list with reasons
Proposed branch: feat/<slug>
Proposed commits: conventional messages
Open questions:
```

---

## 1. Architecture summary

- **Stack:** SvelteKit (Svelte 5), bun, Tailwind v4 (tokens from Appendix A via `@theme`), shadcn-svelte (bits-ui), TanStack Table + TanStack Virtual, Zod, AnimeJS v4, Drizzle + `bun:sqlite`, `unpdf`, `acorn` (watcher), MiniSearch (or a hand-rolled normalized index if benchmarks favor it).
- **Songbooks.** Platinum ships several player families with **separate songlists** (see §1.1). KaraokeDex models each family as a *songbook*. The default and first-class songbook is **HDD** (Major / Alpha / Cello / X3 / Piano XL HDD). Song codes are only meaningful within their songbook.
- **The database is build-time only.** Source of truth is `data/pdfs/**` + `data/sources.json` + `data/corrections.json` + `data/aliases.json`. Every build rebuilds SQLite from scratch, then emits one static catalog JSON per songbook. The SQLite file is **not committed** (gitignored).
- **The deployed site is fully static.** SvelteKit prerenders every route on Vercel. The browser fetches the selected songbook's content-hashed `catalog.<songbook>.<hash>.json` and searches locally. No server functions run on normal use.
- **Hosting:** Vercel Hobby. Static assets get `Cache-Control: public, max-age=31536000, immutable`.
- **Updates:** a scheduled **source watcher** checks Platinum's songlist page and opens a GitHub issue when a new PDF is listed → the user adds the PDF → CI validates and comments on the PR → Vercel preview deploy → merge → production.

```
platinumkaraoke.com ─► watcher ─► sources.json ─► (user downloads PDF) ─► data/pdfs/<songbook>/
data/pdfs + corrections + aliases ─► import ─► SQLite (ephemeral) ─► catalog.<songbook>.<hash>.json ─► static site ─► client search
```

### 1.1 What Platinum actually publishes (verified 2026-10-30)

**The songlist page** (`https://platinumkaraoke.com/pages/songlist-update`) renders its file lists with JavaScript. The data lives in a Shopify theme asset that the page HTML references:

```
//platinumkaraoke.com/cdn/shop/t/<theme>/assets/songlist-update-data.js?v=<version>
```

That asset defines `const songList = [...]`, an array of products:

```ts
{ product: string, years:   [{ year: number, months: [{ month: "January"…"December", link: string }] }] }  // monthly families
{ product: string, volumes: [{ volume: number | string, link: string }] }                                   // volume families
```

- Links point to MediaFire (`/file/` or `/file_premium/`), with one Shopify CDN PDF (HDD June 2021).
- The `?v=` query changes whenever Platinum edits the asset. Use it as a cheap change signal.
- The theme number (`t/50`) can change. Always discover the asset URL from the page HTML; never hardcode it.
- `robots.txt` allows `/pages/` and does not disallow `/cdn/shop/`.

**Products listed** (snapshot in `data/sources.seed.json`):

| Songbook slug | Product | Kind | Entries | Range |
| --- | --- | --- | --- | --- |
| `hdd` | MAJOR/ALPHA/CELLO/X3/PIANO XL HDD | monthly | 143 | 2015-01 → 2026-11, no gaps |
| `bmb-x2` | BMB / X2 / X1 / HDD | monthly | 25 | 2018-12 → 2020-12 (some entries reuse HDD files) |
| `p-series` | P-SERIES | volume | 9 | vol 53–56 → vol 78 |
| `flute-piano` | FLUTE/PIANO V1.5/PIANO XL SD/PK10 | volume | 32 | vol 79 → 108 |
| `reyna` | REYNA SERIES | volume | 43 | vol 62 → 108 |
| `t-x` | T-X SERIES | volume | 47 | vol 58 → 108 |
| `ks-40` | KS-40 / KBOX-2 / KBOX-3 | volume | 31 | vol 2 → 35 |
| `ks-5` | KS-5 / JUNIOR LITE / KS-10 / JUNIOR 2 | volume | 26 | vol 2–7 → 35 |
| `ks-100` | KS-100 MINIBOX / KS-10 MINI SD | volume | 18 | vol 18 → 35 |
| `hermosa` | HERMOSA / N20 NANO PLUS | volume | 6 | vol 2 → 7–9 |
| `home-40` | HOME 40 / NANO OLD | volume | 7 | vol 61 → 77 |
| `bravo` | BRAVO | volume | 6 | vol 4 → 9 |

**In scope now:** `hdd` (full support) and `p-series` (full list + volumes, see Phase 2). The watcher tracks **all** products so nothing new is missed, but only in-scope songbooks are parsed. Adding another songbook later is a parser-profile task plus a user approval.

**There is no published full list for HDD.** The HDD songbook is the union of every monthly "Additional Song List" (2015-01 onward) plus an unknown **pre-2015 base catalog**. See the open items in §3.

### 1.2 Repo layout

```
data/
  sources.json          watcher-maintained manifest (see Phase 3); committed
  sources.seed.json     optional snapshot of the site taken 2026-10-30
  pdfs/
    hdd/                YYYY-MM.pdf                 e.g. hdd/2026-05.pdf
    p-series/           full-vol-59.pdf, vol-61.pdf, vol-53-56.pdf
  corrections.json      { "<songbook>:<code>": { title?, creditRaw?, versionNote? } }
  aliases.json          { "atomic": [...names never split], "map": { "<alias_norm>": "<canonical name>" } }
scripts/
  import.ts             CLI: parse → validate → preview → write DB
  build-catalog.ts      rebuild DB from all PDFs, emit per-songbook catalogs + manifest
  sources-check.ts      watcher: fetch site data, diff against sources.json
  sources-status.ts     local report: which listed PDFs are present / missing / unparsed
  make-fixtures.ts      cut small page-subset fixtures from large PDFs (pdf-lib)
  check-tokens.ts
src/lib/
  parser/
    profiles/           monthly-new-songs.ts, full-list.ts, (later) volume-additional.ts
    extract.ts          unpdf text items with geometry + font
  normalize/            text + artist normalization, credit splitting
  sources/              songList AST extraction, zod schemas, diffing (shared by watcher + status)
  db/                   drizzle schema, queries
  catalog/              catalog schema (zod), encode/decode
  search/               index build, ranking, query parsing (worker-safe)
  components/           UI
  styles/tokens.css     the only place raw values may live
src/routes/
tests/
  fixtures/             small PDFs + expected snapshots + songList fixture
.github/workflows/
  ci.yml
  sources-watch.yml
```

---

## 2. Phases

### Phase 0: Scaffold & tooling

**Scope**
- Project created with `bunx sv create` (see §4 for the exact cmd command), Tailwind v4, adapter-vercel, shadcn-svelte init.
- `src/routes/+layout.ts` with `export const prerender = true;`.
- Configure every tool in §0.3, including `knip.json` and `scripts/check-tokens.ts`.
- `.editorconfig` (LF line endings), `.gitattributes` (`* text=auto eol=lf`, `*.pdf binary`), and `.gitignore` (include `*.sqlite`, `static/catalog.*.json`, `static/catalog-manifest.json`, `.svelte-kit`, `build`, `.vercel`).
- `src/lib/styles/tokens.css` with the §A3 dark + light token blocks, §A4 font tokens, §A5 spacing/radius, §A7 motion tokens, and the Tailwind `@theme` mapping from §A3.6.
- Base CSS from §A15 step 2 (body, selection, scrollbars, focus ring, reduced motion).
- A placeholder `+page.svelte` using the eyebrow → display → subhead pattern.
- If the user supplied `sources.seed.json` (a 2026-10-30 snapshot of Platinum's file list), put it in `data/`. If not, nothing is lost: Phase 3's `sources:check --write` builds `data/sources.json` from the live site.

**Acceptance criteria**
- `bun run verify` passes on a clean clone, on Windows (cmd) and in CI (Linux).
- `check:tokens` fails on a deliberately planted `#fff` in a component (prove it with a test, then remove the plant).
- No feature code yet.

---

### Phase 1: Monthly parser (HDD "New Songs" profile)

**Scope**

*Extraction* (`src/lib/parser/extract.ts`, shared by all profiles)
- Use `unpdf` to get text items with `str`, x/y transform, width, font name/size, and `hasEOL`, per page.
- Parse the **text layer, not the image.** Clipped cells still contain full text there.

*Profile `monthly-new-songs`* (`src/lib/parser/profiles/monthly-new-songs.ts`)
- Single page titled "New Songs" with a `Month YYYY` header; cells are **Song Title | Code | Popularized By**; 2 or 3 column groups per page.
- **Code anchors:** `/^\d{5}$/` items in the bold code font. Their x-positions define the column groups. Must handle 2 and 3 columns with no config.
- Classify each item as `title | code | artist` by x relative to its column's code anchor.
- Walk items in **content-stream order** as a state machine: title items → code → artist items. A new title-classified item starts the next row. This keeps overflow lines (for example `Dalton)`) with the correct row.
- The release label comes from the page header (`Month YYYY` → `YYYY-MM`). If it disagrees with the filename, that's an error.
- **Joining wrapped lines:** if a fragment ends with a space, join with a space. Otherwise join with no separator (handles `Nakakapagpabagaba` + `g`).
- Profile detection is explicit: the import CLI picks the profile from the songbook + filename (`hdd/YYYY-MM.pdf` → `monthly-new-songs`), and the profile asserts its page signature ("New Songs" header) or fails.

*Normalization* (`src/lib/normalize`)
- `normalize(s)`: NFKC, lowercase, strip diacritics (ñ → n for matching only; display keeps the original), unify quotes and apostrophes, strip punctuation, collapse whitespace.
- **Version notes:** extract trailing or parenthesized qualifiers matching `/(soul|r&b|soulrock|soul jazz|funk)?\s*(cover|version|remix|reimagined)/i` into `versionNote`. **Do not** use font size to detect versions; small font is also used just to fit long titles.
- **Credit splitting:** keep `creditRaw` verbatim. Split into artists on `,`, `&`, `x`/`X` (as whole tokens), `ft`, `ft.`, `feat.`, `featuring`, and `(feat. …)`. Mark tokens after ft/feat as `featured`. **Never split inside parentheses** (`41 (Kyle Richh, Tata, Jenn Carter)`). Names in `aliases.json` `atomic` (for example `Macklemore & Ryan Lewis`) are never split.
- Apply `aliases.json` `map` after splitting (SUGARCANE/Sugarcane, BABY MONSTER/BABYMONSTER, Rakista Reimagine/Reimagined, The April Boy's/Boys, Tj/TJ Monterde, One Ok Rock/ONE OK ROCK).

*Validation & lint*
- Zod `ParsedRow` and `ParsedRelease` schemas. `code: z.string().regex(/^\d{4,5}$/)`.
- **Release invariant (error, monthly profile only):** codes are unique and contiguous; row count = `max − min + 1`.
- **Row lint (sets `needsReview`, not an error):** unbalanced brackets; credit ending in `ft`, `ft.`, `feat.`, `&`, `,`, or `x`; text length near the cell's capacity.
- **Cross-release check (warning):** within a monthly songbook, a release's `code_min` should equal the previous release's `code_max + 1`. Report gaps.
- `corrections.json` is applied after parse and lint, and is validated by Zod. A correction for a code that doesn't exist is an error.

*Database* (`src/lib/db`, Drizzle + `bun:sqlite`)
```
songbooks      slug PK, name, models (json), kind ('monthly'|'volume')
releases       id, songbook, label, kind ('monthly'|'volume'|'full'), profile, file_hash UNIQUE, code_min, code_max
songs          songbook, code, title, title_norm, version_note, credit_raw, release_id, needs_review   PK (songbook, code)
song_titles    songbook, code, title, title_norm            -- alternate listings of the same code (see Phase 2)
artists        id, name, name_norm UNIQUE, genre NULL
song_artists   songbook, code, artist_id, role ('primary'|'featured'), position
```
- **Code is the only identity within a songbook.** Never dedupe on title or artist. "I Drink Wine" by Adele is both 42057 and 42129, and both rows must exist.

*CLI* (`scripts/import.ts`)
- `bun run import <pdf> [--yes]` infers the songbook and profile from the path, prints the preview (rows, range, contiguity, review flags, gap check), and asks for confirmation unless `--yes` is passed. Same file hash = skip with a notice.

*Fixtures* (`tests/fixtures/hdd/`)

| File | Range | Rows |
| --- | --- | --- |
| `2025-12.pdf` | 41747–41826 | 80 |
| `2026-02.pdf` | 41907–41986 | 80 |
| `2026-03.pdf` | 41987–42056 | 70 |
| `2026-04.pdf` | 42057–42126 | 70 |
| `2026-05.pdf` | 42127–42226 | 100 |

Required assertions, beyond counts and ranges:
- 41807 title = `Hanggang Dito Na Lang Ba Tayo`
- 41754 title = `Vacation Bible School`
- 41967 title = `Nakakapagpabagaba` + `g` joined with no space
- 41749 credit contains `Ray Dalton)` and is flagged `needsReview` (unbalanced bracket)
- 41752 credit starts with `41 (Kyle Richh, Tata, Jenn Carter)` and that group is not split
- 42152 → title `Buksan Mo`, versionNote `Funk Version`
- 41825 title = `I Can Do It With a Broken Heart` with **no** versionNote
- 42057 and 42129 both exist with title `I Drink Wine`
- March has 2 columns, May has 3, and both parse with no config
- Snapshot of every parsed release (`bun test` snapshots), reviewed by the user on first creation

**Acceptance criteria**
- All fixtures parse with zero unexplained errors; every `needsReview` row is listed in the phase review.
- Parser output is deterministic (same input → byte-identical snapshot).
- Gate passes.

---

### Phase 2: Full-list parser (P-series Vol. 59) & songbooks

The user supplied `1. P-series Volume 59 FULL LIST.pdf`. Facts verified from the file:

| Property | Value |
| --- | --- |
| Origin | Word → doPDF, created 2014-01-09; header `Vol. 59 P-series · Full Songlist · platinumkaraoke.ph` |
| Size | 78 pages, US Letter, 20.6 MB (mostly per-page banner images; text layer is intact) |
| Rows | ≈ 7,650 song codes |
| Layout | 3 column groups per page; each group is **Title · Code · Artist**; sorted **alphabetically by title** with section headers `0~9`, `A`, `B`, … |
| Fonts | code `ArialNarrow-Bold` ~15.6 pt; title/artist `ArialNarrow` ~10.1 pt; section headers `Arial-BoldMT` ~25.9 pt; page chrome `Impact`, `Tahoma-Bold`, `Arial-BoldMT` 10.1 |
| Codes | 4–5 digits, **724 with leading zeros** (`0088`); range 0001–~11,900 plus a `44xxx` block (~360) |

**Songbook assignment:** this file belongs to the **`p-series`** songbook, not `hdd`. P-series and HDD are listed as separate products on Platinum's site, and the codes do not obviously line up (P-series already had `44xxx` codes in 2014, while HDD monthly codes only reached ~42,200 by 2026). It must **never** be merged into `hdd` unless the open item in §3 confirms the codes are shared.

**Scope**

*Profile `full-list`* (`src/lib/parser/profiles/full-list.ts`)
- **Anchor on font, not on digits.** A code is an item in the bold code font matching `/^\d{4,5}$/`. Titles and artists contain bare numbers that must not become codes: titles `214`, `22`, `3`, `2001 C.C. Rider`, `Misis 2000`; the artist `1017`.
- **Ignore page chrome:** banner images, the `platinumkaraoke.ph` / `Vol. 59 P-series` / `Full Songlist` / page-number / `No Magic, Pure Technology` text, and section headers (record the current section letter for validation).
- **Assemble rows in content-stream order, the same way as the monthly profile.** The PDF was printed from a Word table, and its content stream emits each cell's text together, column by column, top to bottom: title items → code → artist items → next row's title. **Do not assemble by geometry.** Cells are vertically centered on the code and overflow into the neighbouring row (`3416`'s title sits on lines both above and below the code; `2237`'s three-line artist `Jos``E Maria` / `G'omez` / `Meza` overlaps `3410`'s row). Nearest-anchor or midpoint rules attach `Meza` to the wrong song, while stream order gets it right. Use x-position only to classify an item as title / code / artist, with column boundaries taken from the clustered x-positions of code anchors (three clusters per page: ≈131, ≈328, ≈525 pt).
- **Rebuild spaces from geometry.** Many lines have no space characters between words in the text layer (the raw stream gives `TotalEclipseOfTheHeart` for `3410`). Join adjacent items with a space when the x-gap exceeds ~0.15 × font size, and never inside an item.
- **Missing pieces are flags, not errors:** a row with an empty artist (`Love Hurts & You Are Everything 3514`) sets `needsReview`. Rows run cleanly across page breaks in this file (`A Long Long Time Ago 1584 Odette Quesada` closes page 1), but if a column ends on a title with no code, check the next column/page top before flagging it.
- **Text cleanup:** collapse runs of spaces (`Jay   Sean Ft.`), trim. The text layer has mangled accents (`Jos``E G'omez`). Detect the pattern (backtick, or a stray `'` before a lowercase letter inside a word) and flag the row so it can be fixed in `corrections.json`; don't guess.

*Validation (full-list profile)*
- **No contiguity invariant.** Full lists are not contiguous.
- **Duplicate codes are expected and meaningful:** the same code listed under two titles is one song with an alternate title (`44387` Laura → `I Surrender` / `Surrender`; `44384` Kelis → `Milkshake` / `My Milkshake`). Merge into one `songs` row and record the other spelling in `song_titles`. Duplicates whose **artists** differ are an error.
- **Alphabetical-order check (warning):** within a section, normalized titles must be non-decreasing in reading order (page → column → row). A violation almost always means a mis-joined wrap, so it lists the offending rows.
- **Section check:** each row's normalized title must start with its section letter (or a digit/symbol for `0~9`).
- **Count sanity:** total rows within ±1% of the code-anchor count; every anchor consumed exactly once.

*Aliases.* The full list adds many artist spelling variants. Seed `aliases.json` with the ones already seen: `E.Humperdinck` / `E.Humperdink` / `Engelbert Humperdinck`; `David Archuleta` / `David Archuletta`; `Avril Lavign` → `Avril Lavigne`; `Greenday` → `Green Day`; `TomJones` → `Tom Jones`; `Ccr` → `CCR`. The import preview must list **new near-duplicate artist names** (normalized edit distance ≤ 2) so the user can add aliases, rather than auto-merging them.

*Fixtures*
- The 20.6 MB source is too large for a fixture. `scripts/make-fixtures.ts` (pdf-lib) cuts `tests/fixtures/p-series/full-vol-59-sample.pdf` from pages **1, 10, 40, 70, 78** (covers section `0~9`, long wrapped artists, empty-artist row, accent mojibake, last page). The full file lives at `data/pdfs/p-series/full-vol-59.pdf`.
- Required assertions:
  - Page 1: `3416` → title `(Everything I Do) I Do It For You`, artist `Bryan Adams`
  - Page 1: `7538` → title `(I've Had) The Time Of My Life`, credit `Dirty Dancing Theme`
  - Page 1: `0088` → title `A Horse With No Name`, artist `America`, code kept as the string `"0088"`
  - Page 1: `44862` → title `22`, artist `Lily Allen`; `5872` → title `214`, artist `Rivermaya`
  - Page 1: `8867` and `9921` both exist with title `A Little Respect` (Wheatus, Erasure)
  - Page 40: `3514` → title `Love Hurts & You Are Everything`, `needsReview` (empty artist)
  - Page 70: `2237` → title `Total`, credit `Jos``E Maria G'omez Meza` (all three lines, not `Meza` on `3410`), flagged for accent mojibake
  - Page 70: `3410` → title `Total Eclipse Of The Heart` (spaces rebuilt), artist `Bonnie Tyler`
  - Full file (run in a separate, slower test tagged `@full`, skipped when the file is absent): ≈7,650 anchors, all consumed; `44387` and `44384` each have two titles.

*UI-facing model change*
- Every song carries its songbook. The catalog is emitted per songbook (Phase 4), and the UI gets a songbook switcher (Phase 5) with `hdd` as the default.

**Acceptance criteria**
- Sample fixture parses with zero unexplained errors; the alphabetical-order check reports zero violations on the sample (or each one is explained).
- The full file parses locally, and the review lists every `needsReview` row grouped by reason with counts.
- Monthly fixtures from Phase 1 still pass unchanged.
- Gate passes.

---

### Phase 3: Source manifest, site watcher & HDD backfill

**Scope**

*Sources library* (`src/lib/sources`)
- `fetchSongList()`:
  1. `GET https://platinumkaraoke.com/pages/songlist-update` with a descriptive User-Agent (`KaraokeDex source watcher (+https://github.com/<owner>/karaokedex)`).
  2. Find the `songlist-update-data.js?v=…` script URL in the HTML. If it's missing, fail with a clear "page structure changed" error.
  3. `GET` that asset. Parse it with **`acorn`**, locate the `songList` variable declarator, and convert the `ArrayExpression` to plain data by walking **only** literal node types (`ArrayExpression`, `ObjectExpression`, `Property` with identifier/literal keys, `Literal`, `TemplateLiteral` without expressions). Any other node type is an error. Never `eval`.
  4. Validate with Zod (the two product shapes in §1.1).
- `toManifest()` normalizes to entries `{ songbook, product, kind, label, url }`. Labels: monthly → `YYYY-MM` (month names, case-insensitive, accept `Aug`); volume → `vol-<n>` or `vol-<a>-<b>`.
- The product → songbook slug map lives in code (table in §1.1). An **unknown product name is reported, not dropped.**

*Manifest file* (`data/sources.json`, committed)
```jsonc
{
  "asset": { "url": "…/songlist-update-data.js", "version": "155022796841148418491792385173", "checkedAt": "2026-10-30T…" },
  "entries": [
    { "songbook": "hdd", "label": "2026-11", "url": "https://www.mediafire.com/…", "firstSeen": "2026-10-30",
      "status": "missing" | "present" | "parsed" | "ignored", "file": "data/pdfs/hdd/2026-11.pdf", "sha256": "…" }
  ]
}
```
- The first `sources.json` is generated from the live site (or from `data/sources.seed.json` when present and the site is unreachable).
- `status` is derived, not hand-edited: `sources:status` recomputes it from what's on disk and in the last build.
- Out-of-scope songbooks get `ignored` (still tracked, so new volumes are visible).

*Watcher CLI* (`scripts/sources-check.ts`)
- `bun run sources:check` fetches the live list, diffs it against `sources.json`, and prints: new entries, changed URLs, entries removed upstream (kept locally and marked `removedUpstream`), unknown products, and the asset version change.
- `--write` updates `sources.json`. Exit code `0` = no change, `10` = changes found, `1` = error. CI uses the exit code.
- **Politeness:** at most 2 requests per run (page + asset), no retries faster than 60 s, and an early exit when the asset `?v=` is unchanged since the last check.
- **The watcher never downloads PDFs.** MediaFire download pages are human-facing. Downloading stays a user action (see the runbook), so the watcher only reports links.

*Status CLI* (`scripts/sources-status.ts`)
- `bun run sources:status [--songbook hdd]` prints a table: label, status, file, rows parsed, `needsReview` count. Used for the backfill.

*HDD backfill*
- Target: all **143** HDD monthly PDFs (2015-01 → 2026-11). The user downloads them (they can't be fetched from CI or the agent's cloud sandbox) into `data/pdfs/hdd/` using the `YYYY-MM.pdf` naming. Platinum's own filenames vary (`2025_March_…`, `HDD_2017_Aug_…`, `…_(2).pdf`, `…_Alpha_Major_Cello_X3.pdf`), so `bun run import` accepts the original filename **only** with `--label YYYY-MM` and then renames it.
- **Older months will have older layouts.** Do not assume the 2025–26 `monthly-new-songs` layout holds for 2015–2020. For each distinct layout found:
  1. Stop and show the user one page image + extracted items.
  2. Either extend `monthly-new-songs` with a detected variant or add a new profile, with a fixture.
  3. Keep the contiguity invariant per release.
- **Lineage check (warning → becomes an error once the backfill is complete):** across all HDD monthly releases, codes must form one contiguous run from 2015-01's `code_min` to the latest `code_max`. The report lists every gap and overlap with the releases on each side.

*Fixtures*
- `tests/fixtures/sources/songlist-update-data.js`, a trimmed copy of the real asset (2 products of each kind), plus a mutated copy with a non-literal node, which must be rejected.

**Acceptance criteria**
- `sources:check` against the fixture produces the expected manifest; against the live site (run manually, not in `bun test`) it reports 0 changes immediately after `--write`.
- An injected `songList` change (one new HDD month) yields exit code 10 and exactly one new `missing` entry.
- `sources:status --songbook hdd` lists all 143 months with correct statuses.
- Every HDD PDF the user has provided imports, or is listed in the review with the layout question it raised.
- Gate passes.

---

### Phase 4: Catalog build & search core

**Scope**
- `scripts/build-catalog.ts`: delete and recreate SQLite, import every PDF referenced by `sources.json` (status `present`/`parsed`) plus any manually placed full lists, in songbook → label order, apply corrections and aliases, then emit **one file per songbook**:
  - `static/catalog.<songbook>.<sha256-8>.json`, compact encoding:
    ```json
    { "songbook": "hdd", "version": "2026-11", "generatedAt": "…",
      "artists": ["BINI", "…"],
      "releases": [["2026-05", "42127", "42226"]],
      "songs": [["42195", "Zero Pressure", null, [[0, 0]], 0, []]] }
    ```
    Song tuple: `[code, title, versionNote, [[artistIdx, role]], releaseIdx, altTitles]`. Codes are strings.
  - `static/catalog-manifest.json` → `{ "songbooks": [{ "slug", "name", "models", "file", "version", "count", "codeRanges" }] }` (short cache).
- A Zod `Catalog` schema shared by the writer and the client loader.
- **Search module** (`src/lib/search`, framework-free and worker-safe):
  - Query parsing: all digits → code mode; `a:` → artist; `t:` → title; otherwise title + artist.
  - Code mode: exact string match, then match after left-padding the query to 4 digits (`88` finds `0088`), then prefix.
  - Ranking: exact code > title starts-with > title word-start > title contains > alt-title match > artist match > fuzzy fallback (edit distance ≤ 1 for terms of length ≥ 5).
  - Diacritic- and punctuation-insensitive via `normalize`.
- A Web Worker that fetches the manifest, then the selected songbook's catalog, validates it, builds the index, and answers queries. Cache catalogs in IndexedDB keyed by hash.

**Acceptance criteria**
- Ranking unit tests: `42195` → Zero Pressure first (hdd); `88` and `0088` → A Horse With No Name first (p-series); `cup of joe` → all Cup of Joe songs; `nino` matches titles containing `niño`; `a:bini` returns only BINI-credited songs; `surrender` finds 44387 once (not twice).
- Benchmark test: a query against a synthetic 60k-song catalog completes in < 10 ms (median) in bun.
- Each catalog JSON round-trips through Zod with no loss; leading zeros survive.
- Gate passes.

---

### Phase 5: UI

**Scope** (follow Appendix A; this app maps to the §A14 Dashboard and Mobile web rows)
- App shell: aurora at 6–8%, a glass sticky search bar (bottom-anchored on mobile, top on desktop), solid surfaces for data.
- **Songbook switcher:** shows the models covered ("Major · Alpha · Cello · X3 · Piano XL HDD"), defaults to `hdd`, persists the choice (localStorage, try/catch), and appears in the URL (`?book=`). The song card always shows the songbook so a code is never shown without its context.
- **Coverage notice:** if a songbook is incomplete (HDD before 2015, see §3), say so plainly on the empty state and `/about`, e.g. "Includes songs added from January 2015 onward."
- **Omnibox** with keyboard navigation (↑/↓/Enter/Esc, `/` to focus) and URL sync (`?book=&q=&artist=&release=`) validated by Zod.
- **Results:** TanStack Table + TanStack Virtual. Columns: code (code face, `tabular-nums`, right-aligned, leading zeros shown), title (+ versionNote as a badge), artists (linked). Row hover/selected per §A9.8.
- **Song card:** drawer on mobile, popover/modal on desktop. Shows the code in `--text-hero` code face with a copy button and feedback, plus alt titles if any.
- **Routes:** `/` (search), `/artist/[slug]`, `/new` (latest release of the current songbook, with a release picker), `/about` (sources, coverage per songbook, and a "not affiliated with Platinum Karaoke" notice).
- **Local-only features** (localStorage, wrapped in try/catch): favorites, "tonight's queue", recent searches. All keyed by songbook.
- **States:** skeleton with shimmer while the catalog loads, empty state using the eyebrow → display → subhead pattern, error state with retry.
- **Motion:** AnimeJS for entrance stagger (cap 6 items), the copy-confirm pulse, and drawer transitions. All motion respects `prefers-reduced-motion`.
- Light/dark theme toggle via `data-theme`, with no flash (inline head script).

**Acceptance criteria**
- 320px and 1440px widths work with no horizontal scroll.
- Full keyboard-only walkthrough is possible; every interactive element has a visible focus ring.
- Touch targets ≥ 44px on mobile.
- Switching songbooks never shows a code from the other songbook.
- Gate passes (including `check:tokens`).

---

### Phase 6: Deploy, CI & scheduled watcher

**Scope**
- `adapter-vercel` with every route prerendered; verify the build output contains no serverless functions.
- `vercel.json` headers: `immutable` for `catalog.*.json` and hashed assets; `max-age=60` for `catalog-manifest.json`.
- Vercel project settings for the user to apply (agent does not change them): Install Command `bun install`, Build Command `bun run build`.
- PWA: web manifest + service worker caching the app shell and the last-used songbook catalog (offline after first visit).
- **CI** (`.github/workflows/ci.yml`), on every PR and push to `main`:
  1. `bun install --frozen-lockfile`
  2. `bun run verify`
  3. `bunx playwright install --with-deps && bun run test:e2e` against the preview build
  4. On PRs that touch `data/`, post a comment with the import summary per new PDF: songbook, label, range, row count, `needsReview` rows, gap/lineage warnings, and new near-duplicate artists.
- **Watcher** (`.github/workflows/sources-watch.yml`):
  - Schedule: weekly (Monday 09:17 Asia/Manila → `cron: "17 1 * * 1"` UTC) plus `workflow_dispatch`.
  - Runs `bun run sources:check --write`. On exit 10, it opens **one** issue (or updates the existing open one, labelled `sources`) listing each new entry with its Platinum link and the exact file path to save it as, and pushes the updated `sources.json` on a `chore/sources-<date>` branch with a PR. **This needs the user's approval before it is enabled**, because the workflow commits and opens PRs on its own. Until it is approved, ship it with only `workflow_dispatch` and issue creation (no pushes).
  - On exit 1 (site structure changed), it opens an issue titled `Source watcher broken` with the error.
  - Minimal permissions: `contents: write` and `pull-requests: write` only if auto-PR is approved, otherwise `issues: write` only.
- Set up branch protection on `main` requiring CI to pass. **Hand the settings list to the user to apply; do not change repo settings yourself.**
- Playwright E2E: search by code (incl. a leading-zero code), by title substring, by artist; switch songbook; open a song card and copy the code; offline reload works.

**Acceptance criteria**
- A PR adding a fixture PDF produces a correct summary comment and a working Vercel preview.
- A PR with a corrupted PDF fails CI and cannot merge.
- A manual `workflow_dispatch` run of the watcher against the live site succeeds and creates no issue when nothing changed.
- Lighthouse (mobile) ≥ 95 Performance, 100 Accessibility, 100 Best Practices.
- Gate passes.

---

### Phase 7: Optional extras (each needs user approval before starting)

- **P-series volume additions** (`vol-61` … `vol-78`): a `volume-additional` profile so the P-series songbook runs from the Vol. 59 full list to Vol. 78.
- **More songbooks** from the watcher's `ignored` list, one at a time, each with its own profile and fixtures.
- **Genre enrichment:** `bun run enrich` queries MusicBrainz per artist at ≤ 1 req/s with a descriptive User-Agent and caches results in `data/genres.json` (committed). The build reads the cache; the build never calls the network.
- **API routes**, only if a real need appears: put them under `/api/*`, protect them with the one Vercel Hobby WAF rate-limit rule, and move the DB to a hosted SQLite-compatible service (Turso) with no schema change.

---

## 3. Open items (decide before or during the named phase)

1. **Do P-series codes work on HDD players?** (blocks any HDD/P-series merge; Phase 2). On a Major/Alpha/Cello/X3/Piano XL HDD player, the user enters a few P-series codes and records what plays:
   `3416` (Everything I Do – Bryan Adams), `0088` (A Horse With No Name – America), `7534` (In Your Arms Tonight – Cutting Crew), `44862` (22 – Lily Allen), `11644` (1+1 – Beyonce).
   - All match → codes are shared. Add a `hdd` view that includes P-series songs as a "legacy catalog" with a visible source badge.
   - Any mismatch → keep the songbooks separate (the default in this plan).
2. **HDD pre-2015 base catalog.** Not published on the site. Options, all Platinum-only: the printed/PDF songbook that shipped with the user's player, asking Platinum (services@platinumkaraoke.com) for the HDD full list, or a later HDD full-list PDF if one turns up. Until then the HDD songbook starts at the 2015-01 release and the UI says so.
3. **Where to keep 140+ PDFs.** ~50–60 KB each for monthlies is fine in git. The 20.6 MB full list is borderline: commit it once, or move `data/pdfs/**` to Git LFS. Ask the user before adding LFS.
4. **Auto-PR from the watcher** (Phase 6) needs explicit approval.

---

## 4. Commands (Windows cmd)

**Create the project**
```bat
bunx sv create karaokedex --template minimal --types ts --add prettier eslint playwright tailwindcss="plugins:none" sveltekit-adapter="adapter:vercel" --install bun
cd karaokedex
git init
bunx shadcn-svelte@latest init
bun add zod animejs @tanstack/table-core @tanstack/svelte-virtual minisearch
bun add -d drizzle-orm drizzle-kit unpdf acorn pdf-lib knip prettier-plugin-tailwindcss @types/bun
mkdir data\pdfs\hdd data\pdfs\p-series tests\fixtures\hdd tests\fixtures\p-series tests\fixtures\sources scripts src\lib\parser\profiles src\lib\normalize src\lib\sources src\lib\db src\lib\catalog src\lib\search src\lib\styles .github\workflows
```
Then save this file as `PLAN.md` in the project root (optional: `sources.seed.json` into `data\`).

**Monthly update**
```bat
bun run sources:check
copy "%USERPROFILE%\Downloads\HDD_2026_December_Additional_Song_List.pdf" data\pdfs\hdd\2026-12.pdf
bun run import data\pdfs\hdd\2026-12.pdf
bun run verify
```
Read the import preview, fix flagged rows in `data\corrections.json`, then review, commit, push, and open a PR. If the watcher issue already lists the month, its file path is the one to use.

**From a phone:** open the watcher's issue, download the PDF from the Platinum link, upload it on GitHub to the path the issue names (on a new branch), open a PR, check the CI comment and the Vercel preview, merge.

**Backfill progress**
```bat
bun run sources:status --songbook hdd
```

If CI fails, the live site keeps the last good catalog.

---

## Appendix A: Design system

_Formerly `DESIGN.md`. It is authoritative for every visual decision. Section references like §A3.6 point here._

A portable design language for any app: dashboards, SaaS tools, marketing sites, portfolios, docs, mobile web. It's derived from GitPeak's visual system, but generalized so the *structure* stays fixed while the *brand values* (palette, fonts, radius) are swappable.

**How to use this appendix:** Sections marked **[Fixed]** are the bones. Keep them as-is across projects. Sections marked **[Swappable]** are brand decisions. Change the values, never the roles.

---

### A1 Philosophy [Fixed]

1. **Tokens over values.** Components never contain raw hex, px radii, or ad-hoc durations. They reference semantic tokens. Rebranding means editing one token file.
2. **Depth through translucency, not shadows.** Surfaces float via blur, soft borders, and a 1px ring over an ambient background. Avoid heavy drop shadows and skeuomorphism.
3. **One display voice.** A single accent typeface (serif, or any distinctive face) for the biggest headline moment. Everything else uses the body face. Don't add a second display face.
4. **Dark-first, tinted neutrals.** Base surfaces are slightly tinted (never pure `#000`/`#fff`). Light mode is supported by remapping the same tokens, not by restyling components.
5. **Motion is seasoning.** Short, physical, purposeful: entrance once, feedback on interaction. Ambient loops are limited to two at once.
6. **Large, consistent radius.** One radius family used everywhere; no sharp corners in primary UI.
7. **Accessible by default.** Contrast, focus rings, reduced-motion, and touch targets are part of the system, not an afterthought (see §A12).

---

### A2 Token architecture [Fixed]

Three layers. Components only ever touch layer 3.

```
Layer 1  Primitives   --palette-violet-300: #c4a7e7        (raw values, never used in components)
Layer 2  Semantic     --iris / --base / --text ...          (roles, themeable)
Layer 3  Component    --button-bg / --card-border ...       (optional, per-component aliases)
```

For small projects, collapse to layers 1–2. Never skip straight from primitives to components.

#### Naming rule
Name tokens by **role**, not by color. `--accent`, not `--purple`. The reference palette below uses Rosé Pine names (`iris`, `foam`) for continuity; in a new project you can rename to `--accent` / `--accent-2` and keep identical roles.

---

### A3 Color system

#### A3.1 Roles [Fixed]

| Token | Role | Used for |
| --- | --- | --- |
| `--base` | Page background | `<body>`, app shell |
| `--surface` | Card / panel background | Cards, sidebars, before glass blur |
| `--overlay` | Elevated surface | Popovers, dropdowns, modals, menus |
| `--muted` | Lowest-emphasis | Disabled text, placeholder, decorative icons |
| `--subtle` | Secondary text | Labels, captions, meta, helper text |
| `--text` | Primary text | Body copy, headings |
| `--highlight-low` | Border / divider | Default borders, hairlines |
| `--highlight-med` | Hover / active fill | Row hover, scrollbar thumb, pressed state |
| `--highlight-high` | Strong border / selected | Selected rows, focused container border |
| `--accent` (iris) | **Primary accent** | Primary buttons, links, focus ring, caret, active nav |
| `--accent-2` (foam) | **Secondary accent** | Gradient partner to accent, decorative glows, info chips |
| `--accent-3` (rose) | Tertiary accent | Third stop in gradients only |
| `--success` (pine) | Positive status | Success, online, growth |
| `--warning` (gold) | Caution status | Warnings, pending |
| `--danger` (love) | Negative status | Errors, destructive actions, delete |

Rules:
- **Accents are not status colors.** Accent = brand/interaction. `success/warning/danger` = meaning. Never use `--danger` as decoration or `--accent` for an error.
- Status colors also appear in data-viz. Keep the same mapping in charts.
- Always pair color with another cue (icon, label, shape). Never rely on color alone.

#### A3.2 Reference palette (dark) [Swappable]

```css
:root {
  --base: #191724;
  --surface: #1f1d2e;
  --overlay: #26233a;
  --muted: #6e6a86;
  --subtle: #908caa;
  --text: #e0def4;

  --highlight-low: #21202e;
  --highlight-med: #403d52;
  --highlight-high: #524f67;

  --accent: #c4a7e7;     /* iris */
  --accent-2: #9ccfd8;   /* foam */
  --accent-3: #ebbcba;   /* rose */

  --success: #31748f;    /* pine */
  --warning: #f6c177;    /* gold */
  --danger: #eb6f92;     /* love */
}
```

#### A3.3 Reference palette (light) [Swappable]

Light mode remaps the **same tokens**. Components don't change.

```css
[data-theme='light'] {
  --base: #faf4ed;
  --surface: #fffaf3;
  --overlay: #f2e9e1;
  --muted: #9893a5;
  --subtle: #797593;
  --text: #575279;

  --highlight-low: #f4ede8;
  --highlight-med: #dfdad9;
  --highlight-high: #cecacd;

  --accent: #907aa9;
  --accent-2: #56949f;
  --accent-3: #d7827e;

  --success: #286983;
  --warning: #ea9d34;
  --danger: #b4637a;
}
```

#### A3.4 Building your own palette [Swappable]

To rebrand: keep the **neutral ramp structure** (base → surface → overlay, highlight low → high, muted → subtle → text) and replace accents.

1. Pick a **tinted neutral hue** (violet, blue, green, warm). Base lightness ≈ 8–12% for dark, 96–98% for light, with 3–8% saturation.
2. Surfaces step up in lightness by ~3–5% each (`base` → `surface` → `overlay`).
3. Pick `--accent` with strong presence (L ≈ 65–75% in dark mode) and `--accent-2` ~60–120° around the wheel for gradients.
4. Verify contrast (see §A12) before committing.

#### A3.5 Translucency: always `color-mix()` [Fixed]

Never hand-write `rgba()` for a themed color.

```css
background: color-mix(in srgb, var(--accent) 15%, transparent);
border-color: color-mix(in srgb, var(--subtle) 20%, transparent);
```

Fallback for old browsers: precompute a `--accent-15` style token, but `color-mix()` is supported in all current evergreen browsers.

#### A3.6 Tailwind mapping (optional) [Fixed shape]

```css
@theme {
  --color-base: var(--base);
  --color-surface: var(--surface);
  --color-overlay: var(--overlay);
  --color-muted: var(--muted);
  --color-subtle: var(--subtle);
  --color-text: var(--text);
  --color-accent: var(--accent);
  --color-accent-2: var(--accent-2);
  --color-highlight-low: var(--highlight-low);
  --color-highlight-med: var(--highlight-med);
  --color-highlight-high: var(--highlight-high);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-danger: var(--danger);

  /* shadcn-style aliases */
  --color-background: var(--base);
  --color-foreground: var(--text);
  --color-primary: var(--accent);
  --color-primary-foreground: var(--base);
  --color-border: var(--highlight-low);
  --color-muted-foreground: var(--subtle);
  --color-destructive: var(--danger);
}
```

For non-Tailwind stacks (CSS Modules, styled-components, vanilla), use the CSS variables directly; the roles are identical.

---

### A4 Typography

#### A4.1 Font roles [Fixed roles, Swappable faces]

| Role | Reference face | Job |
| --- | --- | --- |
| **Body** | `DM Mono` (fallback `JetBrains Mono`, `monospace`) | Paragraphs, labels, buttons, nav, tables |
| **Display** | `Instrument Serif` (italic-capable) | The one big headline per page/screen |
| **Code** | `JetBrains Mono` | Code blocks, inline code, IDs, hashes |

```css
:root {
  --font-body: 'DM Mono', 'JetBrains Mono', ui-monospace, monospace;
  --font-display: 'Instrument Serif', Georgia, serif;
  --font-code: 'JetBrains Mono', ui-monospace, monospace;
}
body { font-family: var(--font-body); }
```

**Adapting the body face.** The mono body gives a dev-tool voice. For apps targeting a general audience, swap `--font-body` to a clean sans (Inter, Geist, DM Sans) and keep the display serif + mono for code/meta. The rest of the system doesn't change. Rule: **if you change the body face, keep mono for numbers, IDs, and micro-labels** to preserve the technical texture.

Loading:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=JetBrains+Mono:wght@300;400;500&display=swap" />
```

Use `font-display: swap` and self-host for production when possible.

#### A4.2 Type scale [Fixed]

| Token | Size | Use |
| --- | --- | --- |
| `--text-micro` | 10px | Badges, counts, chart ticks |
| `--text-xs` | 12px | Meta, captions, helper text |
| `--text-sm` | 14px | Default UI text, buttons, table cells |
| `--text-base` | 16px | Long-form body, inputs (prevents iOS zoom) |
| `--text-lg` | 18–20px | Card titles, lead paragraphs |
| `--text-2xl` | 24–28px | Section titles (display face) |
| `--text-4xl` | 40–48px | Page titles |
| `--text-hero` | 56–72px | Hero headline (display face, once per page) |

Line height: `1` for hero, `1.2` for headings, `1.5–1.6` for body.
Tracking: hero `-0.02em`; body `0`; uppercase labels `+0.15em` to `+0.2em`.

#### A4.3 The signature header pattern [Fixed]

Eyebrow → display headline → subhead. Use for page titles, empty states, onboarding, section intros.

```html
<header class="page-header">
  <span class="eyebrow">section label</span>
  <h1 class="display"><span class="gradient-text">Product Name</span></h1>
  <p class="subhead">one-line description of what this is</p>
</header>
```

```css
.eyebrow {
  font: 400 0.7rem/1 var(--font-body);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--subtle);
}
.display {
  font: 400 clamp(2.5rem, 6vw + 1rem, 4.5rem)/1 var(--font-display);
  letter-spacing: -0.02em;
}
.subhead {
  font: 400 0.75rem/1.5 var(--font-body);
  letter-spacing: 0.05em;
  color: var(--subtle);
  margin-top: 0.25rem;
}
```

Scale it down for inner pages: eyebrow stays the same, display drops to `--text-2xl`/`--text-4xl`, subhead is optional.

#### A4.4 Gradient text [Fixed]

```css
.gradient-text {
  color: var(--accent); /* fallback */
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 50%, var(--accent-3) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

Use on **one** element per screen. Gradient text on body copy or multiple headings kills the effect.

---

### A5 Spacing, radius, elevation

#### A5.1 Spacing scale [Fixed]

4px base unit. Use only these steps: `4, 8, 12, 16, 24, 32, 48, 64, 80, 96`.

```css
:root {
  --space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
  --space-6: 24px;  --space-8: 32px;  --space-12: 48px; --space-16: 64px;
  --space-20: 80px; --space-24: 96px;
}
```

Responsive page padding: `40px` (mobile) → `64px` (sm) → `80px` (md+). Section gap: `32px` → `48px`. Inside cards: `24px`. Inside dense controls: `8–12px`.

#### A5.2 Radius [Swappable value, Fixed usage]

```css
:root {
  --radius-sm: 8px;    /* badges, small chips */
  --radius-md: 12px;   /* inputs, inline controls */
  --radius-lg: 16px;   /* search bars, popovers */
  --radius-xl: 32px;   /* cards, buttons (the "4xl" look) */
  --radius-full: 9999px;
}
```

Rule: **nested radius = outer radius − padding.** A card at `32px` with `8px` padding holds children at `24px`.
Tone dial: set `--radius-xl` to `12px` for a more utilitarian/enterprise feel; the system still holds.

#### A5.3 Elevation [Fixed]

Three levels, built from ring + blur + soft shadow:

| Level | Recipe | Use |
| --- | --- | --- |
| 0 | none | Page content |
| 1 | `box-shadow: 0 0 0 1px color-mix(in srgb, var(--text) 5%, transparent), 0 4px 6px -1px rgb(0 0 0 / .2)` | Cards, panels |
| 2 | `.glass` (below) | Floating: search, toasts, sticky headers |
| 3 | `.glass` + stronger shadow `0 32px 64px -16px rgb(0 0 0 / .45)` | Modals, command palette |

#### A5.4 Glass surface [Fixed]

```css
.glass {
  background: color-mix(in srgb, var(--surface) 60%, transparent);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid color-mix(in srgb, var(--subtle) 15%, transparent);
  box-shadow:
    0 1px 0 0 color-mix(in srgb, var(--text) 6%, transparent) inset,
    0 32px 64px -16px rgb(0 0 0 / 0.45);
}
```

Glass only reads well over a non-flat background (the aurora in §A6, an image, or a gradient). On a flat background, use a solid `--surface` with the level-1 ring. Always provide a solid fallback for browsers without `backdrop-filter`:

```css
@supports not (backdrop-filter: blur(1px)) {
  .glass { background: var(--surface); }
}
```

#### A5.5 Decorative color blobs [Fixed]

Soft radial glows inside cards add color without noise:

```html
<div aria-hidden="true" class="blob"></div>
```
```css
.blob {
  position: absolute; top: -48px; left: -48px;
  width: 176px; height: 176px; border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  filter: blur(64px);
  pointer-events: none;
}
```
Parent needs `position: relative; overflow: hidden`; content wrapper needs `position: relative` so it sits above the blob. One blob per card, max two.

---

### A6 Atmosphere: the aurora background [Fixed]

Two slow, blurred radial gradients drifting behind everything. Place once at the app root.

```html
<div class="aurora-bg" aria-hidden="true"></div>
```
```css
.aurora-bg {
  position: fixed; inset: 0; z-index: -10;
  background-color: var(--base);
  overflow: hidden;
}
.aurora-bg::before,
.aurora-bg::after {
  content: ''; position: absolute; border-radius: 50%;
  filter: blur(120px);
  animation: drift 25s ease-in-out infinite;
}
.aurora-bg::before {
  width: 70vw; height: 70vw; top: -20%; left: -10%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 12%, transparent) 0%, transparent 70%);
  animation-duration: 20s;
}
.aurora-bg::after {
  width: 60vw; height: 60vw; bottom: -15%; right: -10%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent-2) 10%, transparent) 0%, transparent 70%);
  animation-duration: 28s;
  animation-direction: reverse;
}
@keyframes drift {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%      { transform: translate(40px, -60px) scale(1.08); }
  66%      { transform: translate(-30px, 40px) scale(0.95); }
}
```

Intensity dial: raise the `12%` / `10%` mix values for marketing pages; lower to `6–8%` for data-dense dashboards so charts stay readable.
Performance: on low-power devices or `prefers-reduced-motion`, drop the animation and keep the static gradients.

**Alternatives when aurora doesn't fit** (e.g., a document-heavy app): a single static radial gradient at one corner, or a subtle noise/grid texture at 3–5% opacity. Keep the same glass surfaces on top.

---

### A7 Motion

#### A7.1 Principles [Fixed]

- **Two categories only:** entrance and interaction feedback. Plus two permitted ambient loops (aurora drift, loading shimmer/pulse).
- Animate only `transform`, `opacity`, `filter`, `clip-path`. Never layout properties (`width`, `height`, `top`, `margin`).
- Motion should communicate (something appeared, something is pressable, something is loading). If it communicates nothing, remove it.

#### A7.2 Tokens [Fixed]

```css
:root {
  --dur-fast: 150ms;     /* hover, press, color change */
  --dur-base: 250ms;     /* lift, toggles, popovers */
  --dur-slow: 350ms;     /* modals, drawers, page transitions */
  --dur-enter: 500ms;    /* entrance fade-up */
  --ease-snappy: cubic-bezier(0.25, 1, 0.5, 1);  /* hover/press/overlays */
  --ease-ambient: ease-in-out;                    /* loops only */
  --stagger: 80ms;                                /* entrance stagger step */
}
```

#### A7.3 Patterns [Fixed]

**Entrance**
```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
.fade-in-up { animation: fadeInUp var(--dur-enter) ease both; }
/* stagger: style="animation-delay: calc(var(--stagger) * N)" */
```
Cap stagger at ~6 items; beyond that, animate the group as one.

**Hover lift / press dip**
```css
.lift { transition: transform var(--dur-base) var(--ease-snappy); }
.lift:hover  { transform: translateY(-2.5px); }
.lift:active { transform: translateY(1px) scale(0.98); }
```

**Loading shimmer**
```css
.shimmer { position: relative; overflow: hidden; }
.shimmer::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent 0%,
    color-mix(in srgb, var(--accent) 11%, transparent) 40%,
    color-mix(in srgb, var(--text) 15%, transparent) 50%,
    color-mix(in srgb, var(--accent) 11%, transparent) 60%,
    transparent 100%);
  transform: translateX(-100%);
  animation: shimmer 2s ease-in-out infinite;
}
@keyframes shimmer { to { transform: translateX(100%); } }
```

**Overlays (modal / popover / drawer)**: fade + 8–12px translate, `--dur-slow`, `--ease-snappy`. Exit is faster than enter (~70% of duration).

#### A7.4 Reduced motion [Fixed, required]

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  .aurora-bg::before, .aurora-bg::after { animation: none; }
}
```

---

### A8 Layout

- **Max content width:** `1200px` for apps and dashboards, `720px` for reading/long-form, `1440px` for marketing. Center with `margin-inline: auto`.
- **Grid:** 12-column on desktop, 4 on mobile, `24px` gutter (`16px` mobile).
- **Breakpoints:** `640` (sm), `768` (md), `1024` (lg), `1280` (xl). Design mobile-first.
- **App shell:** sidebar (`240–280px`, glass or solid `--surface`) + top bar (glass, sticky) + content on the aurora. Collapse sidebar to a drawer below `lg`.
- **Density modes:** comfortable (default: `--space-4` row padding) and compact (`--space-2`). Implement as a single `data-density` attribute that remaps spacing tokens, not per-component overrides.
- **Z-index scale:** `-10` background · `0` content · `10` sticky · `20` dropdown · `30` modal · `40` toast · `50` tooltip.

---

### A9 Components

Each component lists **anatomy, tokens, states**. All interactive components must implement: default, hover, active/pressed, focus-visible, disabled, and (where relevant) loading and error.

#### A9.1 Button

Base: `radius-xl`, `text-sm`, weight 500, icon-aware padding, press feedback, disabled at `opacity: .5` + `pointer-events: none`.

| Variant | Style | Use |
| --- | --- | --- |
| `primary` | `bg: --accent`, `color: --base`, hover `accent @ 80%` | One per view |
| `gradient` | Tinted wash: `linear-gradient(135deg, accent 20%, accent-2 15%)`, `border: accent @ 25%`, text `--accent`, uppercase, wide tracking | Hero CTA |
| `secondary` | `bg: --highlight-low`, hover `--highlight-med` | Supporting actions |
| `outline` | `border: --highlight-med`, transparent bg, hover `--highlight-low` | Tertiary |
| `ghost` | Transparent, hover `--highlight-med` | Toolbars, icon buttons |
| `link` | `color: --accent`, underline on hover, `offset: 4px` | Inline |
| `danger` | `bg: --danger @ 15%`, `color: --danger`, border `--danger @ 30%` | Destructive |

Sizes: `xs 24px · sm 32px · md 36px · lg 40px`. Icon-only buttons are square at the same sizes. Minimum touch target 44×44px on touch devices (pad the hit area if the visual is smaller).

Loading: replace the label with a spinner of the same width (avoid layout shift), set `aria-busy="true"`.

#### A9.2 Card

```css
.card {
  position: relative; overflow: hidden;
  display: flex; flex-direction: column; gap: var(--space-6);
  padding-block: var(--space-6);
  border-radius: var(--radius-xl);
  background: var(--surface);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--text) 8%, transparent),
              0 4px 6px -1px rgb(0 0 0 / .2);
  font-size: var(--text-sm);
}
.card.glass { background: color-mix(in srgb, var(--surface) 60%, transparent); }
```
Anatomy: header (eyebrow/title/action) · content · footer (optional). Interactive cards get `.lift` and a focus ring on the whole card.

#### A9.3 Input / Field

Two patterns:

**A. Embedded (search bars, command inputs):** transparent, borderless input living inside a `.glass` wrapper that owns the border/focus state.
```css
.input-embedded {
  flex: 1; border: 0; background: transparent; outline: none;
  padding: 12px 8px; font: 400 var(--text-base) var(--font-body);
  caret-color: var(--accent);
}
.input-embedded::placeholder { opacity: .3; }
.glass:focus-within { border-color: color-mix(in srgb, var(--accent) 50%, transparent); }
```

**B. Standalone (forms):** `bg: --highlight-low`, `border: 1px solid --highlight-med`, `radius-md`, `height 40px`, `padding 0 12px`. Focus: border `--accent` + focus ring.

Always: visible `<label>` (eyebrow style OK), helper text in `--subtle`, error text in `--danger` with an icon and `aria-describedby`. Inputs are `16px` minimum to prevent mobile zoom. `caret-color: var(--accent)` everywhere.

#### A9.4 Badge / chip / tag

Tinted, not solid:
```css
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 8px; border-radius: var(--radius-sm);
  font: 400 var(--text-micro)/1 var(--font-body);
  background: color-mix(in srgb, var(--tone, var(--accent-2)) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--tone, var(--accent-2)) 20%, transparent);
  color: var(--tone, var(--accent-2));
}
/* usage: style="--tone: var(--success)" */
```
Status badges set `--tone` to `success/warning/danger` and include an icon or dot.

#### A9.5 Navigation

- **Top bar:** glass, sticky, `56–64px`, logo left, actions right. Active link: `--accent` text + 2px underline or tinted pill.
- **Sidebar:** items `36–40px`, `radius-lg`, icon + label. Active: `bg: accent @ 12%`, text `--accent`. Hover: `--highlight-med @ 50%`.
- **Tabs:** underline style (2px `--accent` indicator, animated with `transform`) or segmented pill inside a `--highlight-low` track.
- **Breadcrumbs:** `text-xs`, `--subtle`, separator `/` in `--muted`, current page in `--text`.
- **Mobile:** bottom tab bar (glass, 5 items max) or a drawer.

#### A9.6 Modal / dialog / drawer

Level-3 glass on a scrim: `background: color-mix(in srgb, var(--base) 60%, transparent)` + `backdrop-filter: blur(4px)`. Radius `--radius-xl`. Max width `480px` (confirm), `640px` (form), full-height drawer `420px` from the right. Trap focus, close on `Esc`, return focus to the trigger, lock body scroll.

#### A9.7 Popover / dropdown / tooltip

`--overlay` background (solid or glass), `radius-lg`, 1px ring, level-2 shadow. Menu items 32–36px, hover `--highlight-med`. Tooltips: `text-xs`, delay 300ms, never contain interactive content.

#### A9.8 Table / data list

No heavy grid lines. Header row: eyebrow style (`uppercase`, `--subtle`, `0.15em` tracking). Rows separated by `--highlight-low` hairlines; hover `--highlight-med @ 40%`; selected `accent @ 8%` with a 2px left accent bar. Numbers right-aligned in the code/mono face with tabular figures (`font-variant-numeric: tabular-nums`). Sticky header on a glass background.

#### A9.9 Toast / notification

Level-2 glass, `radius-lg`, bottom-right (top-center on mobile), 4–6s auto-dismiss (persist errors), icon + message + optional action, tinted left bar for status. Announce via `role="status"` (or `role="alert"` for errors).

#### A9.10 Empty, loading, error states

- **Loading:** skeletons with `.shimmer` matching final layout; spinner only for button/inline actions. Show skeleton after ~200ms to avoid flash.
- **Empty:** the eyebrow → display → subhead pattern at a smaller scale + one primary action + a faint decorative blob.
- **Error:** `--danger` tinted card, plain-language message, retry action. Never show raw stack traces.

#### A9.11 Charts / data-viz

Series colors in order: `--accent`, `--accent-2`, `--accent-3`, then `--success`, `--warning`, `--danger` reserved for their meaning. Gridlines `--highlight-low`; axis text `--subtle` at `text-micro` in the code face. Fills use `color-mix()` at 15–25% under strokes. Tooltips are glass. Never rely on color alone: add direct labels or patterns.

#### A9.12 Scrollbars

```css
* { scrollbar-width: thin; scrollbar-color: var(--highlight-med) transparent; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background-color: var(--highlight-med); border-radius: 99px; }
```

---

### A10 Iconography [Fixed]

- **Library:** [Lucide](https://lucide.dev) (thin-stroke, geometric, pairs with mono type). One icon library per project, no mixing.
- **Stroke:** `1.5–2px`, consistent. **Sizes:** `12 / 14 / 16 / 20 / 24`. Icons next to text should be slightly *smaller* than the text's cap height equivalent (e.g. 13–14px beside 14px text), not larger.
- Decorative icons: `aria-hidden="true"`. Icon-only buttons need `aria-label`.
- Color: inherit `currentColor`; tint with tokens, never hard-coded.

---

### A11 Imagery & illustration

- Avatars/thumbnails: `radius-lg` or `full`, 1px ring (`--highlight-med`), no heavy borders.
- Photos get a soft overlay gradient (`--base` → transparent) when text sits on top.
- Illustrations: flat, limited to palette tokens, 1.5px strokes to match icons. Avoid stock 3D/clipart styles.
- Empty-state and hero visuals can use the blob + aurora treatment instead of illustration.

---

### A12 Accessibility [Fixed, required]

- **Contrast:** body text ≥ 4.5:1 against its surface, large text and UI components ≥ 3:1. Check `--subtle` and `--muted` on `--surface` *and* on glass over the aurora. `--muted` is for non-essential text only.
- **Focus:** every interactive element has a visible `:focus-visible` ring:
  ```css
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: inherit; }
  ```
  Never `outline: none` without a replacement.
- **Targets:** ≥ 44×44px touch, ≥ 24×24px pointer.
- **Motion:** honor `prefers-reduced-motion` (§A7.4). No auto-playing motion that can't be paused beyond the two ambient loops.
- **Transparency:** honor `prefers-reduced-transparency` / `prefers-contrast: more` by switching glass to solid `--surface` and strengthening borders.
  ```css
  @media (prefers-contrast: more), (prefers-reduced-transparency: reduce) {
    .glass { background: var(--surface); backdrop-filter: none; border-color: var(--highlight-high); }
  }
  ```
- **Semantics:** real `<button>`, `<a>`, `<label>`, landmarks, heading order. Don't convey state by color alone.
- **Gradient text:** keep a solid `color` fallback and ensure the lightest gradient stop still meets 3:1 for large text.

---

### A13 Theming & customization

**Theme switching** (optional): set `data-theme="light|dark"` on `<html>`, remap the §A3 tokens, persist the choice, and default to `prefers-color-scheme`. Avoid a flash by setting the attribute in an inline script in `<head>`.

**Multiple brand themes:** because components only use roles, a theme is just a token block:
```css
[data-theme='ocean'] { --base:#0b1620; --surface:#10212e; --accent:#5ec4ff; --accent-2:#7af0d4; /* ... */ }
```

**Customization dials** (adjust these first when adapting to a new product):

| Dial | Low-key / enterprise | Default | Expressive / consumer |
| --- | --- | --- | --- |
| `--radius-xl` | 8–12px | 32px | 32–40px |
| Aurora intensity | off / 6% | 10–12% | 18–25% |
| Glass blur | none (solid) | 20px | 28px |
| Display face usage | headings only | hero only | hero + section titles |
| Motion durations | ×0.8 | ×1 | ×1.2 |
| Gradient text | none | hero | hero + accents |

---

### A14 Adapting to app types

| App type | Emphasis | Adjustments |
| --- | --- | --- |
| **Dashboard / analytics** | Density, legibility | Aurora at 6–8%, compact density, solid surfaces for tables, glass only for floating UI, tabular mono numbers, sans body face optional |
| **SaaS product / admin** | Clarity, speed | Smaller radius (12–16px), one primary button per view, sidebar shell, restrained gradients |
| **Marketing / landing** | Impact | Full eyebrow→display→subhead hero, strong aurora, gradient CTA, large spacing (`96px` section gaps), staggered entrances |
| **Portfolio / personal** | Personality | Serif display used more, project cards with blobs, hover lifts, minimal nav |
| **Docs / content** | Readability | `720px` measure, body `16px` / 1.6, solid surfaces, glass only on nav, code face for blocks, no ambient loops |
| **Mobile web / PWA** | Touch | 44px targets, bottom tab bar, drawers instead of popovers, reduce blur radius to `12px` for performance |
| **E-commerce** | Trust, conversion | Solid cards for product grids, status tokens for stock/price changes, restrained motion near checkout |

---

### A15 Implementation checklist

1. Add the fonts and define the §A3 tokens (dark + light blocks).
2. Add base CSS: `body` bg/color/font, `::selection`, scrollbars, `:focus-visible`, reduced-motion block.
3. Add the `.aurora-bg` element once at the app root (or the chosen alternative).
4. Create `.glass`, `.gradient-text`, `.fade-in-up`, `.lift`, `.shimmer` utilities.
5. Build primitives in this order: Button → Card → Input → Badge → Nav → Modal/Popover → Table → Toast.
6. Verify: contrast pass in both themes, keyboard-only walkthrough, reduced-motion on, 320px and 1440px widths, glass fallback with `backdrop-filter` disabled.

---

### A16 Do / Don't

**Do**
- Reference tokens, never raw values; use `color-mix()` for every translucent tint.
- Keep the eyebrow → display → subhead rhythm for titles.
- Use one primary button, one gradient-text element, and one display headline per view.
- Keep radius, spacing, and durations on their scales.
- Pair every status color with an icon or label.
- Let aurora + glass provide depth; use the 1px ring for definition.
- Test with reduced motion, high contrast, and a keyboard.

**Don't**
- Don't introduce a second display face or mix icon libraries.
- Don't use pure black/white, or neutrals with no tint.
- Don't use accents (`--accent`, `--accent-2`) to mean success/error.
- Don't stack heavy drop shadows or skeuomorphic bevels.
- Don't run more than the two ambient loops (aurora drift, shimmer/pulse) at once.
- Don't animate layout properties or use linear easing for interaction.
- Don't put glass on a flat background, or put long-form text on glass over a busy backdrop.
- Don't use `--muted` for text that carries meaning.
- Don't hardcode hex values in components.
