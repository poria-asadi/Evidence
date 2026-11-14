CREATE TABLE `pending_registrations` (
	`email` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`field_of_study` text NOT NULL,
	`education_level` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_iterations` integer NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`sent_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `first_name` text;--> statement-breakpoint
ALTER TABLE `users` ADD `last_name` text;--> statement-breakpoint
ALTER TABLE `users` ADD `field_of_study` text;--> statement-breakpoint
ALTER TABLE `users` ADD `education_level` text;--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` integer;