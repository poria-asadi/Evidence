CREATE TABLE `fx_rate_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`rate_irt_milli` integer NOT NULL,
	`source_updated_at` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	`method` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_fx_rate_source_updated` ON `fx_rate_snapshots` (`source`,`source_updated_at`);--> statement-breakpoint
CREATE INDEX `idx_fx_rate_source_fetched` ON `fx_rate_snapshots` (`source`,`fetched_at`);