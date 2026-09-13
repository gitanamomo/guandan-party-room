ALTER TABLE `rooms` ADD `passwordHash` varchar(128);--> statement-breakpoint
ALTER TABLE `rooms` ADD `allowSpectators` boolean DEFAULT true NOT NULL;