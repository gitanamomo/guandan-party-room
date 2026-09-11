import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { analyzePlay, canBeat, HandAnalysis } from "../shared/guandan";
import { and, eq } from "drizzle-orm";
import { LastPlayRecord, roomLogs, rooms, roomSeats } from "../drizzle/schema";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  room: router({
    getAvatars: publicProcedure.query(() => {
      return db.DEFAULT_AVATARS;
    }),

    create: publicProcedure
      .input(
        z.object({
          title: z.string().optional().default("江南掼蛋雅间"),
          displayName: z.string().min(1, "名字不能为空").max(20, "昵称过长"),
          avatarStyle: z.string().default("panda"),
          targetScore: z.number().default(14),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const hostUserId = ctx.user?.id || 10001;
        const result = await db.createRoom({
          title: input.title,
          hostUserId,
          hostName: input.displayName,
          hostAvatarStyle: input.avatarStyle,
          targetScore: input.targetScore,
        });
        return result;
      }),

    getByCodeOrToken: publicProcedure
      .input(z.object({ key: z.string() }))
      .query(async ({ input }) => {
        const room = await db.findRoomByCodeOrToken(input.key);
        if (!room) return null;
        return db.getRoomDetails(room.id);
      }),

    getDetail: publicProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        return db.getRoomDetails(input.roomId);
      }),

    joinSeat: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          guestId: z.string(),
          displayName: z.string().min(1, "名字不能为空").max(20, "昵称过长"),
          avatarStyle: z.string().default("tiger"),
          preferredSeat: z.number().min(0).max(3).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return db.joinRoomSeat({
          roomId: input.roomId,
          userId: ctx.user?.id,
          guestId: input.guestId,
          displayName: input.displayName,
          avatarStyle: input.avatarStyle,
          preferredSeat: input.preferredSeat,
        });
      }),

    startGame: publicProcedure
      .input(z.object({ roomId: z.number(), hostUserId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        const database = await db.getDb();
        if (!database) throw new Error("Database offline");

        const room = await database.select().from(rooms).where(eq(rooms.id, input.roomId)).limit(1);
        if (!room[0]) throw new Error("房间不存在");

        const currentUserId = ctx.user?.id || input.hostUserId || room[0].hostUserId;
        await db.startRoomGame(input.roomId, currentUserId);
        return { success: true };
      }),

    submitTribute: publicProcedure
      .input(z.object({ roomId: z.number(), seatIndex: z.number(), card: z.string() }))
      .mutation(async ({ input }) => {
        return db.submitTribute(input.roomId, input.seatIndex, input.card);
      }),

    submitReturnCard: publicProcedure
      .input(z.object({ roomId: z.number(), seatIndex: z.number(), card: z.string() }))
      .mutation(async ({ input }) => {
        return db.submitReturnCard(input.roomId, input.seatIndex, input.card);
      }),

    callAiToFill: publicProcedure
      .input(z.object({ roomId: z.number(), seatIndex: z.number() }))
      .mutation(async ({ input }) => {
        await db.fillSeatWithAi(input.roomId, input.seatIndex);
        return { success: true };
      }),

    playCards: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          seatIndex: z.number(),
          cards: z.array(z.string()),
        })
      )
      .mutation(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new Error("数据库未连接");

        const roomList = await database.select().from(rooms).where(eq(rooms.id, input.roomId)).limit(1);
        const room = roomList[0];
        if (!room || room.status !== "playing") throw new Error("对局未在进行中");

        if (room.activeSeat !== input.seatIndex) {
          throw new Error("还没轮到您出牌，请稍候");
        }

        const seatList = await database.select().from(roomSeats).where(and(eq(roomSeats.roomId, input.roomId), eq(roomSeats.seatIndex, input.seatIndex))).limit(1);
        const seat = seatList[0];
        if (!seat) throw new Error("席位不存在");

        const currentAnalysis = analyzePlay(input.cards, room.currentLevel);
        if (currentAnalysis.type === "INVALID") {
          throw new Error("出牌不符合掼蛋规范（支持单张、对子、三张、三带两、五连顺、同花顺、炸弹等）");
        }

        const prevPlay = room.lastPlay as LastPlayRecord | null;
        const prevAnalysis: HandAnalysis | null = prevPlay && prevPlay.cards && prevPlay.cards.length > 0
          ? {
              type: prevPlay.cardType as any,
              primaryRank: prevPlay.rankValue,
              length: prevPlay.cards.length,
              power: prevPlay.rankValue,
              displayName: prevPlay.text,
            }
          : null;

        const isFreePlay = !prevPlay || !prevPlay.cards || prevPlay.cards.length === 0 || prevPlay.seat === input.seatIndex;
        if (!isFreePlay) {
          const beatCheck = canBeat(currentAnalysis, prevAnalysis);
          if (!beatCheck.allowed) {
            throw new Error(beatCheck.reason || "牌力不足，压不住上一手");
          }
        }

        const currentHand = (seat.handCards as string[]) || [];
        const newHand = currentHand.filter((c) => !input.cards.includes(c));

        const winningOrder = (room.winningOrder as number[]) || [];
        let updatedRankFinish = seat.rankFinish;
        let isJustFinished = false;

        if (newHand.length === 0 && updatedRankFinish === 0) {
          winningOrder.push(input.seatIndex);
          updatedRankFinish = winningOrder.length;
          isJustFinished = true;
        }

        let nextSeat = (input.seatIndex + 1) % 4;
        let loops = 0;
        const allSeats = await database.select().from(roomSeats).where(eq(roomSeats.roomId, input.roomId)).orderBy(roomSeats.seatIndex);
        
        while (loops < 4) {
          const s = allSeats[nextSeat];
          const hasCards = (nextSeat === input.seatIndex ? newHand.length : s.handCount) > 0;
          if (hasCards) break;
          nextSeat = (nextSeat + 1) % 4;
          loops++;
        }

        await database.update(roomSeats).set({
          handCards: newHand,
          handCount: newHand.length,
          rankFinish: updatedRankFinish,
        }).where(eq(roomSeats.id, seat.id));

        const rankTitles = ["", "头游👑", "二游🥈", "三游🥉", "末游"];
        const playDesc = isJustFinished
          ? `【${seat.displayName}】打出 ${currentAnalysis.displayName}，手牌全部出完，勇夺【${rankTitles[updatedRankFinish]}】！🎉`
          : `【${seat.displayName}】打出 ${currentAnalysis.displayName}（${input.cards.length}张）`;

        const newPlayRecord: LastPlayRecord = {
          seat: input.seatIndex,
          playerName: seat.displayName,
          cards: input.cards,
          cardType: currentAnalysis.type,
          rankValue: currentAnalysis.power,
          text: currentAnalysis.displayName,
          timestamp: Date.now(),
        };

        await database.update(rooms).set({
          activeSeat: nextSeat,
          lastPlay: newPlayRecord,
          winningOrder,
          status: winningOrder.length >= 3 ? "tribute" : "playing",
        }).where(eq(rooms.id, input.roomId));

        await database.insert(roomLogs).values({
          roomId: input.roomId,
          senderName: seat.displayName,
          message: playDesc,
          type: "play",
        });

        if (winningOrder.length >= 3) {
          await db.settleRound(input.roomId, winningOrder);
        }

        const nextSeatObj = allSeats[nextSeat];
        if (nextSeatObj && nextSeatObj.isAi && winningOrder.length < 3) {
          triggerAiAction(input.roomId, nextSeat);
        }

        return { success: true, nextSeat };
      }),

    passTurn: publicProcedure
      .input(z.object({ roomId: z.number(), seatIndex: z.number() }))
      .mutation(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new Error("数据库未连接");

        const roomList = await database.select().from(rooms).where(eq(rooms.id, input.roomId)).limit(1);
        const room = roomList[0];
        if (!room || room.status !== "playing") throw new Error("对局未在进行中");

        if (room.activeSeat !== input.seatIndex) {
          throw new Error("还没轮到您操作");
        }

        const prevPlay = room.lastPlay as LastPlayRecord | null;
        if (!prevPlay || !prevPlay.cards || prevPlay.cards.length === 0 || prevPlay.seat === input.seatIndex) {
          throw new Error("您是本轮领出者，不能放弃出牌，必须出一手牌");
        }

        const seatList = await database.select().from(roomSeats).where(and(eq(roomSeats.roomId, input.roomId), eq(roomSeats.seatIndex, input.seatIndex))).limit(1);
        const seat = seatList[0];

        let nextSeat = (input.seatIndex + 1) % 4;
        const allSeats = await database.select().from(roomSeats).where(eq(roomSeats.roomId, input.roomId)).orderBy(roomSeats.seatIndex);
        let loops = 0;
        while (loops < 4) {
          const s = allSeats[nextSeat];
          if (s.handCount > 0) break;
          nextSeat = (nextSeat + 1) % 4;
          loops++;
        }

        let updatedLastPlay: LastPlayRecord | null = prevPlay;
        if (nextSeat === prevPlay.seat) {
          // 转回给最高者，清空出牌要求
          updatedLastPlay = {
            seat: prevPlay.seat,
            playerName: prevPlay.playerName,
            cards: [],
            cardType: "FREE",
            rankValue: 0,
            text: "自由出牌",
            timestamp: Date.now(),
          };
        }

        await database.update(rooms).set({
          activeSeat: nextSeat,
          lastPlay: updatedLastPlay,
        }).where(eq(rooms.id, input.roomId));

        await database.insert(roomLogs).values({
          roomId: input.roomId,
          senderName: seat?.displayName || `席位${input.seatIndex}`,
          message: `【${seat?.displayName || "牌手"}】选择了过牌（要不起/不要）`,
          type: "play",
        });

        const nextSeatObj = allSeats[nextSeat];
        if (nextSeatObj && nextSeatObj.isAi) {
          triggerAiAction(input.roomId, nextSeat);
        }

        return { success: true, nextSeat };
      }),

    sendChat: publicProcedure
      .input(
        z.object({
          roomId: z.number(),
          senderName: z.string(),
          message: z.string().min(1).max(100),
        })
      )
      .mutation(async ({ input }) => {
        const database = await db.getDb();
        if (!database) return { success: false };

        await database.insert(roomLogs).values({
          roomId: input.roomId,
          senderName: input.senderName,
          message: input.message,
          type: "chat",
        });
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;

async function triggerAiAction(roomId: number, seatIndex: number) {
  setTimeout(async () => {
    try {
      const database = await db.getDb();
      if (!database) return;

      const roomList = await database.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
      const room = roomList[0];
      if (!room || room.status !== "playing" || room.activeSeat !== seatIndex) return;

      const seatList = await database.select().from(roomSeats).where(and(eq(roomSeats.roomId, roomId), eq(roomSeats.seatIndex, seatIndex))).limit(1);
      const seat = seatList[0];
      if (!seat || !seat.isAi || seat.handCount === 0) return;

      const hand = (seat.handCards as string[]) || [];
      if (hand.length === 0) return;

      const prevPlay = room.lastPlay as LastPlayRecord | null;
      const isFree = !prevPlay || !prevPlay.cards || prevPlay.cards.length === 0 || prevPlay.seat === seatIndex;

      if (isFree) {
        const smallestCard = hand[hand.length - 1];
        const analysis = analyzePlay([smallestCard], room.currentLevel);

        const newHand = hand.filter((c) => c !== smallestCard);
        const nextSeat = (seatIndex + 1) % 4;

        await database.update(roomSeats).set({
          handCards: newHand,
          handCount: newHand.length,
        }).where(eq(roomSeats.id, seat.id));

        await database.update(rooms).set({
          activeSeat: nextSeat,
          lastPlay: {
            seat: seatIndex,
            playerName: seat.displayName,
            cards: [smallestCard],
            cardType: analysis.type,
            rankValue: analysis.power,
            text: analysis.displayName,
            timestamp: Date.now(),
          },
        }).where(eq(rooms.id, roomId));

        await database.insert(roomLogs).values({
          roomId,
          senderName: seat.displayName,
          message: `【${seat.displayName}】打出 ${analysis.displayName}`,
          type: "play",
        });
      } else {
        let nextSeat = (seatIndex + 1) % 4;
        let updatedLastPlay: LastPlayRecord | null = prevPlay;
        if (nextSeat === prevPlay.seat) {
          updatedLastPlay = {
            seat: prevPlay.seat,
            playerName: prevPlay.playerName,
            cards: [],
            cardType: "FREE",
            rankValue: 0,
            text: "自由出牌",
            timestamp: Date.now(),
          };
        }

        await database.update(rooms).set({
          activeSeat: nextSeat,
          lastPlay: updatedLastPlay,
        }).where(eq(rooms.id, roomId));

        await database.insert(roomLogs).values({
          roomId,
          senderName: seat.displayName,
          message: `【${seat.displayName}】过牌`,
          type: "play",
        });
      }
    } catch (err) {
      console.error("[AI] Action error:", err);
    }
  }, 1200);
}
