import { and, eq } from "drizzle-orm";
import * as db from "../server/db";
import { appRouter } from "../server/routers";
import { roomSeats, rooms } from "../drizzle/schema";
import { parseCard, sortCards } from "../shared/guandan";

const user = (id: number, name: string) => ({
  id,
  openId: `qa-${id}`,
  name,
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
});

async function main() {
  const hostId = 99002;
  const created = await db.createRoom({ title: "鉴权与进贡验收房", hostUserId: hostId, hostName: "验收房主", hostAvatarStyle: "panda" });
  for (const guest of [
    { guestId: "security-east", displayName: "东席", avatarStyle: "tiger", preferredSeat: 1 },
    { guestId: "security-north", displayName: "北席", avatarStyle: "bunny", preferredSeat: 2 },
    { guestId: "security-west", displayName: "西席", avatarStyle: "monkey", preferredSeat: 3 },
  ]) {
    await db.joinRoomSeat({ roomId: created.roomId, ...guest });
  }

  const unauthorizedCaller = appRouter.createCaller({ user: user(99003, "冒充者"), req: {} as any, res: {} as any });
  let unauthorizedBlocked = false;
  try {
    await unauthorizedCaller.room.startGame({ roomId: created.roomId });
  } catch (error) {
    unauthorizedBlocked = error instanceof Error && error.message.includes("只有房主");
  }
  if (!unauthorizedBlocked) throw new Error("非房主账号未被拦截");

  const guestCaller = appRouter.createCaller({ user: undefined, req: {} as any, res: {} as any });
  let wrongTokenBlocked = false;
  try {
    await guestCaller.room.startGame({ roomId: created.roomId, hostToken: "x".repeat(64) });
  } catch (error) {
    wrongTokenBlocked = error instanceof Error && error.message.includes("房主控制凭证");
  }
  if (!wrongTokenBlocked) throw new Error("错误房主令牌未被拦截");

  await guestCaller.room.startGame({ roomId: created.roomId, hostToken: created.hostControlToken });
  const started = await db.getRoomDetails(created.roomId);
  if (!started || started.room.status !== "playing" || started.seats.some((seat) => seat.handCount !== 27)) {
    throw new Error("合法房主令牌无法正常开局");
  }
  if ("hostControlToken" in (started.room as object)) throw new Error("房主令牌泄露在房间详情中");

  const database = await db.getDb();
  if (!database) throw new Error("数据库未连接");
  const lastHand = ["JOKER-BJ-0", "♠-3-0"];
  await database.update(roomSeats).set({ handCards: [], handCount: 0, rankFinish: 1 }).where(and(eq(roomSeats.roomId, created.roomId), eq(roomSeats.seatIndex, 0)));
  await database.update(roomSeats).set({ handCards: [], handCount: 0, rankFinish: 2 }).where(and(eq(roomSeats.roomId, created.roomId), eq(roomSeats.seatIndex, 1)));
  await database.update(roomSeats).set({ handCards: [], handCount: 0, rankFinish: 3 }).where(and(eq(roomSeats.roomId, created.roomId), eq(roomSeats.seatIndex, 2)));
  await database.update(roomSeats).set({ handCards: lastHand, handCount: lastHand.length, rankFinish: 0 }).where(and(eq(roomSeats.roomId, created.roomId), eq(roomSeats.seatIndex, 3)));
  await database.update(rooms).set({ winningOrder: [0, 1, 2], status: "playing" }).where(eq(rooms.id, created.roomId));

  const settlement = await db.settleRound(created.roomId, [0, 1, 2]);
  if (!settlement.needsTribute) throw new Error("本局未进入进贡流程");
  let detail = await db.getRoomDetails(created.roomId);
  if (!detail || detail.room.status !== "tribute") throw new Error("结算后未进入tribute状态");
  const info = detail.room.tributeInfo as { phase: string; payerSeat: number; receiverSeat: number; levelBefore: string };
  if (info.phase !== "tribute" || info.payerSeat !== 3 || info.receiverSeat !== 0) throw new Error("进贡双方状态错误");

  const payer = detail.seats.find((seat) => seat.seatIndex === 3);
  const receiver = detail.seats.find((seat) => seat.seatIndex === 0);
  if (!payer || !receiver || payer.handCount !== 27 || receiver.handCount !== 27) throw new Error("结算后下一局预发牌数量错误");
  const tributeCard = sortCards(payer.handCards as string[], info.levelBefore)[0];
  if (!tributeCard || parseCard(tributeCard, info.levelBefore).rank === undefined) throw new Error("无法选出最大进贡牌");
  await db.submitTribute(created.roomId, 3, tributeCard);
  detail = await db.getRoomDetails(created.roomId);
  if (!detail || detail.room.tributeInfo?.phase !== "return") throw new Error("进贡后未进入还牌阶段");
  const afterTributePayer = detail.seats.find((seat) => seat.seatIndex === 3);
  const afterTributeReceiver = detail.seats.find((seat) => seat.seatIndex === 0);
  if (!afterTributePayer || !afterTributeReceiver || afterTributePayer.handCount !== 26 || afterTributeReceiver.handCount !== 28) {
    throw new Error("进贡牌转移数量错误");
  }

  const returnCard = (afterTributeReceiver.handCards as string[])[(afterTributeReceiver.handCards as string[]).length - 1];
  await db.submitReturnCard(created.roomId, 0, returnCard);
  detail = await db.getRoomDetails(created.roomId);
  if (!detail || detail.room.tributeInfo?.phase !== "complete") throw new Error("还牌后未完成仪式");
  if (detail.seats.some((seat) => seat.handCount !== 27)) throw new Error("还牌完成后未恢复四家27张");

  await db.startRoomGame(created.roomId, hostId);
  detail = await db.getRoomDetails(created.roomId);
  if (!detail || detail.room.status !== "playing" || detail.seats.some((seat) => seat.handCount !== 27)) throw new Error("进贡还牌完成后无法开始下一局");
  const round = detail.rounds[0];
  if (!round || (round.winningOrder as number[]).length !== 4) throw new Error("战绩未记录完整四家排名");

  console.log(JSON.stringify({
    roomId: created.roomId,
    roomCode: created.roomCode,
    unauthorizedBlocked,
    wrongTokenBlocked,
    legalHostStarted: true,
    tributePhaseCompleted: true,
    nextRoundStarted: true,
    roundRanking: round.winningOrder,
    nextRoundHandCounts: detail.seats.map((seat) => seat.handCount),
    posterRoundReady: Boolean(round.id && round.winningOrder.length === 4),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
