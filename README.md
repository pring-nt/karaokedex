# KaraokeDex

A fast, phone-first songbook for Platinum Karaoke. Find a song code on any Platinum machine, even when the book at the venue is out of date.

Printed songbooks fall behind, and Platinum's updates are scattered across hundreds of PDFs. KaraokeDex reads those PDFs and turns them into one searchable site.

## Features

- **Search by code, title or artist**, or browse a whole songbook A to Z.
- **Pick your machine.** KS Series (including the LX15 and CX15), HDD, T-X, Reyna, Flute/Piano, BMB, Hermosa, Home 40, Bravo and P-Series each have their own list.
- **Songs listed for other machines.** Platinum's lists share one numbering, so a song missing from your list can still be found through another one. These songs are clearly labelled, because a shared code does not prove your machine has the song.
- **Tonight's queue and favorites**, kept in your browser.
- **Works on a phone**, with the search bar within reach of your thumb.
- **Themes and fonts** you can choose separately.

## How it works

There is no server or database behind the site. Song data is built ahead of time and shipped as static files.

```text
Platinum's PDFs -> parser -> temporary SQLite database -> data/catalogs/*.json -> static site
```

1. `bun run catalog:update` parses the PDFs in `data/pdfs/`, applies `data/corrections.json`, and writes one catalog per songbook to `data/catalogs/`, plus a shared catalog that records which lists print each code.
2. The catalogs are committed. The PDFs are not, so a deploy never needs them.
3. `bun run build` copies the catalogs to `static/` and prerenders the site.
4. In the browser, a web worker downloads the chosen catalog, caches it, and runs every search on the device.

## Getting started

You need [Bun](https://bun.sh). This project does not use npm, pnpm or yarn.

```bash
bun install
```

```bash
bun run dev
```

The committed catalogs are enough to run the whole site. You only need the PDFs to change song data.

## Commands

| Command                  | What it does                                  |
| ------------------------ | --------------------------------------------- |
| `bun run dev`            | Start the dev server                          |
| `bun run build`          | Build the static site from committed catalogs |
| `bun run verify`         | Run every check (see CONTRIBUTING.md)         |
| `bun run test`           | Run the unit tests                            |
| `bun run sources:check`  | Look for new songlists on Platinum's site     |
| `bun run sources:status` | Compare the source list with your local PDFs  |
| `bun run catalog:update` | Reparse local PDFs into `data/catalogs/`      |
| `bun run import <pdf>`   | Parse one PDF and preview it                  |

## Adding a new songlist

1. Run `bun run sources:check --write` to record new lists in `data/sources.json`.
2. Download each new PDF to the path it lists, such as `data/pdfs/hdd/2026-12.pdf`.
3. Run `bun run sources:status --write`.
4. Run `bun run catalog:update`. This rebuilds from every PDF, so you need the full `data/pdfs/` folder.
5. Commit `data/`.

## Known limits

- **Base catalogs are missing.** Platinum publishes update lists, and only P-Series has a published full list, so older songs on a machine may not appear here.
- **P-Series Vol 78 is kept apart.** It reuses codes 18682 to 18831 for different songs, so those songs only appear under P-Series.
- **Codes can be wrong.** Platinum's PDFs contain typos and swapped columns. Known problems are fixed in `data/corrections.json`, and a few conflicts between lists are unresolved. The machine always has the final say.

## Contributing

Corrections are especially welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

The code is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). If you run a modified version as a public service, you must offer your source code to its users.

The license covers this project's code. It gives no rights over Platinum's songlists, song titles, or trademarks.

## Disclaimer

KaraokeDex is an unofficial fan project. It is not affiliated with, endorsed by or sponsored by Platinum Karaoke. Song codes come from the songlists Platinum publishes on its own website.
