CREATE TABLE `duplicate_pairs` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`left_reference_id` text NOT NULL,
	`right_reference_id` text NOT NULL,
	`match_type` text NOT NULL,
	`confidence` integer NOT NULL,
	`status` text DEFAULT 'suggested' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`left_reference_id`) REFERENCES `references`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`right_reference_id`) REFERENCES `references`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_duplicate_pairs_review` ON `duplicate_pairs` (`review_id`,`status`);--> statement-breakpoint
CREATE TABLE `references` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`upload_id` text NOT NULL,
	`title` text,
	`abstract` text,
	`authors` text,
	`year` text,
	`journal` text,
	`doi` text,
	`pmid` text,
	`raw_source` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`upload_id`) REFERENCES `uploads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_references_review` ON `references` (`review_id`);--> statement-breakpoint
CREATE INDEX `idx_references_review_doi` ON `references` (`review_id`,`doi`);--> statement-breakpoint
CREATE INDEX `idx_references_review_pmid` ON `references` (`review_id`,`pmid`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text,
	`purpose` text NOT NULL,
	`inclusion` text NOT NULL,
	`exclusion` text NOT NULL,
	`population` text,
	`intervention` text,
	`comparison` text,
	`outcomes` text,
	`stage` text DEFAULT 'protocol' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_reviews_owner_updated` ON `reviews` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`plan` text DEFAULT 'trial' NOT NULL,
	`status` text DEFAULT 'trialing' NOT NULL,
	`trial_ends_at` integer NOT NULL,
	`provider_customer_id` text,
	`provider_subscription_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`file_name` text NOT NULL,
	`r2_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`record_count` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_uploads_review` ON `uploads` (`review_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);