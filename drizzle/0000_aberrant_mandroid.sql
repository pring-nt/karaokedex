CREATE TABLE `artists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_norm` text NOT NULL,
	`genre` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artists_name_norm_unique` ON `artists` (`name_norm`);--> statement-breakpoint
CREATE TABLE `releases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`songbook` text NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`profile` text NOT NULL,
	`file_hash` text NOT NULL,
	`code_min` text NOT NULL,
	`code_max` text NOT NULL,
	FOREIGN KEY (`songbook`) REFERENCES `songbooks`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `releases_file_hash_unique` ON `releases` (`file_hash`);--> statement-breakpoint
CREATE TABLE `song_artists` (
	`songbook` text NOT NULL,
	`code` text NOT NULL,
	`artist_id` integer NOT NULL,
	`role` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`songbook`, `code`, `position`),
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `song_titles` (
	`songbook` text NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`title_norm` text NOT NULL,
	PRIMARY KEY(`songbook`, `code`, `title_norm`)
);
--> statement-breakpoint
CREATE TABLE `songbooks` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`models` text NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`songbook` text NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`title_norm` text NOT NULL,
	`version_note` text,
	`credit_raw` text NOT NULL,
	`release_id` integer NOT NULL,
	`needs_review` integer NOT NULL,
	PRIMARY KEY(`songbook`, `code`),
	FOREIGN KEY (`songbook`) REFERENCES `songbooks`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE no action
);
