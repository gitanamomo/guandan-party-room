CREATE TABLE `room_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`senderName` varchar(64) NOT NULL,
	`message` text NOT NULL,
	`type` enum('chat','system','play') NOT NULL DEFAULT 'chat',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `room_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `room_seats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`seatIndex` int NOT NULL,
	`team` int NOT NULL,
	`userId` int,
	`guestId` varchar(64),
	`displayName` varchar(64) NOT NULL,
	`avatarUrl` text,
	`avatarStyle` varchar(32) NOT NULL DEFAULT 'panda',
	`isHost` boolean NOT NULL DEFAULT false,
	`isReady` boolean NOT NULL DEFAULT false,
	`isAi` boolean NOT NULL DEFAULT false,
	`handCards` json NOT NULL DEFAULT ('[]'),
	`handCount` int NOT NULL DEFAULT 0,
	`rankFinish` int NOT NULL DEFAULT 0,
	`score` int NOT NULL DEFAULT 0,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `room_seats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomCode` varchar(16) NOT NULL,
	`title` varchar(120) NOT NULL,
	`hostUserId` int NOT NULL,
	`hostName` varchar(64) NOT NULL,
	`targetScore` int NOT NULL DEFAULT 14,
	`currentLevel` varchar(8) NOT NULL DEFAULT '2',
	`status` enum('waiting','playing','settled') NOT NULL DEFAULT 'waiting',
	`inviteToken` varchar(64) NOT NULL,
	`activeSeat` int NOT NULL DEFAULT 0,
	`lastPlay` json,
	`winningOrder` json NOT NULL DEFAULT ('[]'),
	`roundNumber` int NOT NULL DEFAULT 1,
	`tributeInfo` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rooms_id` PRIMARY KEY(`id`),
	CONSTRAINT `rooms_roomCode_unique` UNIQUE(`roomCode`),
	CONSTRAINT `rooms_inviteToken_unique` UNIQUE(`inviteToken`)
);
