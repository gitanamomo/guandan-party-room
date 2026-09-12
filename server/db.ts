import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { randomBytes } from "node:crypto";
import { InsertRoom, InsertRoomLog, InsertRoomSeat, InsertUser, Room, roomLogs, roomRounds, RoomSeat, roomSeats, rooms, users, TributeState } from "../drizzle/schema";
import { ENV } from './_core/env';
import { createGuandanDeck, getRankBaseValue, parseCard, shuffleAndDeal, sortCards } from "../shared/guandan";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required");
  const db = await getDb();
  if (!db) return;
  await db.insert(users).values(user).onDuplicateKeyUpdate({
    set: {
      name: user.name,
      email: user.email,
      lastSignedIn: new Date(),
    },
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// 默认卡通形象列表
export const DEFAULT_AVATARS = [
  { style: "panda", name: "熊猫少爷", url: "/manus-storage/char_panda_retro_a9c2931f.png" },
  { style: "tiger", name: "锦衣小虎", url: "/manus-storage/char_tiger_retro_4237d9f5.png" },
  { style: "bunny", name: "碧玉小兔", url: "/manus-storage/char_bunny_retro_31115b9b.png" },
  { style: "monkey", name: "灵桃猴博士", url: "/manus-storage/char_monkey_retro_3ae39b13.png" },
];

// 创建房间
export async function createRoom(params: {
  title: string;
  hostUserId: number;
  hostName: string;
  hostAvatarStyle?: string;
  targetScore?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database offline");

  const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
  const inviteToken = "gd_" + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
  const hostControlToken = randomBytes(32).toString("hex");

  const [insertResult] = await db.insert(rooms).values({
    roomCode,
    title: params.title || `${params.hostName}的掼蛋雅间`,
    hostUserId: params.hostUserId,
    hostControlToken,
    hostName: params.hostName,
    targetScore: params.targetScore || 14,
    currentLevel: "2",
    status: "waiting",
    inviteToken,
    winningOrder: [],
    teamScores: { red: 0, blue: 0 },
  });

  const roomId = insertResult.insertId;

  const avatarStyle = params.hostAvatarStyle || "panda";
  const avatarMatch = DEFAULT_AVATARS.find((a) => a.style === avatarStyle) || DEFAULT_AVATARS[0];

  const seatsToInsert: InsertRoomSeat[] = [
    {
      roomId,
      seatIndex: 0,
      team: 0,
      userId: params.hostUserId,
      guestId: `host_${params.hostUserId}`,
      displayName: params.hostName,
      avatarUrl: avatarMatch.url,
      avatarStyle: avatarMatch.style,
      isHost: true,
      isReady: true,
      isAi: false,
      handCards: [],
      handCount: 0,
      rankFinish: 0,
      score: 0,
    },
    {
      roomId,
      seatIndex: 1,
      team: 1,
      userId: null,
      guestId: null,
      displayName: "东席(虚位以待)",
      avatarUrl: DEFAULT_AVATARS[1].url,
      avatarStyle: "tiger",
      isHost: false,
      isReady: false,
      isAi: false,
      handCards: [],
      handCount: 0,
      rankFinish: 0,
      score: 0,
    },
    {
      roomId,
      seatIndex: 2,
      team: 0,
      userId: null,
      guestId: null,
      displayName: "北席(虚位以待)",
      avatarUrl: DEFAULT_AVATARS[2].url,
      avatarStyle: "bunny",
      isHost: false,
      isReady: false,
      isAi: false,
      handCards: [],
      handCount: 0,
      rankFinish: 0,
      score: 0,
    },
    {
      roomId,
      seatIndex: 3,
      team: 1,
      userId: null,
      guestId: null,
      displayName: "西席(虚位以待)",
      avatarUrl: DEFAULT_AVATARS[3].url,
      avatarStyle: "monkey",
      isHost: false,
      isReady: false,
      isAi: false,
      handCards: [],
      handCount: 0,
      rankFinish: 0,
      score: 0,
    },
  ];

  for (const s of seatsToInsert) {
    await db.insert(roomSeats).values(s);
  }

  await db.insert(roomLogs).values({
    roomId,
    senderName: "茶馆管家",
    message: `房主【${params.hostName}】已开辟雅间。房间号：${roomCode}，请发链接邀请3位牌友凑齐开局！`,
    type: "system",
  });

  return { roomId, roomCode, inviteToken, hostControlToken };
}

// 获取房间全量状态
export async function getRoomDetails(roomId: number) {
  const db = await getDb();
  if (!db) return null;

  const roomRows = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!roomRows[0]) return null;

  const seatRows = await db.select().from(roomSeats).where(eq(roomSeats.roomId, roomId)).orderBy(roomSeats.seatIndex);
  const logRows = await db.select().from(roomLogs).where(eq(roomLogs.roomId, roomId)).orderBy(desc(roomLogs.createdAt)).limit(30);
  const roundRows = await db.select().from(roomRounds).where(eq(roomRounds.roomId, roomId)).orderBy(desc(roomRounds.roundNumber));
  const { hostControlToken: _hostControlToken, ...safeRoom } = roomRows[0];

  return {
    room: safeRoom,
    seats: seatRows,
    logs: logRows.reverse(),
    rounds: roundRows,
  };
}

// 通过房间号或邀请码获取房间
export async function findRoomByCodeOrToken(key: string) {
  const db = await getDb();
  if (!db) return null;

  const byCode = await db.select().from(rooms).where(eq(rooms.roomCode, key)).limit(1);
  if (byCode[0]) return byCode[0];

  const byToken = await db.select().from(rooms).where(eq(rooms.inviteToken, key)).limit(1);
  return byToken[0] || null;
}

// 加入房间席位
export async function joinRoomSeat(params: {
  roomId: number;
  userId?: number;
  guestId: string;
  displayName: string;
  avatarStyle: string;
  preferredSeat?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database offline");

  const seats = await db.select().from(roomSeats).where(eq(roomSeats.roomId, params.roomId)).orderBy(roomSeats.seatIndex);
  
  // 检查是否已经在席位上（通过唯一的guestId定位）
  const existing = seats.find((s) => s.guestId === params.guestId);

  const avatar = DEFAULT_AVATARS.find((a) => a.style === params.avatarStyle) || DEFAULT_AVATARS[1];

  if (existing) {
    // 仅仅更新自定义昵称和头像形象
    await db.update(roomSeats).set({
      displayName: params.displayName,
      avatarStyle: avatar.style,
      avatarUrl: avatar.url,
      lastSeenAt: new Date(),
    }).where(eq(roomSeats.id, existing.id));

    return { seatIndex: existing.seatIndex };
  }

  // 寻找空席位（优先选指定，或第一个未占用的1, 2, 3）
  let targetSeat = typeof params.preferredSeat === "number" && params.preferredSeat >= 0 && params.preferredSeat <= 3 ? params.preferredSeat : -1;
  if (targetSeat !== -1) {
    const seatObj = seats.find((s) => s.seatIndex === targetSeat);
    if (seatObj && seatObj.guestId) {
      targetSeat = -1; // 已被占用，重新找
    }
  }

  if (targetSeat === -1) {
    const empty = seats.find((s) => !s.guestId && !s.isHost);
    if (!empty) {
      throw new Error("客官抱歉，该房间4位已满座！");
    }
    targetSeat = empty.seatIndex;
  }

  const targetSeatRow = seats.find((s) => s.seatIndex === targetSeat);
  if (!targetSeatRow) throw new Error("席位无效");

  await db.update(roomSeats).set({
    userId: params.userId || null,
    guestId: params.guestId,
    displayName: params.displayName,
    avatarStyle: avatar.style,
    avatarUrl: avatar.url,
    isReady: true,
    isAi: false,
    lastSeenAt: new Date(),
  }).where(eq(roomSeats.id, targetSeatRow.id));

  await db.insert(roomLogs).values({
    roomId: params.roomId,
    senderName: "茶馆掌柜",
    message: `【${params.displayName}】入座了【${getSeatName(targetSeat)}】席位！`,
    type: "system",
  });

  return { seatIndex: targetSeat };
}

// 填充AI凑桌
export async function fillSeatWithAi(roomId: number, seatIndex: number) {
  const db = await getDb();
  if (!db) return;

  const defaultNames = ["茶楼琴童", "品茗居士", "江南钓叟", "对局棋仙"];
  const aiName = defaultNames[seatIndex] || `雅士${seatIndex}`;
  const avatar = DEFAULT_AVATARS[seatIndex % DEFAULT_AVATARS.length];

  const seats = await db.select().from(roomSeats).where(and(eq(roomSeats.roomId, roomId), eq(roomSeats.seatIndex, seatIndex))).limit(1);
  if (seats[0] && !seats[0].guestId) {
    await db.update(roomSeats).set({
      userId: null,
      guestId: `ai_${seatIndex}`,
      displayName: `[电脑] ${aiName}`,
      avatarStyle: avatar.style,
      avatarUrl: avatar.url,
      isAi: true,
      isReady: true,
      lastSeenAt: new Date(),
    }).where(eq(roomSeats.id, seats[0].id));

    await db.insert(roomLogs).values({
      roomId,
      senderName: "系统",
      message: `已安排可爱智能牌友【${aiName}】入座${getSeatName(seatIndex)}陪练凑桌！`,
      type: "system",
    });
  }
}

// 房主开局发牌
export async function startRoomGame(roomId: number, hostUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database offline");

  const room = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!room[0]) throw new Error("房间不存在");
  if (room[0].hostUserId !== hostUserId) throw new Error("只有房主主账户可以开启对局");
  if (room[0].status === "tribute" && room[0].tributeInfo && (room[0].tributeInfo as TributeState).phase !== "complete") {
    throw new Error("请先完成进贡与还牌，才能开始下一局");
  }
  if (room[0].status === "settled") throw new Error("本局已达到目标级数，牌局已结算");

  // 检查4个席位是否都有人或AI
  const seats = await db.select().from(roomSeats).where(eq(roomSeats.roomId, roomId)).orderBy(roomSeats.seatIndex);
  for (const s of seats) {
    if (!s.guestId) {
      throw new Error(`【${getSeatName(s.seatIndex)}】席位尚无玩家，需四人凑齐或邀请好友/呼叫AI才可开房！`);
    }
  }

  // 首局或旧数据没有预发牌时才洗牌；正常多局流程在结算时已准备好下一局手牌，
  // 这样进贡与还牌发生在下一局的真实27张手牌上。
  const hasPreparedHands = room[0].status === "tribute" && seats.every((seat) => seat.handCount === 27);
  if (!hasPreparedHands) {
    await dealNextRoundHands(db, seats, room[0].currentLevel);
  }

  await db.update(rooms).set({
    status: "playing",
    activeSeat: 0,
    lastPlay: null,
    winningOrder: [],
    tributeInfo: { phase: "none" },
    roundNumber: room[0].status === "tribute" ? room[0].roundNumber + 1 : room[0].roundNumber,
  }).where(eq(rooms.id, roomId));

  await db.insert(roomLogs).values({
    roomId,
    senderName: "茶馆裁判",
    message: `掼蛋四人对局正式开启！打【${room[0].currentLevel}】，请南位房主首发出牌。`,
    type: "system",
  });
}

function highestCard(cards: string[], levelRank: string) {
  // 与前端理牌保持同一规则：红心级牌（逢人配）优先于普通级牌，
  // 再按级牌、大小王和普通点数排序，避免界面显示的最大牌被服务端拒绝。
  return sortCards(cards, levelRank)[0];
}

async function dealNextRoundHands(database: NonNullable<Awaited<ReturnType<typeof getDb>>>, seats: RoomSeat[], levelRank: string) {
  const hands = shuffleAndDeal(createGuandanDeck());
  for (let i = 0; i < seats.length; i++) {
    const sorted = sortCards(hands[i] || [], levelRank);
    await database.update(roomSeats).set({
      handCards: sorted,
      handCount: sorted.length,
      rankFinish: 0,
      isReady: true,
    }).where(eq(roomSeats.id, seats[i].id));
  }
}

/** 本局三人出完后生成战绩，并把房间切换到进贡/还牌阶段。 */
export async function settleRound(roomId: number, winningOrder: number[]) {
  const database = await getDb();
  if (!database) throw new Error("Database offline");
  const roomRows = await database.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  const room = roomRows[0];
  if (!room) throw new Error("房间不存在");

  const seats = await database.select().from(roomSeats).where(eq(roomSeats.roomId, roomId)).orderBy(roomSeats.seatIndex);
  const winnerSeat = seats.find((seat) => seat.seatIndex === winningOrder[0]);
  const secondSeat = seats.find((seat) => seat.seatIndex === winningOrder[1]);
  const thirdSeat = seats.find((seat) => seat.seatIndex === winningOrder[2]);
  const lastSeat = seats.find((seat) => !winningOrder.includes(seat.seatIndex));
  if (!winnerSeat || !secondSeat || !thirdSeat || !lastSeat) throw new Error("无法计算本局胜负");

  const winnerTeam = winnerSeat.team;
  const sameTeamDoubleUp = secondSeat.team === winnerTeam;
  const headThirdSameTeam = thirdSeat.team === winnerTeam;
  const points = sameTeamDoubleUp ? 3 : headThirdSameTeam ? 2 : 1;
  const redPoints = winnerTeam === 0 ? points : 0;
  const bluePoints = winnerTeam === 1 ? points : 0;
  const oldScores = (room.teamScores as { red: number; blue: number }) || { red: 0, blue: 0 };
  const nextScores = { red: oldScores.red + redPoints, blue: oldScores.blue + bluePoints };
  const oldLevel = Number(room.currentLevel) || 2;
  const winnerScore = winnerTeam === 0 ? nextScores.red : nextScores.blue;
  const nextLevel = String(Math.min(14, oldLevel + points));
  const canAdvance = winnerScore < room.targetScore;
  const lastHand = (lastSeat.handCards as string[]) || [];
  const hasBigJoker = lastHand.some((card) => parseCard(card, room.currentLevel).rank === "BJ");
  const hasSmallJoker = lastHand.some((card) => parseCard(card, room.currentLevel).rank === "SJ");
  const antiTribute = hasBigJoker && hasSmallJoker;
  const needsTribute = !sameTeamDoubleUp && !antiTribute;
  const tributeInfo: TributeState = needsTribute
    ? { phase: "tribute", levelBefore: room.currentLevel, payerSeat: lastSeat.seatIndex, receiverSeat: winnerSeat.seatIndex, antiTribute: false }
    : { phase: "complete", levelBefore: room.currentLevel, antiTribute };
  const fullWinningOrder = [...winningOrder, lastSeat.seatIndex];

  await database.insert(roomRounds).values({
    roomId,
    roundNumber: room.roundNumber,
    levelBefore: room.currentLevel,
    levelAfter: nextLevel,
    winningOrder: fullWinningOrder,
    winnerTeam,
    redPoints,
    bluePoints,
    tributeSummary: tributeInfo,
  });

  await database.update(rooms).set({
    status: canAdvance ? "tribute" : "settled",
    currentLevel: nextLevel,
    teamScores: nextScores,
    tributeInfo,
  }).where(eq(rooms.id, roomId));

  if (canAdvance) {
    await dealNextRoundHands(database, seats, nextLevel);
  }

  await database.insert(roomLogs).values({
    roomId,
    senderName: "茶馆裁判",
    message: `第${room.roundNumber}局结束：${winnerTeam === 0 ? "红队南北" : "蓝队东西"}得${points}级，${needsTribute ? `【${lastSeat.displayName}】向【${winnerSeat.displayName}】进贡` : antiTribute ? "末游持双王，抗贡成功" : "同队双上，本局免进贡"}。`,
    type: "settlement",
  });
  return { nextScores, nextLevel, needsTribute, antiTribute, canAdvance };
}

/** 末游进贡最大牌；服务端校验牌确实在手牌中且为当前最大牌。 */
export async function submitTribute(roomId: number, seatIndex: number, card: string) {
  const database = await getDb();
  if (!database) throw new Error("Database offline");
  const room = (await database.select().from(rooms).where(eq(rooms.id, roomId)).limit(1))[0];
  const info = room?.tributeInfo as TributeState | null;
  if (!room || room.status !== "tribute" || !info || info.phase !== "tribute" || info.payerSeat !== seatIndex) throw new Error("还没轮到您进贡");
  const seat = (await database.select().from(roomSeats).where(and(eq(roomSeats.roomId, roomId), eq(roomSeats.seatIndex, seatIndex))).limit(1))[0];
  if (!seat) throw new Error("席位不存在");
  const receiver = info.receiverSeat === undefined ? undefined : (await database.select().from(roomSeats).where(and(eq(roomSeats.roomId, roomId), eq(roomSeats.seatIndex, info.receiverSeat))).limit(1))[0];
  if (!receiver) throw new Error("头游席位不存在");
  const hand = (seat.handCards as string[]) || [];
  if (!hand.includes(card)) throw new Error("这张牌不在您的手牌中");
  if (highestCard(hand, info.levelBefore || room.currentLevel) !== card) throw new Error("进贡必须选择当前手牌中的最大牌");
  await database.update(roomSeats).set({ handCards: hand.filter((item) => item !== card), handCount: hand.length - 1 }).where(eq(roomSeats.id, seat.id));
  const receiverHand = (receiver.handCards as string[]) || [];
  await database.update(roomSeats).set({ handCards: [...receiverHand, card], handCount: receiverHand.length + 1 }).where(eq(roomSeats.id, receiver.id));
  const nextInfo: TributeState = { ...info, phase: "return", tributeCard: card };
  await database.update(rooms).set({ tributeInfo: nextInfo }).where(eq(rooms.id, roomId));
  await database.insert(roomLogs).values({ roomId, senderName: seat.displayName, message: `【${seat.displayName}】已进贡最大牌，请头游还牌。`, type: "tribute" });
  return nextInfo;
}

/** 头游还牌，完成仪式后由房主点击“开始下一局”。 */
export async function submitReturnCard(roomId: number, seatIndex: number, card: string) {
  const database = await getDb();
  if (!database) throw new Error("Database offline");
  const room = (await database.select().from(rooms).where(eq(rooms.id, roomId)).limit(1))[0];
  const info = room?.tributeInfo as TributeState | null;
  if (!room || room.status !== "tribute" || !info || info.phase !== "return" || info.receiverSeat !== seatIndex) throw new Error("还没轮到您还牌");
  const receiver = (await database.select().from(roomSeats).where(and(eq(roomSeats.roomId, roomId), eq(roomSeats.seatIndex, seatIndex))).limit(1))[0];
  const payer = info.payerSeat === undefined ? undefined : (await database.select().from(roomSeats).where(and(eq(roomSeats.roomId, roomId), eq(roomSeats.seatIndex, info.payerSeat))).limit(1))[0];
  if (!receiver || !payer) throw new Error("席位不存在");
  const receiverHand = (receiver.handCards as string[]) || [];
  if (!receiverHand.includes(card)) throw new Error("这张牌不在您的手牌中");
  await database.update(roomSeats).set({ handCards: receiverHand.filter((item) => item !== card), handCount: receiverHand.length - 1 }).where(eq(roomSeats.id, receiver.id));
  const payerHand = (payer.handCards as string[]) || [];
  await database.update(roomSeats).set({ handCards: [...payerHand, card], handCount: payerHand.length + 1 }).where(eq(roomSeats.id, payer.id));
  const nextInfo: TributeState = { ...info, phase: "complete", returnCard: card };
  await database.update(rooms).set({ tributeInfo: nextInfo }).where(eq(rooms.id, roomId));
  await database.update(roomRounds).set({ tributeSummary: nextInfo }).where(and(eq(roomRounds.roomId, roomId), eq(roomRounds.roundNumber, room.roundNumber)));
  await database.insert(roomLogs).values({ roomId, senderName: receiver.displayName, message: `【${receiver.displayName}】完成还牌，下一局可以开打！`, type: "tribute" });
  return nextInfo;
}

export function getSeatName(idx: number): string {
  switch (idx) {
    case 0: return "南(自座)";
    case 1: return "东(右家)";
    case 2: return "北(对家队友)";
    case 3: return "西(左家)";
    default: return `席位${idx}`;
  }
}
