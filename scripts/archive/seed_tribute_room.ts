import * as db from "../server/db";
import { eq, and } from "drizzle-orm";
import { roomSeats } from "../drizzle/schema";

async function main() {
  const room = await db.createRoom({ title: "正统进贡茶室", hostUserId: 778, hostName: "进贡房主", hostAvatarStyle: "panda", targetScore: 14 });
  for (const [seatIndex, guestId] of [[1, "tribute_1"], [2, "tribute_2"], [3, "tribute_3"]] as const) {
    await db.joinRoomSeat({ roomId: room.roomId, guestId, displayName: `进贡牌友${seatIndex}`, avatarStyle: "tiger", preferredSeat: seatIndex });
  }
  await db.startRoomGame(room.roomId, 778);
  const database = await db.getDb();
  if (!database) throw new Error("Database offline");
  const lastSeat = (await database.select().from(roomSeats).where(and(eq(roomSeats.roomId, room.roomId), eq(roomSeats.seatIndex, 3))).limit(1))[0];
  await database.update(roomSeats).set({ handCards: ["♠-3-0", "♥-4-0"], handCount: 2 }).where(eq(roomSeats.id, lastSeat.id));
  await db.settleRound(room.roomId, [0, 1, 2]);
  console.log("TRIBUTE_ROOM", room.roomCode);
}

main().catch((error) => { console.error(error); process.exit(1); });
