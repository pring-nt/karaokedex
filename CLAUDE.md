# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read PLAN.md first

[PLAN.md](PLAN.md) is the source of truth for this repo: a phased build plan (Phase 0-7), standing directives, the data model, parser rules, and the design system (Appendix A, authoritative for all visual decisions). When PLAN.md conflicts with a default or habit, PLAN.md wins. Work one phase at a time and do not start a phase until the previous phase's gate passes and the user approves the review.

KaraokeDex is a searchable web songbook for **Platinum Karaoke only**. Song codes, titles and artists are parsed from Platinum's official songlist PDFs. Never ingest another brand's catalog.

## Current state

Phases 0 to 5 are implemented. Tokens and the `verify` gate; the monthly "New Songs" parser (all layouts, 2015 to 2026) and the P-series full-list parser; normalization, validation, corrections, the SQLite writer, `bun run import <pdf>`; the source watcher (`bun run sources:check [--write]`, exit 10 on changes; `bun run sources:status [--songbook hdd] [--write]`; manifest in `data/sources.json`); and the catalog build and search core. `playwright test` has no tests until Phase 6.

`bun run catalog:update` parses every listed PDF that exists, writes them to an in-memory database in songbook then label order, and emits `data/catalogs/catalog.<songbook>.<hash8>.json` plus `catalog-manifest.json`. Those files are committed; `data/pdfs/` is gitignored and never deployed. `bun run dev` and `bun run build` run `catalog:copy`, which copies them to `static/` (gitignored), so neither needs PDFs. To add a release: `sources:check --write`, download the PDF to the listed path, `sources:status --write`, `catalog:update`, then commit `data/`. The hash covers the data, not `generatedAt`. A release with errors is left out and fails the build, and so does a correction that matches no row. With no PDFs present `catalog:update` fails and leaves the committed catalogs alone. The compact catalog format and its Zod schema are in `src/lib/catalog/schema.ts`; the same schema validates on write and on load.

Search (`src/lib/search`) is framework-free: `parseQuery` (digits are a code, `a:` artist, `t:` title), `SearchIndex` (linear scan over normalized strings with a cheap substring reject, tiered ranking, one-edit typo fallback), `SearchEngine` (manifest, then catalog from an injected cache, validate, index) and `worker.ts` (the web worker around the engine, with an IndexedDB cache in `cache.ts`; nothing imports it until the UI exists). Results are unbounded, because the table sorts and pages them client-side, so a search sorts every match. The largest catalog is about 16k songs and the benchmark holds that under 10 ms.

The UI (Phase 5) is client-side over the prerendered shell. `src/lib/app/catalog.svelte.ts` talks to the search worker (created lazily, browser only) and tags every answer with its songbook, so a slow answer for the previous songbook is never shown after a switch. `src/lib/app/preferences.svelte.ts` keeps theme, font, songbook, favorites, tonight's queue and recent searches in `localStorage` (all wrapped, per songbook). The URL carries `?book=&q=&field=&artist=&release=&sort=&letter=&year=&versions=`, validated by `src/lib/app/url.ts` (invalid values are dropped); `patchSearch` updates it in place with a real `goto`, because a shallow one leaves `page.url` behind. `SongPanel` runs a search (or a fixed code list) and renders skeleton, error, empty and results states; `ResultsTable` is TanStack Table (sorting, column filters, pagination, all client-side, so `SongPanel` asks the worker for the whole result set) plus a window virtualizer; the home page browses the whole songbook A to Z and sorts by best match only while there is a query, and `src/lib/app/browse.ts` holds the sort and filter logic. Themes (`src/lib/app/themes.ts`) and fonts (`src/lib/app/fonts.ts`) are independent `data-theme` and `data-font` attributes on `<html>`, set before first paint by the inline script in `src/app.html`, which must stay in sync with both lists. Selects use shadcn through `SelectField.svelte`. Phones are the primary target, so check UI changes at 375 px first: below `md` the hero is visually hidden, filters collapse behind a button, and `aboveKeyboard` keeps the bottom search bar over the on-screen keyboard; `SongCard` is a bits-ui dialog, a bottom sheet on mobile. `/artist` is one page that reads `?artist=<slug>` and fetches songs in the browser. Do not prerender a page per artist: Vercel rejects deployments with more than about 2,048 routes, and the adapter writes two routes per prerendered page.

