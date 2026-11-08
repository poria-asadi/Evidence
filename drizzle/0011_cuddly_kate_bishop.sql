DROP INDEX `idx_extraction_records_review_reference`;--> statement-breakpoint
ALTER TABLE `extraction_records` ADD `provider` text DEFAULT 'zeous' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_extraction_records_review_reference_provider` ON `extraction_records` (`review_id`,`reference_id`,`provider`);