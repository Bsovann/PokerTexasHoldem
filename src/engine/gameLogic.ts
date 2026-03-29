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
  has_acted_this_street?: boolean;
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
}

export interface GameState {
  room: GameRoom;
  players: Player[];
}

// Returns active (non-folded, non-out, non-left) players sorted by seat
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
  if (actives.length === 0) return current;
  const next = actives.find(s => s > current);
  return next !== undefined ? next : actives[0];
}

// Find the first active player to the LEFT of the dealer (wrapping around by seat_index)
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

  // Deal 2 hole cards to each player
  const playerUpdates: Partial<Player>[] = seated.map((p, i) => ({
    id: p.id,
    hole_cards: [deck[i * 2], deck[i * 2 + 1]],
    status: 'active' as PlayerStatus,
    current_bet: 0,
    total_bet_this_round: 0,
    has_acted_this_street: false,
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

  const playerUpdate: Partial<Player> = { id: playerId, status: 'folded', has_acted_this_street: true };

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
  amount: number // ADDITIONAL chips to add (e.g. callAmount = maxBet - player.current_bet)
): { playerUpdate: Partial<Player>; roomUpdate: Partial<GameRoom> } {
  const player = state.players.find(p => p.id === playerId)!;
  const actualAmount = Math.min(amount, player.chips); // can't bet more than chips

  const newStatus: PlayerStatus = actualAmount >= player.chips ? 'all_in' : 'active';

  const playerUpdate: Partial<Player> = {
    id: playerId,
    chips: player.chips - actualAmount,
    current_bet: player.current_bet + actualAmount,
    total_bet_this_round: player.total_bet_this_round + actualAmount,
    status: newStatus,
    has_acted_this_street: true,
  };

  const updatedPlayers = state.players.map(p =>
    p.id === playerId ? { ...p, ...playerUpdate } : p
  );

  // If this was a raise, update min_raise
  const maxBetBefore = Math.max(...state.players.map(p => p.current_bet));
  const newBet = player.current_bet + actualAmount;
  const raiseAmount = newBet - maxBetBefore;
  const newMinRaise = raiseAmount > 0 ? Math.max(state.room.min_raise, raiseAmount) : state.room.min_raise;

  const roomUpdate: Partial<GameRoom> = {
    pot: state.room.pot + actualAmount,
    current_player_seat: nextSeat(player.seat_index, updatedPlayers),
    min_raise: newMinRaise,
  };

  return { playerUpdate, roomUpdate };
}

export function shouldAdvanceStreet(state: GameState): boolean {
  const active = state.players.filter(p => p.status === 'active');
  // If no active players (all folded or all-in), advance
  if (active.length === 0) return true;
  // If only one active player and rest are folded/all-in, check if they've acted
  if (active.length === 1) {
    const allIn = state.players.filter(p => p.status === 'all_in');
    // If there are all-in players and the single active player has matched, advance
    if (allIn.length > 0) {
      const maxBet = Math.max(...state.players.filter(p => p.status === 'active' || p.status === 'all_in').map(p => p.current_bet));
      return active[0].current_bet >= maxBet && (active[0].has_acted_this_street === true);
    }
  }

  const maxBet = Math.max(...state.players.filter(p => p.status === 'active' || p.status === 'all_in').map(p => p.current_bet));

  // Every active player must have acted AND matched the highest bet
  return active.every(p => p.current_bet === maxBet && p.has_acted_this_street === true);
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

  // Reset bets and has_acted for new street
  const playerUpdates: Partial<Player>[] = players
    .filter(p => p.status === 'active' || p.status === 'all_in')
    .map(p => ({ id: p.id, current_bet: 0, has_acted_this_street: false }));

  // First active player to the left of the dealer (wrapping around)
  const firstSeat = firstActiveAfterDealer(room.dealer_seat, players);

  return {
    roomUpdate: {
      current_round: nextRound,
      community_cards: community,
      deck,
      current_player_seat: firstSeat,
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
