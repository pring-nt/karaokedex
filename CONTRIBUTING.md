# Contributing to KaraokeDex

Thanks for helping. You don't need to write code to contribute: reporting a wrong code is one of the most useful things you can do.

## Reporting a wrong or missing song

Open an issue with:

- the song title and artist
- the code you saw on the site, and what the machine actually did
- your machine model, such as LX15 or Major
- a photo of the songbook page, if you have one

It is also useful to know when a code **outside** your machine's list works on your machine. That helps us learn which lists really overlap.

## Fixing song data

Most fixes go in `data/corrections.json`, with a `songbook:code` key:

```json
{
	"hdd:16982": { "title": "Metalingus", "creditRaw": "Alter Bridge" }
}
```

You can set `title`, `creditRaw`, `versionNote` or `code`. If a source prints one code twice, add `ifTitle` to pick the row. A correction that matches nothing fails the build.

To see a correction on the site you need the PDFs, because `bun run catalog:update` rebuilds from them. If you don't have them, open a pull request with the correction and say so, and a maintainer can regenerate the catalogs.

## Setting up

You need [Bun](https://bun.sh). Do not use npm, pnpm or yarn, and do not add another lockfile.

```bash
bun install
```

```bash
bun run dev
```

## Before you open a pull request

Run the full check:

```bash
bun run verify
```

It runs formatting, lint, type checks, the design token check, an unused code check, the tests and a build, and it must pass with no warnings. Please don't silence a check with `eslint-disable`, `@ts-ignore` or `@ts-expect-error`. Open the pull request and ask for help instead.

Tests that read real songlist PDFs are skipped unless you have local copies in `tests/fixtures/` and `data/pdfs/`, so CI covers less of the parser than a maintainer's machine. If you change a parser, say what you tested it against.

UI changes must be tested at phone width first (375 px), because most people use this at a venue, on a phone. Include a note on what you tested.

## Project rules

- **Platinum Karaoke only.** Never add another brand's catalog.
- **Never commit songlist PDFs to `data/pdfs/`.** They are gitignored. Commit the generated `data/catalogs/` files instead.
- **The song code is the only identity within a songbook.** Never remove a song because its title or artist matches another. Codes are strings, because leading zeros matter.
- **P-Series only claims a shared code when the title matches.** Vol 78 reuses codes 18682 to 18831 for other songs, so those stay in the P-Series songbook.
- **Label songs from other lists.** A shared code proves the song is the same, not that a machine has it. The UI must never suggest otherwise.
- **Parsing, search and normalization stay framework-free** so they can be tested with `bun test`.
- **Use design tokens.** Raw colors, radii and durations belong in `src/lib/styles/tokens.css`.
- **No emojis** in code, UI copy, docs or commit messages.

`PLAN.md` holds the original build plan and design system, and `CLAUDE.md` describes how the code works today.

## Commits and branches

Use [Conventional Commits](https://www.conventionalcommits.org), such as `fix(parser): keep wrapped titles`, and descriptive branch names like `feat/...` or `fix/...`.

## License

By contributing, you agree that your contribution is licensed under the [AGPL-3.0-or-later](LICENSE), the same as the project.
