# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read PLAN.md first

[PLAN.md](PLAN.md) is the source of truth for this repo: a phased build plan (Phase 0-7), standing directives, the data model, parser rules, and the design system (Appendix A, authoritative for all visual decisions). When PLAN.md conflicts with a default or habit, PLAN.md wins. Work one phase at a time and do not start a phase until the previous phase's gate passes and the user approves the review.

KaraokeDex is a searchable web songbook for **Platinum Karaoke only**. Song codes, titles and artists are parsed from Platinum's official songlist PDFs. Never ingest another brand's catalog.

## Current state

Phase 0 (scaffold and tooling) is done on `feat/phase-0-scaffold`: tokens, base CSS, a placeholder page, and the `verify` gate. `scripts/` holds only `check-tokens.ts` and `tests/` only its test. The scripts from PLAN.md section 0.3 that belong to later phases (`import`, `catalog:build`, `sources:check`, `sources:status`) do not exist yet, and `build` is plain `vite build` until the catalog build lands in Phase 4. `playwright test` has no tests until Phase 6.

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
