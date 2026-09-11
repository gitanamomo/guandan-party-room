import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertRoom, InsertRoomLog, InsertRoomSeat, InsertUser, Room, roomLogs, RoomSeat, roomSeats, rooms, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import { createGuandanDeck, shuffleAndDeal, sortCards } from "../shared/guandan";

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

  const [insertResult] = await db.insert(rooms).values({
    roomCode,
    title: params.title || `${params.hostName}的掼蛋雅间`,
    hostUserId: params.hostUserId,
    hostName: params.hostName,
    targetScore: params.targetScore || 14,
    currentLevel: "2",
    status: "waiting",
    inviteToken,
    winningOrder: [],
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

  return { roomId, roomCode, inviteToken };
}

// 获取房间全量状态
export async function getRoomDetails(roomId: number) {
  const db = await getDb();
  if (!db) return null;

  const roomRows = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!roomRows[0]) return null;

  const seatRows = await db.select().from(roomSeats).where(eq(roomSeats.roomId, roomId)).orderBy(roomSeats.seatIndex);
  const logRows = await db.select().from(roomLogs).where(eq(roomLogs.roomId, roomId)).orderBy(desc(roomLogs.createdAt)).limit(30);

  return {
    room: roomRows[0],
    seats: seatRows,
    logs: logRows.reverse(),
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

  // 检查4个席位是否都有人或AI
  const seats = await db.select().from(roomSeats).where(eq(roomSeats.roomId, roomId)).orderBy(roomSeats.seatIndex);
  for (const s of seats) {
    if (!s.guestId) {
      throw new Error(`【${getSeatName(s.seatIndex)}】席位尚无玩家，需四人凑齐或邀请好友/呼叫AI才可开房！`);
    }
  }

  // 洗牌发牌
  const deck = createGuandanDeck();
  const hands = shuffleAndDeal(deck);

  for (let i = 0; i < 4; i++) {
    const sorted = sortCards(hands[i], room[0].currentLevel);
    await db.update(roomSeats).set({
      handCards: sorted,
      handCount: sorted.length,
      rankFinish: 0,
      isReady: true,
    }).where(eq(roomSeats.id, seats[i].id));
  }

  await db.update(rooms).set({
    status: "playing",
    activeSeat: 0,
    lastPlay: null,
    winningOrder: [],
  }).where(eq(rooms.id, roomId));

  await db.insert(roomLogs).values({
    roomId,
    senderName: "茶馆裁判",
    message: `掼蛋四人对局正式开启！打【${room[0].currentLevel}】，请南位房主首发出牌。`,
    type: "system",
  });
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
