CREATE TABLE `screening_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`reference_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`status` text NOT NULL,
	`decision` text,
	`score` integer,
	`confidence` integer,
	`matched_criteria` text,
	`reason` text,
	`missing_information` text,
	`raw_response` text,
	`error_code` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`latency_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reference_id`) REFERENCES `references`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_screening_assessments_unique` ON `screening_assessments` (`review_id`,`reference_id`,`provider`,`prompt_version`);--> statement-breakpoint
CREATE INDEX `idx_screening_assessments_review_reference` ON `screening_assessments` (`review_id`,`reference_id`);