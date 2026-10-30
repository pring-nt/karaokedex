# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read PLAN.md first

[PLAN.md](PLAN.md) is the source of truth for this repo: a phased build plan (Phase 0-7), standing directives, the data model, parser rules, and the design system (Appendix A, authoritative for all visual decisions). When PLAN.md conflicts with a default or habit, PLAN.md wins. Work one phase at a time and do not start a phase until the previous phase's gate passes and the user approves the review.

KaraokeDex is a searchable web songbook for **Platinum Karaoke only**. Song codes, titles and artists are parsed from Platinum's official songlist PDFs. Never ingest another brand's catalog.

## Current state

Phases 0 to 5 are implemented. Tokens and the `verify` gate; the monthly "New Songs" parser (all layouts, 2015 to 2026) and the P-series full-list parser; normalization, validation, corrections, the SQLite writer, `bun run import <pdf>`; the source watcher (`bun run sources:check [--write]`, exit 10 on changes; `bun run sources:status [--songbook hdd] [--write]`; manifest in `data/sources.json`); and the catalog build and search core. `playwright test` has no tests until Phase 6.

`bun run catalog:build` (also the first half of `bun run build`) parses every listed PDF that exists, writes them to an in-memory database in songbook then label order, and emits `static/catalog.<songbook>.<hash8>.json` plus `static/catalog-manifest.json` (both gitignored, regenerated each build). The hash covers the data, not `generatedAt`. A release with errors is left out and fails the build, and so does a correction that matches no row. With no PDFs present it writes an empty manifest and succeeds. The compact catalog format and its Zod schema are in `src/lib/catalog/schema.ts`; the same schema validates on write and on load.

Search (`src/lib/search`) is framework-free: `parseQuery` (digits are a code, `a:` artist, `t:` title), `SearchIndex` (linear scan over normalized strings with a cheap substring reject, tiered ranking, one-edit typo fallback), `SearchEngine` (manifest, then catalog from an injected cache, validate, index) and `worker.ts` (the web worker around the engine, with an IndexedDB cache in `cache.ts`; nothing imports it until the UI exists). A query over 60k synthetic songs takes 3-6 ms; very broad ones (several short, common terms) take up to about 16 ms.

The UI (Phase 5) is client-side over the prerendered shell. `src/lib/app/catalog.svelte.ts` talks to the search worker (created lazily, browser only) and tags every answer with its songbook, so a slow answer for the previous songbook is never shown after a switch. `src/lib/app/preferences.svelte.ts` keeps theme, font, songbook, favorites, tonight's queue and recent searches in `localStorage` (all wrapped, per songbook). The URL carries `?book=&q=&field=&artist=&release=&sort=&letter=&year=&versions=`, validated by `src/lib/app/url.ts` (invalid values are dropped); `patchSearch` updates it in place with a real `goto`, because a shallow one leaves `page.url` behind. `SongPanel` runs a search (or a fixed code list) and renders skeleton, error, empty and results states; `ResultsTable` is TanStack Table (sorting, column filters, pagination, all client-side, so `SongPanel` asks the worker for the whole result set) plus a window virtualizer; the home page browses the whole songbook A to Z and sorts by best match only while there is a query, and `src/lib/app/browse.ts` holds the sort and filter logic. Themes (`src/lib/app/themes.ts`) and fonts (`src/lib/app/fonts.ts`) are independent `data-theme` and `data-font` attributes on `<html>`, set before first paint by the inline script in `src/app.html`, which must stay in sync with both lists. Selects use shadcn through `SelectField.svelte`. Phones are the primary target, so check UI changes at 375 px first: below `md` the hero is visually hidden, filters collapse behind a button, and `aboveKeyboard` keeps the bottom search bar over the on-screen keyboard; `SongCard` is a bits-ui dialog, a bottom sheet on mobile. `/artist/[slug]` is prerendered for every artist in the built catalogs (`entries()` reads `static/`), about 6,800 pages, which is most of the build time.

Both profiles share one row assembler (`profiles/full-list.ts`): rows are built in content-stream order, code anchors are found by font, and chrome is dropped by type size, position and (monthly only) a short list of in-table headers, advert lines and playlist headings. An artist cell merged over several rows is printed once, after the last row, and is shared back to the preceding rows that have no artist. Fragments are joined with a space, except a 1-2 character lowercase line start, which is a word broken mid-word and is joined without one and flagged `short-continuation`.

Monthly releases are not contiguous: older ones print a new block plus codes from earlier ranges, and some re-list codes from earlier releases. So `validateMonthlyRelease` only errors on duplicate codes inside one release; code runs are reported as a warning, and the lineage check uses each release's longest run. `writeRelease` must be called in ascending label order: a repeated code keeps its first release, takes the later spelling, and every listing is recorded in `song_releases`.

KS-40 (`profiles/ks-volume.ts`) is built from Volumes 2 to 35 (13 and 34 are not published) and has no base list. It removes the footer and the `Title` header, then reuses the shared row assembly. Labels are `vol-N`, so sort them with `numeric: true`. KS codes match HDD: in the audit every shared code was the same song apart from spelling, truncation and printing errors, except 17128 (`Ingatan Mo Ang Salitang Mahal Kita` in KS, `How You Gonna See Me Now` in HDD), which is unresolved. `data/corrections.json` fixes titles cut off in the PDFs, using the HDD spelling. Whether the LX15/CX15 uses this list is unconfirmed.

`2021-03` prints code 29386 for two songs (`Tagong Gugma` and `Ako Ang Namingwit`; 29369 is the missing code). `data/corrections.json` moves `Ako Ang Namingwit` to 29369. That choice is an unverified guess from the neighbouring Ilocano songs, so check it against the player if it matters.

`knip.jsonc` ignores dependencies from the planned stack that no code imports yet (and the vendored shadcn code, `src/lib/utils.ts` and `src/lib/components/ui`); delete each entry in the phase that first uses it.

## Commands

Use **bun**, not npm/pnpm/yarn (`.npmrc` sets `engine-strict=true`; do not add other lockfiles).

```bash
bun install
bun run dev            # vite dev
bun run build          # vite build
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

- **Build-time database, static site.** Source of truth is `data/pdfs/**` + `data/sources.json` + `data/corrections.json` + `data/aliases.json`. Every build recreates an ephemeral SQLite file (Drizzle + `bun:sqlite`, gitignored) and emits one content-hashed `static/catalog.<songbook>.<hash>.json` per songbook plus `static/catalog-manifest.json`. SvelteKit prerenders every route (`export const prerender = true` in `+layout.ts`) on Vercel; the browser fetches the selected songbook's catalog and searches it locally in a Web Worker. No server functions on normal use.
- **Songbooks.** Platinum publishes separate songlists per player family; each is a "songbook" (`hdd` is the default, `p-series` and `ks-40` also in scope). A song code is only meaningful within its songbook, and the UI must never show a code without its songbook. Never merge P-series into HDD unless PLAN.md open item 1 is confirmed.
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
