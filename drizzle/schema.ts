import { boolean, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export interface LastPlayRecord {
  seat: number;
  playerName: string;
  cards: string[];
  cardType: string;
  rankValue: number;
  text: string;
  timestamp: number;
}

export interface TributeState {
  phase: "none" | "tribute" | "return" | "complete";
  levelBefore?: string;
  payerSeat?: number;
  receiverSeat?: number;
  tributeCard?: string;
  returnCard?: string;
  antiTribute?: boolean;
}

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const rooms = mysqlTable("rooms", {
  id: int("id").autoincrement().primaryKey(),
  roomCode: varchar("roomCode", { length: 16 }).notNull().unique(),
  title: varchar("title", { length: 120 }).notNull(),
  hostUserId: int("hostUserId").notNull(),
  hostControlToken: varchar("hostControlToken", { length: 96 }).notNull().unique(),
  hostName: varchar("hostName", { length: 64 }).notNull(),
  passwordHash: varchar("passwordHash", { length: 128 }),
  allowSpectators: boolean("allowSpectators").default(true).notNull(),
  targetScore: int("targetScore").default(14).notNull(),
  currentLevel: varchar("currentLevel", { length: 8 }).default("2").notNull(),
  status: mysqlEnum("status", ["waiting", "playing", "tribute", "settled"]).default("waiting").notNull(),
  inviteToken: varchar("inviteToken", { length: 64 }).notNull().unique(),
  activeSeat: int("activeSeat").default(0).notNull(),
  lastPlay: json("lastPlay").$type<LastPlayRecord | null | undefined>(),
  winningOrder: json("winningOrder").$type<number[]>().default([]).notNull(),
  roundNumber: int("roundNumber").default(1).notNull(),
  teamScores: json("teamScores").$type<{ red: number; blue: number }>().default({ red: 0, blue: 0 }).notNull(),
  tributeInfo: json("tributeInfo").$type<TributeState | null | undefined>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Room = typeof rooms.$inferSelect;
export type InsertRoom = typeof rooms.$inferInsert;

export const roomSeats = mysqlTable("room_seats", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  seatIndex: int("seatIndex").notNull(),
  team: int("team").notNull(),
  userId: int("userId"),
  guestId: varchar("guestId", { length: 64 }),
  displayName: varchar("displayName", { length: 64 }).notNull(),
  avatarUrl: text("avatarUrl"),
  avatarStyle: varchar("avatarStyle", { length: 32 }).default("panda").notNull(),
  isHost: boolean("isHost").default(false).notNull(),
  isReady: boolean("isReady").default(false).notNull(),
  isAi: boolean("isAi").default(false).notNull(),
  handCards: json("handCards").$type<string[]>().default([]).notNull(),
  handCount: int("handCount").default(0).notNull(),
  rankFinish: int("rankFinish").default(0).notNull(),
  score: int("score").default(0).notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RoomSeat = typeof roomSeats.$inferSelect;
export type InsertRoomSeat = typeof roomSeats.$inferInsert;

export const roomRounds = mysqlTable("room_rounds", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  roundNumber: int("roundNumber").notNull(),
  levelBefore: varchar("levelBefore", { length: 8 }).notNull(),
  levelAfter: varchar("levelAfter", { length: 8 }).notNull(),
  winningOrder: json("winningOrder").$type<number[]>().notNull(),
  winnerTeam: int("winnerTeam").notNull(),
  redPoints: int("redPoints").default(0).notNull(),
  bluePoints: int("bluePoints").default(0).notNull(),
  tributeSummary: json("tributeSummary").$type<TributeState | null>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RoomRound = typeof roomRounds.$inferSelect;
export type InsertRoomRound = typeof roomRounds.$inferInsert;

export const roomLogs = mysqlTable("room_logs", {
  id: int("id").autoincrement().primaryKey(),
  roomId: int("roomId").notNull(),
  senderName: varchar("senderName", { length: 64 }).notNull(),
  message: text("message").notNull(),
  type: mysqlEnum("type", ["chat", "system", "play", "tribute", "settlement"]).default("chat").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RoomLog = typeof roomLogs.$inferSelect;
export type InsertRoomLog = typeof roomLogs.$inferInsert;
