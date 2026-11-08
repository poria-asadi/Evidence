CREATE TABLE `extraction_records` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`reference_id` text NOT NULL,
	`template_updated_at` integer NOT NULL,
	`values_json` text NOT NULL,
	`evidence_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reference_id`) REFERENCES `references`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_extraction_records_review_reference` ON `extraction_records` (`review_id`,`reference_id`);--> statement-breakpoint
CREATE INDEX `idx_extraction_records_review` ON `extraction_records` (`review_id`);--> statement-breakpoint
CREATE TABLE `extraction_templates` (
	`review_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`file_name` text NOT NULL,
	`r2_key` text NOT NULL,
	`format` text NOT NULL,
	`headers_json` text NOT NULL,
	`preview_json` text NOT NULL,
	`worksheet_path` text,
	`header_row` integer NOT NULL,
	`schema_json` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