Both profiles share one row assembler (`profiles/full-list.ts`): rows are built in content-stream order, code anchors are found by font, and chrome is dropped by type size, position and (monthly only) a short list of in-table headers, advert lines and playlist headings. An artist cell merged over several rows is printed once, after the last row, and is shared back to the preceding rows that have no artist. Fragments are joined with a space, except a 1-2 character lowercase line start, which is a word broken mid-word and is joined without one and flagged `short-continuation`.

Monthly releases are not contiguous: older ones print a new block plus codes from earlier ranges, and some re-list codes from earlier releases. So `validateMonthlyRelease` only errors on duplicate codes inside one release; code runs are reported as a warning, and the lineage check uses each release's longest run. `writeRelease` must be called in ascending label order: a repeated code keeps its first release, takes the later spelling, and every listing is recorded in `song_releases`.

Ten songbooks are built. `ks` merges Platinum's KS-5, KS-40 and KS-100 lists (`sourceSongbook` maps them), the default because the binder listing names LX15 and CX15. Every list except `hdd` and `p-series` uses `profiles/volume-list.ts`: it strips footers, inline chrome and the `Title` header, then reuses the shared row assembly. `vol-N` labels must sort with `numeric: true`, and the same file may serve several songbooks, so file hashes are unique per songbook only.

All lists share one numbering, including the P-Series Vol. 59 full list (496 of its codes overlap, only 15 with different spelling). P-Series update volumes do disagree, so they are never parsed. `buildShared` merges them into `catalog.shared.<hash>.json`: each code, spelled as in the first list in `SHARED_SONGBOOKS`, with every list that prints it. `SearchEngine` keeps two pools, the loaded songbook and everything only other lists print, and `SongPanel others` shows the second. A shared code proves the song is the same, not that a given machine has it, so the UI must always label those songs as listed for other machines. Codes 17128 and 28414 name different songs in different lists and are unresolved. `data/corrections.json` fixes cut-off and swapped rows per songbook.

`2021-03` prints code 29386 for two songs (`Tagong Gugma` and `Ako Ang Namingwit`; 29369 is the missing code). `data/corrections.json` moves `Ako Ang Namingwit` to 29369. That choice is an unverified guess from the neighbouring Ilocano songs, so check it against the player if it matters.

`knip.jsonc` ignores dependencies from the planned stack that no code imports yet (and the vendored shadcn code, `src/lib/utils.ts` and `src/lib/components/ui`); delete each entry in the phase that first uses it.

No songlist PDF is tracked, including `tests/fixtures/{hdd,p-series}/*.pdf`, which are local copies (HDD files come from `data/pdfs/hdd`, P-Series samples from `scripts/make-fixtures.ts`). Tests that need them skip without them, as they do in CI, so run the suite locally when changing a parser.

Page metadata lives in `Seo.svelte`, which every route uses, and `src/lib/site.ts` holds the public address used by link previews, the sitemap and `robots.txt`. Change `SITE_URL` there if the domain moves. `static/og.png` and the icons are generated images, not build output.

## Commands

Use **bun**, not npm/pnpm/yarn (`.npmrc` sets `engine-strict=true`; do not add other lockfiles).

```bash
bun install
bun run dev            # vite dev
bun run build          # copy committed catalogs, then vite build
bun run catalog:update # reparse local PDFs into data/catalogs (commit the result)
bun run check          # svelte-kit sync && svelte-check
bun run lint           # eslint . --max-warnings 0
bun run format         # prettier --write .
bun run test           # bun test (tests/**/*.test.ts)
bun run test:e2e       # playwright test (e2e files: **/*.e2e.{ts,js})
bun run import <pdf>   # parse, preview and write one release to data/karaokedex.sqlite
bun run verify         # the full gate
```

Run a single unit test: `bun test tests/check-tokens.test.ts -t "name"`. Run a single Playwright test: `bunx playwright test path/to/file.e2e.ts -g "test name"`.

The end-of-phase gate is `bun run verify` (format check, lint with `--max-warnings 0`, svelte-check with `--fail-on-warnings`, token check, knip, `bun test`, build) and must pass with zero warnings. Never disable rules or add `eslint-disable`, `@ts-ignore` or `@ts-expect-error` to get it green; ask instead.

The user's shell is Windows cmd: any command you present for the user must be cmd-compatible (no `\` line continuations, `mkdir -p`, `cp`, `rm`, brace expansion). `package.json` scripts must be cross-platform (`bun scripts/x.ts`).

