import * as db from "../server/db";

async function main() {
  const room = await db.createRoom({
    title: "战绩与进贡验收房",
    hostUserId: 777,
    hostName: "验收房主",
    hostAvatarStyle: "panda",
    targetScore: 14,
  });
  for (const [seatIndex, guestId] of [[1, "verify_1"], [2, "verify_2"], [3, "verify_3"]] as const) {
    await db.joinRoomSeat({ roomId: room.roomId, userId: undefined, guestId, displayName: `验收牌友${seatIndex}`, avatarStyle: "tiger", preferredSeat: seatIndex });
  }
  await db.startRoomGame(room.roomId, 777);
  const detail = await db.getRoomDetails(room.roomId);
  if (!detail || detail.seats.some((seat) => !seat.handCount || seat.handCount !== 27)) throw new Error("deal verification failed");
  const settlement = await db.settleRound(room.roomId, [0, 2, 1]);
  const afterSettle = await db.getRoomDetails(room.roomId);
  if (!afterSettle || afterSettle.room.status !== "tribute" || afterSettle.rounds.length !== 1) throw new Error("settlement verification failed");
  const info = afterSettle.room.tributeInfo as any;
  if (settlement.needsTribute && info.phase === "tribute") {
    const payer = afterSettle.seats.find((seat) => seat.seatIndex === info.payerSeat)!;
    const maxCard = (payer.handCards as string[])[0];
    await db.submitTribute(room.roomId, info.payerSeat, maxCard);
    const afterTribute = await db.getRoomDetails(room.roomId);
    if ((afterTribute?.room.tributeInfo as any)?.phase !== "return") throw new Error("tribute verification failed");
  }
  console.log("ROUND_FEATURES_OK", room.roomCode, settlement);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
