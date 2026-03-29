import { Card, createDeck, shuffle } from './deck';
import { bestHand, getWinners, PlayerHand } from './handEvaluator';

export type RoundType = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type PlayerStatus = 'waiting' | 'active' | 'folded' | 'all_in' | 'out';

export interface Player {
  id: string;
  nickname: string;
  seat_index: number;
  chips: number;
  hole_cards: Card[];
  current_bet: number;
  total_bet_this_round: number;
  status: PlayerStatus;
  is_host: boolean;
  session_token: string;
}

export interface GameRoom {
  id: string;
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  community_cards: Card[];
  deck: Card[];
  pot: number;
  current_round: RoundType;
  current_player_seat: number;
  dealer_seat: number;
  small_blind: number;
  big_blind: number;
  min_raise: number;
}

export interface GameState {
  room: GameRoom;
  players: Player[];
}

// Returns seats of active players in order after dealer
function activePlayers(players: Player[]): Player[] {
  return players
    .filter(p => p.status === 'active' || p.status === 'all_in')
    .sort((a, b) => a.seat_index - b.seat_index);
}

function nextSeat(current: number, players: Player[]): number {
  const actives = players
    .filter(p => p.status === 'active')
    .map(p => p.seat_index)
    .sort((a, b) => a - b);
  const next = actives.find(s => s > current);
  return next !== undefined ? next : actives[0];
}

export function initializeGame(players: Player[], room: GameRoom): Partial<GameRoom> & { playerUpdates: Partial<Player>[] } {
  const deck = shuffle(createDeck());
  const seated = [...players].sort((a, b) => a.seat_index - b.seat_index);

  // Deal 2 hole cards to each player
  const playerUpdates: Partial<Player>[] = seated.map((p, i) => ({
    id: p.id,
    hole_cards: [deck[i * 2], deck[i * 2 + 1]],
    status: 'active' as PlayerStatus,
    current_bet: 0,
    total_bet_this_round: 0,
  }));

  const remainingDeck = deck.slice(seated.length * 2);
  const dealerSeat = seated[0].seat_index;
  const sbIndex = seated.length > 2 ? 1 : 0;
  const bbIndex = seated.length > 2 ? 2 : 1;
  const sbSeat = seated[sbIndex % seated.length].seat_index;
  const bbSeat = seated[bbIndex % seated.length].seat_index;

  // Deduct blinds
  playerUpdates[sbIndex % seated.length] = {
    ...playerUpdates[sbIndex % seated.length],
    chips: seated[sbIndex % seated.length].chips - room.small_blind,
    current_bet: room.small_blind,
    total_bet_this_round: room.small_blind,
  };
  playerUpdates[bbIndex % seated.length] = {
    ...playerUpdates[bbIndex % seated.length],
    chips: seated[bbIndex % seated.length].chips - room.big_blind,
    current_bet: room.big_blind,
    total_bet_this_round: room.big_blind,
  };

  const firstToAct = seated[(bbIndex + 1) % seated.length].seat_index;

  return {
    deck: remainingDeck,
    community_cards: [],
    pot: room.small_blind + room.big_blind,
    current_round: 'preflop',
    current_player_seat: firstToAct,
    dealer_seat: dealerSeat,
    min_raise: room.big_blind,
    status: 'playing',
    playerUpdates,
  };
}

export function applyFold(state: GameState, playerId: string): { playerUpdate: Partial<Player>; roomUpdate: Partial<GameRoom> } {
  const player = state.players.find(p => p.id === playerId)!;
  const others = state.players.filter(p => p.id !== playerId);
  const stillActive = others.filter(p => p.status === 'active' || p.status === 'all_in');

  const playerUpdate: Partial<Player> = { id: playerId, status: 'folded' };

  // If only one player left, they win
  if (stillActive.length === 1) {
    return {
      playerUpdate,
      roomUpdate: { current_round: 'showdown', current_player_seat: stillActive[0].seat_index },
    };
  }

  const updatedPlayers = state.players.map(p => p.id === playerId ? { ...p, status: 'folded' as PlayerStatus } : p);
  const next = nextSeat(player.seat_index, updatedPlayers);
  return {
    playerUpdate,
    roomUpdate: { current_player_seat: next },
  };
}

export function applyBet(
  state: GameState,
  playerId: string,
  amount: number // total amount to bet (includes previous current_bet)
): { playerUpdate: Partial<Player>; roomUpdate: Partial<GameRoom> } {
  const player = state.players.find(p => p.id === playerId)!;
  const callAmount = Math.max(...state.players.map(p => p.current_bet)) - player.current_bet;
  const actualAmount = Math.min(amount, player.chips); // can't bet more than chips
  const addedToPot = actualAmount;

  const newStatus: PlayerStatus = actualAmount >= player.chips ? 'all_in' : 'active';

  const playerUpdate: Partial<Player> = {
    id: playerId,
    chips: player.chips - actualAmount,
    current_bet: player.current_bet + actualAmount,
    total_bet_this_round: player.total_bet_this_round + actualAmount,
    status: newStatus,
  };

  const updatedPlayers = state.players.map(p =>
    p.id === playerId ? { ...p, ...playerUpdate } : p
  );

  const roomUpdate: Partial<GameRoom> = {
    pot: state.room.pot + addedToPot,
    current_player_seat: nextSeat(player.seat_index, updatedPlayers),
  };

  return { playerUpdate, roomUpdate };
}

export function shouldAdvanceStreet(state: GameState): boolean {
  const active = state.players.filter(p => p.status === 'active');
  if (active.length === 0) return true;

  const maxBet = Math.max(...state.players.filter(p => p.status === 'active' || p.status === 'all_in').map(p => p.current_bet));
  return active.every(p => p.current_bet === maxBet);
}

export function advanceStreet(state: GameState): { roomUpdate: Partial<GameRoom>; playerUpdates: Partial<Player>[] } {
  const { room, players } = state;
  const deck = [...room.deck];
  const community = [...room.community_cards];

  let nextRound: RoundType;
  if (room.current_round === 'preflop') {
    community.push(deck.shift()!, deck.shift()!, deck.shift()!); // flop
    nextRound = 'flop';
  } else if (room.current_round === 'flop') {
    community.push(deck.shift()!); // turn
    nextRound = 'turn';
  } else if (room.current_round === 'turn') {
    community.push(deck.shift()!); // river
    nextRound = 'river';
  } else {
    nextRound = 'showdown';
  }

  // Reset bets for new street
  const playerUpdates: Partial<Player>[] = players
    .filter(p => p.status === 'active' || p.status === 'all_in')
    .map(p => ({ id: p.id, current_bet: 0 }));

  const firstActive = players
    .filter(p => p.status === 'active')
    .sort((a, b) => a.seat_index - b.seat_index)[0];

  return {
    roomUpdate: {
      current_round: nextRound,
      community_cards: community,
      deck,
      current_player_seat: firstActive?.seat_index ?? room.dealer_seat,
      min_raise: room.big_blind,
    },
    playerUpdates,
  };
}

export function resolveShowdown(players: Player[], communityCards: Card[]): { winnerId: string; handLabel: string }[] {
  const contenders = players.filter(p => p.status === 'active' || p.status === 'all_in');
  const hands: PlayerHand[] = contenders.map(p => ({
    playerId: p.id,
    result: bestHand(p.hole_cards, communityCards),
  }));
  const winners = getWinners(hands);
  return winners.map(w => ({ winnerId: w.playerId, handLabel: w.result.label }));
}
