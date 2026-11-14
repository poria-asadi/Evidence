CREATE TABLE `account_wallets` (
	`user_id` text PRIMARY KEY NOT NULL,
	`balance_irt` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ai_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider_request_id` text,
	`operation` text NOT NULL,
	`model` text NOT NULL,
	`http_status` integer,
	`cost_usd_nanos` integer,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ai_usage_provider_request` ON `ai_usage_events` (`provider_request_id`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_user_recorded` ON `ai_usage_events` (`user_id`,`recorded_at`);