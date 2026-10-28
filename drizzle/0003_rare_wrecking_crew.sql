CREATE TABLE `screening_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`requested_count` integer NOT NULL,
	`processed_count` integer DEFAULT 0 NOT NULL,
	`successful_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`current_reference_id` text,
	`cost_confirmed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_reference_id`) REFERENCES `references`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_screening_jobs_review_updated` ON `screening_jobs` (`review_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_screening_jobs_owner_status` ON `screening_jobs` (`owner_id`,`status`);