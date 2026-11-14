CREATE TABLE `demo_ai_uses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`stage` text NOT NULL,
	`reference_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_demo_ai_uses_unique` ON `demo_ai_uses` (`user_id`,`stage`,`reference_id`);--> statement-breakpoint
CREATE INDEX `idx_demo_ai_uses_user_stage` ON `demo_ai_uses` (`user_id`,`stage`);--> statement-breakpoint
INSERT OR IGNORE INTO `demo_ai_uses` (`id`, `user_id`, `stage`, `reference_id`, `created_at`)
SELECT lower(hex(randomblob(16))), r.owner_id, 'title_abstract', a.reference_id, MIN(a.created_at)
FROM screening_assessments a JOIN reviews r ON r.id = a.review_id
GROUP BY r.owner_id, a.reference_id;--> statement-breakpoint
INSERT OR IGNORE INTO `demo_ai_uses` (`id`, `user_id`, `stage`, `reference_id`, `created_at`)
SELECT lower(hex(randomblob(16))), r.owner_id, 'full_text', a.reference_id, MIN(a.created_at)
FROM full_text_assessments a JOIN reviews r ON r.id = a.review_id
GROUP BY r.owner_id, a.reference_id;--> statement-breakpoint
INSERT OR IGNORE INTO `demo_ai_uses` (`id`, `user_id`, `stage`, `reference_id`, `created_at`)
SELECT lower(hex(randomblob(16))), r.owner_id, 'extraction', a.reference_id, MIN(a.updated_at)
FROM extraction_records a JOIN reviews r ON r.id = a.review_id
GROUP BY r.owner_id, a.reference_id;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_subscriptions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`plan` text DEFAULT 'demo' NOT NULL,
	`status` text DEFAULT 'demo' NOT NULL,
	`provider_customer_id` text,
	`provider_subscription_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_subscriptions`("user_id", "plan", "status", "provider_customer_id", "provider_subscription_id", "updated_at") SELECT "user_id", CASE WHEN "plan" = 'trial' THEN 'demo' ELSE "plan" END, CASE WHEN "status" = 'trialing' THEN 'demo' ELSE "status" END, "provider_customer_id", "provider_subscription_id", "updated_at" FROM `subscriptions`;--> statement-breakpoint
DROP TABLE `subscriptions`;--> statement-breakpoint
ALTER TABLE `__new_subscriptions` RENAME TO `subscriptions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
