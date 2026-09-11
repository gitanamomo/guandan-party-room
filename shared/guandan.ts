// 掼蛋核心算法与卡牌数据结构

export const SUITS = ["♠", "♥", "♣", "♦"] as const;
export type Suit = (typeof SUITS)[number];

export const CARD_VALUES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;

export interface Card {
  id: string; // e.g. "♠-A-0"
  suit: string; // ♠, ♥, ♣, ♦, or JOKER
  rank: string; // 2..A, SJ, BJ
  value: number; // 2..14, 16(小王), 17(大王)
  isLevelCard?: boolean;
  isRedHeartLevel?: boolean; // 逢人配（红心级牌）
}

export type PlayType =
  | "SINGLE"
  | "PAIR"
  | "TRIPLE"
  | "TRIPLE_WITH_PAIR" // 三带两
  | "STRAIGHT" // 五张顺子
  | "TUBE" // 三连对 (如 334455)
  | "PLATE" // 钢板 (二连三, 如 333444)
  | "BOMB_4" // 4张炸弹
  | "BOMB_5" // 5张炸弹
  | "BOMB_6" // 6张炸弹
  | "BOMB_7" // 7张炸弹
  | "BOMB_8" // 8张炸弹
  | "STRAIGHT_FLUSH" // 同花顺 (高于5炸，低于6炸)
  | "FOUR_JOKER_BOMB" // 天王炸 (四大天王，最大炸弹)
  | "INVALID";

export interface HandAnalysis {
  type: PlayType;
  primaryRank: number; // 主要比牌点数
  length: number;
  power: number; // 综合牌力权重用于比较大小
  displayName: string;
}

// 获取单张牌点数
export function getRankBaseValue(rank: string, levelRank: string = "2"): number {
  if (rank === "BJ") return 17; // 大王
  if (rank === "SJ") return 16; // 小王
  if (rank === levelRank) return 15; // 当前级牌升级为15（高于A）
  switch (rank) {
    case "A": return 14;
    case "K": return 13;
    case "Q": return 12;
    case "J": return 11;
    case "10": return 10;
    default: return parseInt(rank, 10) || 0;
  }
}

// 解析卡牌字符串：形如 "♠-10-0", "JOKER-SJ-1"
export function parseCard(cardStr: string, levelRank: string = "2"): Card {
  const parts = cardStr.split("-");
  const suit = parts[0];
  const rank = parts[1];
  const isLevel = rank === levelRank;
  const isRedHeartLevel = isLevel && suit === "♥";

  return {
    id: cardStr,
    suit,
    rank,
    value: getRankBaseValue(rank, levelRank),
    isLevelCard: isLevel,
    isRedHeartLevel,
  };
}

// 创建两副扑克牌共108张
export function createGuandanDeck(): string[] {
  const deck: string[] = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const suit of SUITS) {
      for (const val of CARD_VALUES) {
        deck.push(`${suit}-${val}-${copy}`);
      }
    }
    deck.push(`JOKER-SJ-${copy}`);
    deck.push(`JOKER-BJ-${copy}`);
  }
  return deck;
}

// 洗牌与发牌给四位玩家
export function shuffleAndDeal(deck: string[]): string[][] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const hands: string[][] = [[], [], [], []];
  shuffled.forEach((card, idx) => {
    hands[idx % 4].push(card);
  });

  return hands;
}

// 牌手整理牌（按点数从大到小排列，逢人配及大王靠前）
export function sortCards(cardStrs: string[], levelRank: string = "2"): string[] {
  return [...cardStrs].sort((a, b) => {
    const cA = parseCard(a, levelRank);
    const cB = parseCard(b, levelRank);
    if (cA.isRedHeartLevel !== cB.isRedHeartLevel) {
      return cA.isRedHeartLevel ? -1 : 1;
    }
    if (cB.value !== cA.value) {
      return cB.value - cA.value;
    }
    return a.localeCompare(b);
  });
}

