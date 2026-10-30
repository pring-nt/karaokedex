CREATE TABLE `song_releases` (
	`songbook` text NOT NULL,
	`code` text NOT NULL,
	`release_id` integer NOT NULL,
	PRIMARY KEY(`songbook`, `code`, `release_id`),
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE no action
);
