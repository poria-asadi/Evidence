CREATE TABLE `screening_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`reference_id` text NOT NULL,
	`decision` text NOT NULL,
	`notes` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reference_id`) REFERENCES `references`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_screening_decisions_review_reference` ON `screening_decisions` (`review_id`,`reference_id`);--> statement-breakpoint
CREATE INDEX `idx_screening_decisions_review_decision` ON `screening_decisions` (`review_id`,`decision`);