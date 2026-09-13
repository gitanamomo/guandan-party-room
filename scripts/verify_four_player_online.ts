import { and, eq } from "drizzle-orm";
import { appRouter } from "../server/routers";
import * as db from "../server/db";
import { roomSeats } from "../drizzle/schema";

const user = (id: number, name: string) => ({
  id,
  openId: `online-qa-${id}`,
  name,
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
});

async function main() {
  const host = user(99101, "在线房主");
  const hostCaller = appRouter.createCaller({ user: host, req: {} as any, res: {} as any });
  const guestCaller = appRouter.createCaller({ user: undefined, req: {} as any, res: {} as any });
  const created = await hostCaller.room.create({ displayName: host.name, avatarStyle: "panda", title: "四人在线回归验收房" });
  if (created.hostGuestId !== "host_99101") throw new Error("创建房间未返回正确房主席位身份");

  // 模拟旧版浏览器使用随机guestId再次进入，必须仍定位到房主0号位，不能占用1号位。
  await guestCaller.room.joinSeat({ roomId: created.roomId, guestId: "old-random-host-guest", displayName: host.name, avatarStyle: "panda", hostToken: created.hostControlToken });
  let detail = await db.getRoomDetails(created.roomId);
  if (!detail) throw new Error("房间详情为空");
  const occupiedAfterHost = detail.seats.filter((seat) => seat.guestId).length;
  const hostSeats = detail.seats.filter((seat) => seat.isHost);
  if (occupiedAfterHost !== 1 || hostSeats.length !== 1 || hostSeats[0]?.seatIndex !== 0) {
    throw new Error(`房主重复入座：occupied=${occupiedAfterHost}, hostSeats=${hostSeats.length}`);
  }

  for (const guest of [
    { guestId: "online-east", displayName: "东席牌友", avatarStyle: "tiger", preferredSeat: 1 },
    { guestId: "online-north", displayName: "北席牌友", avatarStyle: "bunny", preferredSeat: 2 },
    { guestId: "online-west", displayName: "西席牌友", avatarStyle: "monkey", preferredSeat: 3 },
  ]) {
    await guestCaller.room.joinSeat({ roomId: created.roomId, ...guest });
  }

  detail = await db.getRoomDetails(created.roomId);
  if (!detail || detail.seats.filter((seat) => seat.guestId).length !== 4) throw new Error("四人未正确入座");
  await hostCaller.room.startGame({ roomId: created.roomId });
  detail = await db.getRoomDetails(created.roomId);
  if (!detail || detail.room.status !== "playing" || detail.seats.some((seat) => seat.handCount !== 27)) {
    throw new Error("四人到齐后房主无法正常开局或发牌数量错误");
  }

  console.log(JSON.stringify({
    roomCode: created.roomCode,
    hostGuestId: created.hostGuestId,
    occupiedSeats: detail.seats.filter((seat) => seat.guestId).map((seat) => ({ seatIndex: seat.seatIndex, guestId: seat.guestId, isHost: seat.isHost })),
    status: detail.room.status,
    handCounts: detail.seats.map((seat) => seat.handCount),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