## Architecture (planned, see PLAN.md for detail)

- **Build-time database, static site.** Source of truth is `data/pdfs/**` (local only) + `data/sources.json` + `data/corrections.json` + `data/aliases.json`. `catalog:update` recreates an ephemeral SQLite file (Drizzle + `bun:sqlite`, gitignored) and emits one content-hashed catalog per songbook to `data/catalogs/`, which `catalog:copy` serves from `static/`. SvelteKit prerenders every route (`export const prerender = true` in `+layout.ts`) on Vercel; the browser fetches the selected songbook's catalog and searches it locally in a Web Worker. No server functions on normal use.
- **Songbooks.** Platinum publishes separate songlists per player family; each is a "songbook" (`ks` is the default). A song code is only meaningful within its songbook, and the UI must never show a code without its songbook. Only the P-Series full list joins the shared numbering, never its update volumes.
- **Parser pipeline** (`src/lib/parser`): `extract.ts` pulls text items with geometry and font via `unpdf` (text layer, not the image). Profiles (`monthly-new-songs`, `full-list`) anchor on the bold code font, classify items by x-position, and assemble rows in **content-stream order, not by geometry**. Profile is chosen explicitly from songbook + filename, and each profile asserts its page signature.
- **Identity.** The song code is the only identity within a songbook: never dedupe on title or artist. Codes are **strings** (leading zeros like `0088` must survive end to end).
- **Source watcher** (`src/lib/sources`, `scripts/sources-check.ts`): discovers the `songlist-update-data.js` Shopify asset from the songlist page HTML (never hardcode the theme path), parses `const songList` with `acorn` by walking literal nodes only (never `eval`), and diffs against `data/sources.json`. It never downloads PDFs; the user does. `data/sources.seed.json` is a 2026-10-30 snapshot of the site.
- **Framework-free modules.** Parsing, normalization, search ranking and watcher diffing live in plain TS (no Svelte imports) so they can be unit tested with `bun test`; `src/lib/search` must be worker-safe.

## Code conventions specific to this repo

- Import from `src/lib` through the `#lib/*` alias (defined in `package.json` `imports` and mirrored in `tsconfig.json` `paths`, also used by `components.json`) in Svelte files and routes. SvelteKit 3 has no `$lib`, and `$app/env` replaces `$app/environment`.
- SvelteKit config is inline in `vite.config.ts` (there is no `svelte.config.js`); runes mode is forced for everything outside `node_modules`.
- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`); no legacy `export let` or stores for component state.
- TypeScript strict, no `any`, no `!` outside tests. Zod validates every boundary (parsed rows, catalog JSON on write and load, URL params, corrections/aliases/sources JSON, remote `songList`).
- Tokens, never raw values: no hex/rgb literals, raw px radii or raw ms durations in `src/lib/components/**` or `src/routes/**`. Raw values live only in `src/lib/styles/tokens.css` (three layers: primitives, semantic roles, optional component aliases; Tailwind `@theme` maps to the semantic tokens). `src/lib/styles/base.css` holds the base and typography classes (also unscanned); `src/routes/layout.css` only imports them.
- Prettier uses tabs, single quotes, no trailing commas, width 100, and the Svelte and Tailwind plugins (Tailwind stylesheet is `src/routes/layout.css`).
- In Tailwind `text-base` is both the font size and the page-background colour (`--color-base`), so it makes text invisible. Use `text-[length:var(--text-base)]` for the size and `text-[color:var(--base)]` for the colour.
- Links must pass `svelte/no-navigation-without-resolve`: write `href={resolve(`/new?book=${songbook}`)}` with the query inside the route string. The one exemption is `src/lib/app/navigate.ts`, which rewrites the query of the URL the router already resolved.
- UI primitives come from shadcn-svelte (style `lyra`, Phosphor icons) under `#lib/components/ui`.

## Workflow rules from PLAN.md

- Never commit, branch, push or open PRs without explicit user approval. At the end of a phase, stage nothing; present changed files, proposed branch (`feat/<phase-slug>`) and Conventional Commit messages, using the phase review template in PLAN.md section 0.4.
- Check what is on PATH before assuming a tool; ask before installing anything globally.
- Stop and ask when the spec is ambiguous or a sample PDF contradicts an assumption.
