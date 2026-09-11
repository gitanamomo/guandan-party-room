import { describe, expect, it } from "vitest";
import {
  analyzePlay,
  canBeat,
  createGuandanDeck,
  parseCard,
  shuffleAndDeal,
  sortCards,
} from "../shared/guandan";
import { appRouter } from "./routers";

describe("掼蛋规则与牌型算法验证", () => {
  it("一副完整的掼蛋牌由两副扑克组成共108张", () => {
    const deck = createGuandanDeck();
    expect(deck).toHaveLength(108);
  });

  it("洗牌发牌给4位玩家，每位精确分得27张牌", () => {
    const deck = createGuandanDeck();
    const hands = shuffleAndDeal(deck);
    expect(hands).toHaveLength(4);
    hands.forEach((hand) => {
      expect(hand).toHaveLength(27);
    });
  });

  it("红心级牌作为逢人配拥有最高优先级", () => {
    const normalLevel = parseCard("♠-2-0", "2");
    const wildLevel = parseCard("♥-2-0", "2");

    expect(normalLevel.isLevelCard).toBe(true);
    expect(normalLevel.isRedHeartLevel).toBe(false);
    expect(wildLevel.isRedHeartLevel).toBe(true);

    const sorted = sortCards(["♠-A-0", "♥-2-0", "♣-K-0"], "2");
    expect(sorted[0]).toBe("♥-2-0"); // 逢人配排在最前
  });

  it("炸弹压制与天王炸逻辑判定正确", () => {
    const fourBomb = analyzePlay(["♠-8-0", "♥-8-0", "♣-8-1", "♦-8-1"], "2");
    const fiveBomb = analyzePlay(["♠-9-0", "♥-9-0", "♣-9-1", "♦-9-1", "♠-9-1"], "2");
    const fourJokers = analyzePlay(["JOKER-SJ-0", "JOKER-SJ-1", "JOKER-BJ-0", "JOKER-BJ-1"], "2");

    expect(fourBomb.type).toBe("BOMB_4");
    expect(fiveBomb.type).toBe("BOMB_5");
    expect(fourJokers.type).toBe("FOUR_JOKER_BOMB");

    // 5炸压4炸
    expect(canBeat(fiveBomb, fourBomb).allowed).toBe(true);
    expect(canBeat(fourBomb, fiveBomb).allowed).toBe(false);

    // 四大天王最大
    expect(canBeat(fourJokers, fiveBomb).allowed).toBe(true);
    expect(canBeat(fiveBomb, fourJokers).allowed).toBe(false);
  });
});

describe("房间与开房流程路由测试", () => {
  it("创建房间接口返回有效的房间号和邀请链接", async () => {
    const caller = appRouter.createCaller({
      user: {
        id: 888,
        openId: "test-host",
        name: "房主老王",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as any,
      res: {} as any,
    });

    const roomRes = await caller.room.create({
      title: "测试茶室",
      displayName: "房主老王",
      avatarStyle: "panda",
      targetScore: 14,
    });

    expect(roomRes.roomCode).toMatch(/^\d{6}$/);
    expect(roomRes.inviteToken).toContain("gd_");

    // 查询房间信息
    const detail = await caller.room.getByCodeOrToken({ key: roomRes.roomCode });
    expect(detail).toBeDefined();
    expect(detail?.room.hostName).toBe("房主老王");
    expect(detail?.seats).toHaveLength(4);
    expect(detail?.seats[0].displayName).toBe("房主老王");
    expect(detail?.seats[0].isHost).toBe(true);
  });
});
