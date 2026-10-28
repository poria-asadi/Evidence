ALTER TABLE `references` ADD `full_text_lookup_status` text;--> statement-breakpoint
ALTER TABLE `references` ADD `full_text_lookup_at` integer;--> statement-breakpoint
ALTER TABLE `reviews` ADD `full_text_use_tiab_criteria` integer;--> statement-breakpoint
ALTER TABLE `reviews` ADD `full_text_inclusion` text;--> statement-breakpoint
ALTER TABLE `reviews` ADD `full_text_exclusion` text;--> statement-breakpoint
ALTER TABLE `reviews` ADD `full_text_criteria_updated_at` integer;