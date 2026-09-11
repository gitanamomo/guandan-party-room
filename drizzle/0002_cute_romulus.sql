CREATE TABLE `room_rounds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`roundNumber` int NOT NULL,
	`levelBefore` varchar(8) NOT NULL,
	`levelAfter` varchar(8) NOT NULL,
	`winningOrder` json NOT NULL,
	`winnerTeam` int NOT NULL,
	`redPoints` int NOT NULL DEFAULT 0,
	`bluePoints` int NOT NULL DEFAULT 0,
	`tributeSummary` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `room_rounds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `room_logs` MODIFY COLUMN `type` enum('chat','system','play','tribute','settlement') NOT NULL DEFAULT 'chat';--> statement-breakpoint
ALTER TABLE `rooms` MODIFY COLUMN `status` enum('waiting','playing','tribute','settled') NOT NULL DEFAULT 'waiting';--> statement-breakpoint
ALTER TABLE `rooms` ADD `teamScores` json DEFAULT ('{"red":0,"blue":0}') NOT NULL;