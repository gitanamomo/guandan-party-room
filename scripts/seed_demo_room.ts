import { appRouter } from "../server/routers";
import * as db from "../server/db";

async function main() {
  const caller = appRouter.createCaller({
    user: {
      id: 999,
      openId: "host-preview-open-id",
      name: "房主阿宝",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as any,
    res: {} as any,
  });

  const created = await caller.room.create({
    title: "姑苏古院掼蛋堂",
    displayName: "房主阿宝",
    avatarStyle: "panda",
    targetScore: 14,
  });

  console.log("Created room:", created);

  // 邀请3位进座
  const r1 = await caller.room.joinSeat({
    roomId: created.roomId,
    guestId: "guest_east_tiger",
    displayName: "江东小虎",
    avatarStyle: "tiger",
    preferredSeat: 1,
  });
  console.log("Joined 1:", r1);

  const r2 = await caller.room.joinSeat({
    roomId: created.roomId,
    guestId: "guest_north_bunny",
    displayName: "月下仙兔",
    avatarStyle: "bunny",
    preferredSeat: 2,
  });
  console.log("Joined 2:", r2);

  const r3 = await caller.room.joinSeat({
    roomId: created.roomId,
    guestId: "guest_west_monkey",
    displayName: "花果灵猴",
    avatarStyle: "monkey",
    preferredSeat: 3,
  });
  console.log("Joined 3:", r3);

  const details = await db.getRoomDetails(created.roomId);
  console.log("Seats in DB:", details?.seats.map(s => ({ seat: s.seatIndex, name: s.displayName, guestId: s.guestId, userId: s.userId })));

  // 开启对局并洗牌发牌
  await caller.room.startGame({
    roomId: created.roomId,
    hostUserId: 999,
  });

  console.log("SUCCESS_ROOM_CODE:" + created.roomCode);
  process.exit(0);
}

main().catch((err) => {
  console.error("DEBUG ERROR:", err);
  process.exit(1);
});
