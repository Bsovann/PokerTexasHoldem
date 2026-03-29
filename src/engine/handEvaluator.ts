import { Card, Rank, rankValue } from './deck';

export type HandRank =
  | 'high_card'
  | 'one_pair'
  | 'two_pair'
  | 'three_of_a_kind'
  | 'straight'
  | 'flush'
  | 'full_house'
  | 'four_of_a_kind'
  | 'straight_flush'
  | 'royal_flush';

export interface HandResult {
  rank: HandRank;
  score: number; // higher = better
  label: string;
}

const HAND_SCORES: Record<HandRank, number> = {
  high_card: 0,
  one_pair: 1,
  two_pair: 2,
  three_of_a_kind: 3,
  straight: 4,
  flush: 5,
  full_house: 6,
  four_of_a_kind: 7,
  straight_flush: 8,
  royal_flush: 9,
};

function evaluate5(cards: Card[]): HandResult {
  const ranks = cards.map(c => rankValue(c.rank)).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  const isStraight = (() => {
    if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) return true;
    // Wheel: A-2-3-4-5
    if (JSON.stringify(ranks) === JSON.stringify([12, 3, 2, 1, 0])) return true;
    return false;
  })();

  const rankCounts: Record<number, number> = {};
  for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const topRank = ranks[0];

  // Tiebreaker: encode counts and ranks into a score
  const tiebreaker = ranks.reduce((acc, r, i) => acc + r * Math.pow(15, 4 - i), 0);

  if (isFlush && isStraight) {
    const isRoyal = ranks[0] === 12 && ranks[4] === 8;
    if (isRoyal) return { rank: 'royal_flush', score: HAND_SCORES.royal_flush * 1e9 + tiebreaker, label: 'Royal Flush' };
    return { rank: 'straight_flush', score: HAND_SCORES.straight_flush * 1e9 + tiebreaker, label: 'Straight Flush' };
  }
  if (counts[0] === 4) return { rank: 'four_of_a_kind', score: HAND_SCORES.four_of_a_kind * 1e9 + tiebreaker, label: 'Four of a Kind' };
  if (counts[0] === 3 && counts[1] === 2) return { rank: 'full_house', score: HAND_SCORES.full_house * 1e9 + tiebreaker, label: 'Full House' };
  if (isFlush) return { rank: 'flush', score: HAND_SCORES.flush * 1e9 + tiebreaker, label: 'Flush' };
  if (isStraight) return { rank: 'straight', score: HAND_SCORES.straight * 1e9 + tiebreaker, label: 'Straight' };
  if (counts[0] === 3) return { rank: 'three_of_a_kind', score: HAND_SCORES.three_of_a_kind * 1e9 + tiebreaker, label: 'Three of a Kind' };
  if (counts[0] === 2 && counts[1] === 2) return { rank: 'two_pair', score: HAND_SCORES.two_pair * 1e9 + tiebreaker, label: 'Two Pair' };
  if (counts[0] === 2) return { rank: 'one_pair', score: HAND_SCORES.one_pair * 1e9 + tiebreaker, label: 'Pair' };
  return { rank: 'high_card', score: HAND_SCORES.high_card * 1e9 + tiebreaker, label: 'High Card' };
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

export function bestHand(holeCards: Card[], communityCards: Card[]): HandResult {
  const all = [...holeCards, ...communityCards];
  const combos = combinations(all, 5);
  let best: HandResult | null = null;
  for (const combo of combos) {
    const result = evaluate5(combo);
    if (!best || result.score > best.score) best = result;
  }
  return best!;
}

export interface PlayerHand {
  playerId: string;
  result: HandResult;
}

export function getWinners(hands: PlayerHand[]): PlayerHand[] {
  const maxScore = Math.max(...hands.map(h => h.result.score));
  return hands.filter(h => h.result.score === maxScore);
}