// 分析牌型
export function analyzePlay(cardStrs: string[], levelRank: string = "2"): HandAnalysis {
  const count = cardStrs.length;
  if (count === 0) {
    return { type: "INVALID", primaryRank: 0, length: 0, power: 0, displayName: "空" };
  }

  const cards = cardStrs.map((c) => parseCard(c, levelRank));

  // 1. 四大天王 (两张大王 + 两张小王)
  if (count === 4) {
    const jokers = cards.filter((c) => c.rank === "BJ" || c.rank === "SJ");
    if (jokers.length === 4) {
      return { type: "FOUR_JOKER_BOMB", primaryRank: 100, length: 4, power: 10000, displayName: "天王炸！" };
    }
  }

  // 统计每种点数出现频率
  const rankCounts: Record<string, number> = {};
  cards.forEach((c) => {
    rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
  });

  // 2. 单张
  if (count === 1) {
    return {
      type: "SINGLE",
      primaryRank: cards[0].value,
      length: 1,
      power: cards[0].value,
      displayName: `单张 ${cards[0].rank}`,
    };
  }

  // 3. 对子
  if (count === 2) {
    if (cards[0].rank === cards[1].rank || (cards[0].isRedHeartLevel || cards[1].isRedHeartLevel)) {
      const primary = cards[0].isRedHeartLevel ? cards[1].value : cards[0].value;
      return {
        type: "PAIR",
        primaryRank: primary,
        length: 2,
        power: primary,
        displayName: `对子 ${cards[0].isRedHeartLevel ? cards[1].rank : cards[0].rank}`,
      };
    }
  }

  // 4. 三张
  if (count === 3) {
    const uniqueRanks = Object.keys(rankCounts);
    if (uniqueRanks.length === 1) {
      return {
        type: "TRIPLE",
        primaryRank: cards[0].value,
        length: 3,
        power: cards[0].value,
        displayName: `三张 ${cards[0].rank}`,
      };
    }
  }

  // 5. 炸弹 (4~8张同点数)
  const uniqueRanks = Object.keys(rankCounts);
  if (uniqueRanks.length === 1 && count >= 4 && count <= 8) {
    const baseRank = cards[0].value;
    const bombType = `BOMB_${count}` as PlayType;
    // 4炸: 100+, 5炸: 200+, 6炸: 400+, 7炸: 500+, 8炸: 600+
    const powerMap: Record<number, number> = { 4: 100, 5: 200, 6: 400, 7: 500, 8: 600 };
    return {
      type: bombType,
      primaryRank: baseRank,
      length: count,
      power: (powerMap[count] || 100) + baseRank,
      displayName: `${count}张炸弹！`,
    };
  }

  // 6. 三带两 (5张: 三同张 + 一对)
  if (count === 5) {
    const entries = Object.entries(rankCounts);
    const tripleEntry = entries.find(([, c]) => c === 3);
    const pairEntry = entries.find(([, c]) => c === 2);
    if (tripleEntry && pairEntry) {
      const tripleVal = getRankBaseValue(tripleEntry[0], levelRank);
      return {
        type: "TRIPLE_WITH_PAIR",
        primaryRank: tripleVal,
        length: 5,
        power: tripleVal,
        displayName: `三带对 (${tripleEntry[0]})`,
      };
    }

    // 7. 同花顺 (5张同花色连续点数，威力介于5炸与6炸之间)
    const allSameSuit = cards.every((c) => c.suit === cards[0].suit && c.suit !== "JOKER");
    const sortedVals = [...cards].map((c) => (c.rank === "A" ? 14 : parseInt(c.rank, 10) || (c.rank === "J" ? 11 : c.rank === "Q" ? 12 : c.rank === "K" ? 13 : 0))).sort((a, b) => a - b);
    const isConsecutive = sortedVals.every((v, idx) => idx === 0 || v === sortedVals[idx - 1] + 1);

    if (allSameSuit && isConsecutive) {
      return {
        type: "STRAIGHT_FLUSH",
        primaryRank: sortedVals[4],
        length: 5,
        power: 300 + sortedVals[4], // 5炸之上，6炸之下
        displayName: `同花顺 (${cards[0].suit})`,
      };
    }

    // 8. 普通顺子 (5张连续)
    if (isConsecutive) {
      return {
        type: "STRAIGHT",
        primaryRank: sortedVals[4],
        length: 5,
        power: sortedVals[4],
        displayName: `五连顺 (${sortedVals[0]}-${sortedVals[4]})`,
      };
    }
  }

  // 9. 三连对 (6张，如 334455)
  if (count === 6) {
    const pairs = Object.entries(rankCounts).filter(([, c]) => c === 2);
    if (pairs.length === 3) {
      const pairRanks = pairs.map(([r]) => getRankBaseValue(r, levelRank)).sort((a, b) => a - b);
      if (pairRanks[1] === pairRanks[0] + 1 && pairRanks[2] === pairRanks[1] + 1) {
        return {
          type: "TUBE",
          primaryRank: pairRanks[2],
          length: 6,
          power: pairRanks[2],
          displayName: `三连对 (${pairs.map((p) => p[0]).join("")})`,
        };
      }
    }

    // 10. 钢板 (二连三，如 333444)
    const triples = Object.entries(rankCounts).filter(([, c]) => c === 3);
    if (triples.length === 2) {
      const tripRanks = triples.map(([r]) => getRankBaseValue(r, levelRank)).sort((a, b) => a - b);
      if (tripRanks[1] === tripRanks[0] + 1) {
        return {
          type: "PLATE",
          primaryRank: tripRanks[1],
          length: 6,
          power: tripRanks[1],
          displayName: `钢板 (${triples.map((t) => t[0]).join("")})`,
        };
      }
    }
  }

  return { type: "INVALID", primaryRank: 0, length: count, power: 0, displayName: "非法牌型" };
}

// 比较两手牌大小
export function canBeat(
  current: HandAnalysis,
  previous: HandAnalysis | null | undefined
): { allowed: boolean; reason?: string } {
  if (!current || current.type === "INVALID") {
    return { allowed: false, reason: "出牌不符合掼蛋规则" };
  }

  // 如果没有前一手或前一手是自己/大家都过牌，则任意合规牌型都能出
  if (!previous || !previous.type || previous.type === "INVALID") {
    return { allowed: true };
  }

  // 天王炸最大
  if (current.type === "FOUR_JOKER_BOMB") {
    return { allowed: true };
  }
  if (previous.type === "FOUR_JOKER_BOMB") {
    return { allowed: false, reason: "敌方出的是四大天王，无法大过" };
  }

  const isCurrentBomb = current.power >= 100;
  const isPreviousBomb = previous.power >= 100;

  // 炸弹压制非炸弹
  if (isCurrentBomb && !isPreviousBomb) {
    return { allowed: true };
  }
  if (!isCurrentBomb && isPreviousBomb) {
    return { allowed: false, reason: "上家出的是炸弹，需用更大炸弹压制" };
  }

  // 都是炸弹，直接比较权重
  if (isCurrentBomb && isPreviousBomb) {
    if (current.power > previous.power) {
      return { allowed: true };
    }
    return { allowed: false, reason: "炸弹未大于上一手" };
  }

  // 都不是炸弹，必须牌型相同且张数一致
  if (current.type !== previous.type || current.length !== previous.length) {
    return { allowed: false, reason: `需出相同牌型 (${previous.displayName})` };
  }

  if (current.primaryRank > previous.primaryRank) {
    return { allowed: true };
  }

  return { allowed: false, reason: "点数不够大，压不过上家" };
}
