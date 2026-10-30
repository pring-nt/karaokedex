import { eq } from 'drizzle-orm';
import { normalize } from '../normalize/text';
import { splitCredit, type Aliases } from '../normalize/credit';
import type { ParsedRelease } from '../parser/schema';
import { SONGBOOKS } from '../songbooks';
import type { Db } from './index';
import { artists, releases, songArtists, songbooks, songs } from './schema';

export type WriteOutcome = 'written' | 'skipped';

/**
 * Writes one parsed release in a single transaction. A release whose file hash is already stored
 * is skipped. The song code is the only identity within a songbook, so a code that already exists
 * makes the whole release fail rather than being merged by title or artist.
 */
export function writeRelease(db: Db, release: ParsedRelease, aliases: Aliases): WriteOutcome {
	return db.transaction((tx) => {
		const existing = tx
			.select({ id: releases.id })
			.from(releases)
			.where(eq(releases.fileHash, release.fileHash))
			.get();
		if (existing) return 'skipped';

		const info = SONGBOOKS[release.songbook];
		tx.insert(songbooks)
			.values({
				slug: release.songbook,
				name: info.name,
				models: [...info.models],
				kind: info.kind
			})
			.onConflictDoNothing()
			.run();

		const inserted = tx
			.insert(releases)
			.values({
				songbook: release.songbook,
				label: release.label,
				kind: release.kind,
				profile: release.profile,
				fileHash: release.fileHash,
				codeMin: release.codeMin,
				codeMax: release.codeMax
			})
			.returning({ id: releases.id })
			.get();

		const artistIds = new Map<string, number>();
		const artistId = (name: string): number => {
			const nameNorm = normalize(name);
			const cached = artistIds.get(nameNorm);
			if (cached !== undefined) return cached;
			tx.insert(artists).values({ name, nameNorm }).onConflictDoNothing().run();
			const row = tx
				.select({ id: artists.id })
				.from(artists)
				.where(eq(artists.nameNorm, nameNorm))
				.get();
			if (!row) throw new Error(`artist not found after insert: ${name}`);
			artistIds.set(nameNorm, row.id);
			return row.id;
		};

		for (const row of release.rows) {
			tx.insert(songs)
				.values({
					songbook: release.songbook,
					code: row.code,
					title: row.title,
					titleNorm: normalize(row.title),
					versionNote: row.versionNote,
					creditRaw: row.creditRaw,
					releaseId: inserted.id,
					needsReview: row.needsReview
				})
				.run();

			splitCredit(row.creditRaw, aliases).forEach((artist, position) => {
				tx.insert(songArtists)
					.values({
						songbook: release.songbook,
						code: row.code,
						artistId: artistId(artist.name),
						role: artist.role,
						position
					})
					.run();
			});
		}
		return 'written';
	});
}
