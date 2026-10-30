# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read PLAN.md first

[PLAN.md](PLAN.md) is the source of truth for this repo: a phased build plan (Phase 0-7), standing directives, the data model, parser rules, and the design system (Appendix A, authoritative for all visual decisions). When PLAN.md conflicts with a default or habit, PLAN.md wins. Work one phase at a time and do not start a phase until the previous phase's gate passes and the user approves the review.

KaraokeDex is a searchable web songbook for **Platinum Karaoke only**. Song codes, titles and artists are parsed from Platinum's official songlist PDFs. Never ingest another brand's catalog.

## Current state

Phases 0 to 2 and the watcher half of Phase 3 are implemented: tokens and the `verify` gate; the HDD monthly "New Songs" parser; the P-series full-list parser; normalization, validation, corrections, the SQLite writer, `bun run import <pdf>` (picks the profile from the songbook folder: `data/pdfs/hdd/` or `data/pdfs/p-series/`), and the source watcher (`bun run sources:check [--write]`, exit 10 on changes; `bun run sources:status [--songbook hdd] [--write]`; manifest in `data/sources.json`). The HDD backfill is blocked on older layouts (see below). `catalog:build` does not exist yet, and `build` is plain `vite build` until the catalog build lands in Phase 4. `playwright test` has no tests until Phase 6.

`data/pdfs/` is untracked: it holds all 143 HDD monthlies (105 MB) and the 21 MB P-series full list, pending the Git LFS decision in PLAN.md section 3. Only 5 monthly PDFs (`tests/fixtures/hdd/2026-06` to `2026-10`, not the months PLAN.md lists) and a 5-page P-series sample are committed. The monthly parser handles only the recent single-page layout (48 of the 143 files). The other 95 are older layouts: multi-page, a `Jun 2015 HDD` header instead of `Month YYYY`, ad blurbs inside the table, and releases that mix several code ranges, so the per-release contiguity rule does not hold for them (decision pending with the user).

In the monthly fixtures wrapped lines break between words with no trailing space, so fragments are joined with a space (`join.ts` also inserts a space for gaps wider than 0.15 em). A 1-2 character lowercase continuation is flagged `short-continuation` instead of being joined silently. The P-series alphabetical check is advisory: the list's sort order ignores some punctuation, so about 90 warnings are ordering conventions, not mis-joins.

`knip.jsonc` ignores dependencies from the planned stack that no code imports yet (and `src/lib/utils.ts`, the shadcn `cn` helper); delete each entry in the phase that first uses it.

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
- **Songbooks.** Platinum publishes separate songlists per player family; each is a "songbook" (`hdd` is the default, `p-series` also in scope). A song code is only meaningful within its songbook, and the UI must never show a code without its songbook. Never merge P-series into HDD unless PLAN.md open item 1 is confirmed.
- **Parser pipeline** (`src/lib/parser`): `extract.ts` pulls text items with geometry and font via `unpdf` (text layer, not the image). Profiles (`monthly-new-songs`, `full-list`) anchor on the bold code font, classify items by x-position, and assemble rows in **content-stream order, not by geometry**. Profile is chosen explicitly from songbook + filename, and each profile asserts its page signature.
- **Identity.** The song code is the only identity within a songbook: never dedupe on title or artist. Codes are **strings** (leading zeros like `0088` must survive end to end).
- **Source watcher** (`src/lib/sources`, `scripts/sources-check.ts`): discovers the `songlist-update-data.js` Shopify asset from the songlist page HTML (never hardcode the theme path), parses `const songList` with `acorn` by walking literal nodes only (never `eval`), and diffs against `data/sources.json`. It never downloads PDFs; the user does. `data/sources.seed.json` is a 2026-10-30 snapshot of the site.
- **Framework-free modules.** Parsing, normalization, search ranking and watcher diffing live in plain TS (no Svelte imports) so they can be unit tested with `bun test`; `src/lib/search` must be worker-safe.

## Code conventions specific to this repo

- Import from `src/lib` through the `#lib/*` alias (defined in `package.json` `imports`, also used by `components.json`), not relative paths or `$lib`.
- SvelteKit config is inline in `vite.config.ts` (there is no `svelte.config.js`); runes mode is forced for everything outside `node_modules`.
- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`); no legacy `export let` or stores for component state.
- TypeScript strict, no `any`, no `!` outside tests. Zod validates every boundary (parsed rows, catalog JSON on write and load, URL params, corrections/aliases/sources JSON, remote `songList`).
- Tokens, never raw values: no hex/rgb literals, raw px radii or raw ms durations in `src/lib/components/**` or `src/routes/**`. Raw values live only in `src/lib/styles/tokens.css` (three layers: primitives, semantic roles, optional component aliases; Tailwind `@theme` maps to the semantic tokens). `src/lib/styles/base.css` holds the base and typography classes (also unscanned); `src/routes/layout.css` only imports them.
- Prettier uses tabs, single quotes, no trailing commas, width 100, and the Svelte and Tailwind plugins (Tailwind stylesheet is `src/routes/layout.css`).
- UI primitives come from shadcn-svelte (style `lyra`, Phosphor icons) under `#lib/components/ui`.

## Workflow rules from PLAN.md

- Never commit, branch, push or open PRs without explicit user approval. At the end of a phase, stage nothing; present changed files, proposed branch (`feat/<phase-slug>`) and Conventional Commit messages, using the phase review template in PLAN.md section 0.4.
- Check what is on PATH before assuming a tool; ask before installing anything globally.
- Stop and ask when the spec is ambiguous or a sample PDF contradicts an assumption.
