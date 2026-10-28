CREATE TABLE `full_text_files` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`reference_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`file_name` text NOT NULL,
	`r2_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reference_id`) REFERENCES `references`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_full_text_files_review_reference` ON `full_text_files` (`review_id`,`reference_id`);--> statement-breakpoint
CREATE INDEX `idx_full_text_files_review` ON `full_text_files` (`review_id`,`created_at`);