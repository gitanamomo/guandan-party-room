ALTER TABLE `rooms` ADD `hostControlToken` varchar(96) NULL;--> statement-breakpoint
UPDATE `rooms` SET `hostControlToken` = CONCAT('legacy-', `id`, '-', REPLACE(UUID(), '-', '')) WHERE `hostControlToken` IS NULL;--> statement-breakpoint
ALTER TABLE `rooms` MODIFY `hostControlToken` varchar(96) NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD CONSTRAINT `rooms_hostControlToken_unique` UNIQUE(`hostControlToken`);--> statement-breakpoint
