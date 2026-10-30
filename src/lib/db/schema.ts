import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const songbooks = sqliteTable('songbooks', {
	slug: text('slug').primaryKey(),
	name: text('name').notNull(),
	models: text('models', { mode: 'json' }).$type<string[]>().notNull(),
	kind: text('kind', { enum: ['monthly', 'volume'] }).notNull()
});

export const releases = sqliteTable('releases', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	songbook: text('songbook')
		.notNull()
		.references(() => songbooks.slug),
	label: text('label').notNull(),
	kind: text('kind', { enum: ['monthly', 'volume', 'full'] }).notNull(),
	profile: text('profile').notNull(),
	fileHash: text('file_hash').notNull().unique(),
	codeMin: text('code_min').notNull(),
	codeMax: text('code_max').notNull()
});

export const songs = sqliteTable(
	'songs',
	{
		songbook: text('songbook')
			.notNull()
			.references(() => songbooks.slug),
		code: text('code').notNull(),
		title: text('title').notNull(),
		titleNorm: text('title_norm').notNull(),
		versionNote: text('version_note'),
		creditRaw: text('credit_raw').notNull(),
		releaseId: integer('release_id')
			.notNull()
			.references(() => releases.id),
		needsReview: integer('needs_review', { mode: 'boolean' }).notNull()
	},
	(table) => [primaryKey({ columns: [table.songbook, table.code] })]
);

export const songTitles = sqliteTable(
	'song_titles',
	{
		songbook: text('songbook').notNull(),
		code: text('code').notNull(),
		title: text('title').notNull(),
		titleNorm: text('title_norm').notNull()
	},
	(table) => [primaryKey({ columns: [table.songbook, table.code, table.titleNorm] })]
);

export const artists = sqliteTable('artists', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	nameNorm: text('name_norm').notNull().unique(),
	genre: text('genre')
});

export const songArtists = sqliteTable(
	'song_artists',
	{
		songbook: text('songbook').notNull(),
		code: text('code').notNull(),
		artistId: integer('artist_id')
			.notNull()
			.references(() => artists.id),
		role: text('role', { enum: ['primary', 'featured'] }).notNull(),
		position: integer('position').notNull()
	},
	(table) => [primaryKey({ columns: [table.songbook, table.code, table.position] })]
);
