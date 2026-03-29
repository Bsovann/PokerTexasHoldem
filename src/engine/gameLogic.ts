import { Card, createDeck, shuffle } from './deck';
import { bestHand, getWinners, PlayerHand } from './handEvaluator';

export type RoundType = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type PlayerStatus = 'waiting' | 'active' | 'folded' | 'all_in' | 'out' | 'left';

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
  status: 'waiting' | 'playing' | 'finished' | 'ended';
  community_cards: Card[];
  deck: Card[];
  pot: number;
  current_round: RoundType;
  current_player_seat: number;
  dealer_seat: number;
  small_blind: number;
  big_blind: number;
  min_raise: number;
  acted_seats: number[]; // seat indices that have acted this street
}

export interface GameState {
  room: GameRoom;
  players: Player[];
}

function nextSeat(current: number, players: Player[]): number {
  const actives = players
    .filter(p => p.status === 'active')
    .map(p => p.seat_index)
    .sort((a, b) => a - b);
  if (actives.length === 0) return current;
  const next = actives.find(s => s > current);
  return next !== undefined ? next : actives[0];
}

// First active player to the left of the dealer (wrapping around by seat_index)
function firstActiveAfterDealer(dealerSeat: number, players: Player[]): number {
  const actives = players
    .filter(p => p.status === 'active')
    .map(p => p.seat_index)
    .sort((a, b) => a - b);
  if (actives.length === 0) return dealerSeat;
  const next = actives.find(s => s > dealerSeat);
  return next !== undefined ? next : actives[0];
}

export function initializeGame(players: Player[], room: GameRoom): Partial<GameRoom> & { playerUpdates: Partial<Player>[] } {
  const deck = shuffle(createDeck());
  const seated = [...players].sort((a, b) => a.seat_index - b.seat_index);

  // Deal 2 hole cards to each player — no has_acted_this_street field
  const playerUpdates: Partial<Player>[] = seated.map((p, i) => ({
    id: p.id,
    hole_cards: [deck[i * 2], deck[i * 2 + 1]],
    status: 'active' as PlayerStatus,
    current_bet: 0,
    total_bet_this_round: 0,
  }));

  const remainingDeck = deck.slice(seated.length * 2);
  const dealerSeat = room.dealer_seat ?? seated[0].seat_index;
  const dealerIdx = seated.findIndex(p => p.seat_index === dealerSeat);
  const sbIndex = (dealerIdx + 1) % seated.length;
  const bbIndex = (dealerIdx + 2) % seated.length;

  // Deduct blinds
  playerUpdates[sbIndex] = {
    ...playerUpdates[sbIndex],
    chips: seated[sbIndex].chips - room.small_blind,
    current_bet: room.small_blind,
    total_bet_this_round: room.small_blind,
  };
  playerUpdates[bbIndex] = {
    ...playerUpdates[bbIndex],
    chips: seated[bbIndex].chips - room.big_blind,
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
    acted_seats: [],
    playerUpdates,
  };
}

export function applyFold(state: GameState, playerId: string): { playerUpdate: Partial<Player>; roomUpdate: Partial<GameRoom> } {
  const player = state.players.find(p => p.id === playerId)!;
  const others = state.players.filter(p => p.id !== playerId);
  const stillActive = others.filter(p => p.status === 'active' || p.status === 'all_in');

  const playerUpdate: Partial<Player> = { id: playerId, status: 'folded' };
  const actedSeats = [...(state.room.acted_seats ?? []), player.seat_index];

  // If only one player left, go to showdown
  if (stillActive.length === 1) {
    return {
      playerUpdate,
      roomUpdate: {
        current_round: 'showdown',
        current_player_seat: stillActive[0].seat_index,
        acted_seats: actedSeats,
      },
    };
  }

  const updatedPlayers = state.players.map(p =>
    p.id === playerId ? { ...p, status: 'folded' as PlayerStatus } : p
  );
  const next = nextSeat(player.seat_index, updatedPlayers);
  return {
    playerUpdate,
    roomUpdate: { current_player_seat: next, acted_seats: actedSeats },
  };
}

export function applyBet(
  state: GameState,
  playerId: string,
  amount: number // ADDITIONAL chips (e.g. callAmount = maxBet - player.current_bet)
): { playerUpdate: Partial<Player>; roomUpdate: Partial<GameRoom> } {
  const player = state.players.find(p => p.id === playerId)!;
  const actualAmount = Math.min(amount, player.chips);

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

  // Track raise for min_raise
  const maxBetBefore = Math.max(...state.players.map(p => p.current_bet));
  const newBet = player.current_bet + actualAmount;
  const raiseAmount = newBet - maxBetBefore;
  const newMinRaise = raiseAmount > 0 ? Math.max(state.room.min_raise, raiseAmount) : state.room.min_raise;

  // Add this player to acted_seats (avoid duplicates)
  const currentActed = state.room.acted_seats ?? [];
  const actedSeats = currentActed.includes(player.seat_index)
    ? currentActed
    : [...currentActed, player.seat_index];

  const roomUpdate: Partial<GameRoom> = {
    pot: state.room.pot + actualAmount,
    current_player_seat: nextSeat(player.seat_index, updatedPlayers),
    min_raise: newMinRaise,
    acted_seats: actedSeats,
  };

  return { playerUpdate, roomUpdate };
}

export function shouldAdvanceStreet(state: GameState): boolean {
  const active = state.players.filter(p => p.status === 'active');
  if (active.length === 0) return true;

  const actedSeats = state.room.acted_seats ?? [];
  const maxBet = Math.max(
    ...state.players
      .filter(p => p.status === 'active' || p.status === 'all_in')
      .map(p => p.current_bet)
  );

  // Every active player must have acted this street AND matched the highest bet
  return active.every(p => actedSeats.includes(p.seat_index) && p.current_bet === maxBet);
}

export function advanceStreet(state: GameState): { roomUpdate: Partial<GameRoom>; playerUpdates: Partial<Player>[] } {
  const { room, players } = state;
  const deck = [...room.deck];
  const community = [...room.community_cards];

  let nextRound: RoundType;
  if (room.current_round === 'preflop') {
    community.push(deck.shift()!, deck.shift()!, deck.shift()!);
    nextRound = 'flop';
  } else if (room.current_round === 'flop') {
    community.push(deck.shift()!);
    nextRound = 'turn';
  } else if (room.current_round === 'turn') {
    community.push(deck.shift()!);
    nextRound = 'river';
  } else {
    nextRound = 'showdown';
  }

  // Reset current_bet for new street
  const playerUpdates: Partial<Player>[] = players
    .filter(p => p.status === 'active' || p.status === 'all_in')
    .map(p => ({ id: p.id, current_bet: 0 }));

  const firstSeat = firstActiveAfterDealer(room.dealer_seat, players);

  return {
    roomUpdate: {
      current_round: nextRound,
      community_cards: community,
      deck,
      current_player_seat: firstSeat,
      min_raise: room.big_blind,
      acted_seats: [], // reset for new street
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
