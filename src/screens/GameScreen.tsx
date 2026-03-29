import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import {
  Player,
  GameRoom,
  GameState,
  applyFold,
  applyBet,
  shouldAdvanceStreet,
  advanceStreet,
  resolveShowdown,
} from '../engine/gameLogic';
import PlayerSeat from '../components/PlayerSeat';
import CommunityCards from '../components/CommunityCards';
import PotDisplay from '../components/PotDisplay';
import ActionButtons from '../components/ActionButtons';

const CONFETTI_COUNT = 18;
const CONFETTI_EMOJIS = ['\u{1F389}', '\u{2B50}', '\u{1F3C6}', '\u{1F4B0}', '\u{1F0CF}', '\u{2764}\u{FE0F}', '\u{1F525}'];

interface ConfettiPiece {
  emoji: string;
  animY: Animated.Value;
  animX: Animated.Value;
  animOpacity: Animated.Value;
  left: number;
  delay: number;
}

function createConfettiPieces(): ConfettiPiece[] {
  const { width } = Dimensions.get('window');
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    emoji: CONFETTI_EMOJIS[i % CONFETTI_EMOJIS.length],
    animY: new Animated.Value(-40),
    animX: new Animated.Value(0),
    animOpacity: new Animated.Value(1),
    left: Math.random() * (width - 30),
    delay: Math.random() * 1500,
  }));
}

export default function GameScreen({ route, navigation }: any) {
  const { roomId, playerId, sessionToken } = route.params;
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myHoleCards, setMyHoleCards] = useState<any[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  // Winner celebration animation
  const celebrationScale = useRef(new Animated.Value(0)).current;
  const celebrationOpacity = useRef(new Animated.Value(0)).current;
  const confettiPieces = useRef<ConfettiPiece[]>(createConfettiPieces()).current;

  const myPlayer = players.find(p => p.id === playerId);
  const isMyTurn = room?.current_player_seat === myPlayer?.seat_index;
  const isHost = myPlayer?.is_host;

  // Unique key for turn timer reset
  const turnKey = room ? `${room.current_round}-${room.current_player_seat}` : '';

  useEffect(() => {
    fetchState();

    const sub = supabase
      .channel(`game:${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => fetchState())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, () => fetchState())
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, []);

  async function fetchState() {
    const [{ data: roomData }, { data: playersData }, { data: myData }] = await Promise.all([
      supabase.from('rooms').select().eq('id', roomId).single(),
      supabase.from('players').select('id,nickname,seat_index,chips,current_bet,total_bet_this_round,status,is_host,session_token,has_acted_this_street').eq('room_id', roomId),
      supabase.from('players').select('hole_cards').eq('id', playerId).single(),
    ]);

    if (roomData) {
      const r = roomData as GameRoom;
      setRoom(r);

      // If room ended, navigate back
      if (r.status === 'ended') {
        navigation.replace('Home');
        return;
      }
    }
    if (playersData) setPlayers(playersData as Player[]);
    if (myData?.hole_cards) setMyHoleCards(myData.hole_cards);

    // Handle showdown
    if (roomData?.current_round === 'showdown' && playersData) {
      handleShowdown(roomData as GameRoom, playersData as Player[]);
    }
  }

  function startCelebration(text: string) {
    setWinner(text);
    setShowCelebration(true);
    celebrationScale.setValue(0);
    celebrationOpacity.setValue(0);

    Animated.spring(celebrationScale, {
      toValue: 1,
      friction: 5,
      tension: 40,
      useNativeDriver: true,
    }).start();

    Animated.timing(celebrationOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Animate confetti
    const { height } = Dimensions.get('window');
    confettiPieces.forEach(piece => {
      piece.animY.setValue(-40);
      piece.animX.setValue(0);
      piece.animOpacity.setValue(1);

      Animated.sequence([
        Animated.delay(piece.delay),
        Animated.parallel([
          Animated.timing(piece.animY, {
            toValue: height + 40,
            duration: 2500,
            useNativeDriver: true,
          }),
          Animated.timing(piece.animX, {
            toValue: (Math.random() - 0.5) * 100,
            duration: 2500,
            useNativeDriver: true,
          }),
          Animated.timing(piece.animOpacity, {
            toValue: 0,
            duration: 2500,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    });
  }

  function endCelebration() {
    setShowCelebration(false);
    setWinner(null);
    celebrationScale.setValue(0);
    celebrationOpacity.setValue(0);
  }

  async function handleShowdown(r: GameRoom, p: Player[]) {
    if (!isHost) return;

    // Fetch hole cards for all active players
    const active = p.filter(pl => pl.status === 'active' || pl.status === 'all_in');

    // If only one player left (others folded), they win automatically
    if (active.length === 1) {
      const winnerId = active[0].id;
      const winnerName = active[0].nickname;
      await supabase.from('players').update({ chips: active[0].chips + r.pot }).eq('id', winnerId);
      startCelebration(`${winnerName} wins!`);
      setTimeout(() => {
        endCelebration();
        resetForNextHand(r, p);
      }, 3000);
      return;
    }

    const { data: cards } = await supabase
      .from('players')
      .select('id,hole_cards')
      .in('id', active.map(pl => pl.id));

    const withCards = active.map(pl => ({
      ...pl,
      hole_cards: cards?.find(c => c.id === pl.id)?.hole_cards ?? [],
    }));

    const winners = resolveShowdown(withCards, r.community_cards);
    if (winners.length === 0) return;

    const winnerIds = winners.map(w => w.winnerId);
    const share = Math.floor(r.pot / winnerIds.length);
    const winnerNames = winnerIds.map(id => p.find(pl => pl.id === id)?.nickname ?? 'Player').join(', ');
    const handLabel = winners[0].handLabel;

    startCelebration(`${winnerNames} wins with ${handLabel}!`);

    // Award pot
    for (const wid of winnerIds) {
      const w = p.find(pl => pl.id === wid)!;
      await supabase.from('players').update({ chips: w.chips + share }).eq('id', wid);
    }

    // Reset for next hand after 3s
    setTimeout(() => {
      endCelebration();
      resetForNextHand(r, p);
    }, 3000);
  }

  async function resetForNextHand(r: GameRoom, p: Player[]) {
    // Move dealer button
    const active = p.filter(pl => (pl.status === 'active' || pl.status === 'all_in' || pl.status === 'folded') && pl.chips > 0);
    if (active.length < 2) {
      // Not enough players, end the game
      await supabase.from('rooms').update({ status: 'ended' }).eq('id', roomId);
      return;
    }

    const sorted = active.sort((a, b) => a.seat_index - b.seat_index);
    const currentDealerIdx = sorted.findIndex(pl => pl.seat_index >= r.dealer_seat);
    const nextDealerIdx = currentDealerIdx >= 0 ? (currentDealerIdx + 1) % sorted.length : 0;
    const newDealer = sorted[nextDealerIdx]?.seat_index ?? sorted[0].seat_index;

    // Re-init game
    const init = require('../engine/gameLogic').initializeGame(active, { ...r, dealer_seat: newDealer });
    const { playerUpdates, ...roomUpdate } = init;

    await supabase.from('rooms').update(roomUpdate).eq('id', roomId);
    for (const pu of playerUpdates) {
      const { id, ...fields } = pu as any;
      await supabase.from('players').update(fields).eq('id', id);
    }
  }

  async function handleFold() {
    if (!room || !myPlayer) return;
    const state: GameState = { room, players };
    const { playerUpdate, roomUpdate } = applyFold(state, playerId);

    await Promise.all([
      supabase.from('players').update({ status: playerUpdate.status, has_acted_this_street: true }).eq('id', playerId),
      supabase.from('rooms').update(roomUpdate).eq('id', roomId),
    ]);

    if (isHost) await checkAdvanceStreet();
  }

  async function handleAction(amount: number) {
    if (!room || !myPlayer) return;
    const state: GameState = { room, players };
    const { playerUpdate, roomUpdate } = applyBet(state, playerId, amount);

    const { id: _id, ...pFields } = playerUpdate as any;
    await Promise.all([
      supabase.from('players').update(pFields).eq('id', playerId),
      supabase.from('rooms').update(roomUpdate).eq('id', roomId),
    ]);

    if (isHost) await checkAdvanceStreet();
  }

  async function checkAdvanceStreet() {
    // Re-fetch to get latest state
    const [{ data: latestRoom }, { data: latestPlayers }] = await Promise.all([
      supabase.from('rooms').select().eq('id', roomId).single(),
      supabase.from('players').select().eq('room_id', roomId),
    ]);

    if (!latestRoom || !latestPlayers) return;
    const state: GameState = { room: latestRoom as GameRoom, players: latestPlayers as Player[] };

    if (shouldAdvanceStreet(state)) {
      const { roomUpdate, playerUpdates } = advanceStreet(state);
      await supabase.from('rooms').update(roomUpdate).eq('id', roomId);
      for (const pu of playerUpdates) {
        const { id, ...fields } = pu as any;
        await supabase.from('players').update(fields).eq('id', id);
      }
    }
  }

  // Turn timer auto-fold for the current player displayed on this device
  const handleTurnTimeout = useCallback(async (seatIndex: number) => {
    if (!room || !players.length) return;
    const timedOutPlayer = players.find(p => p.seat_index === seatIndex);
    if (!timedOutPlayer) return;

    // Only the host executes the auto-fold to avoid race conditions
    if (!isHost) return;

    const state: GameState = { room, players };
    const { playerUpdate, roomUpdate } = applyFold(state, timedOutPlayer.id);

    await Promise.all([
      supabase.from('players').update({ status: playerUpdate.status, has_acted_this_street: true }).eq('id', timedOutPlayer.id),
      supabase.from('rooms').update(roomUpdate).eq('id', roomId),
    ]);

    await checkAdvanceStreet();
  }, [room, players, isHost]);

  // Leave game handler
  async function handleLeaveGame() {
    if (!room || !myPlayer) return;

    Alert.alert('Leave Game', 'Are you sure you want to leave?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          // If it's my turn, auto-fold first
          if (isMyTurn && myPlayer.status === 'active') {
            const state: GameState = { room, players };
            const { playerUpdate, roomUpdate } = applyFold(state, playerId);
            await Promise.all([
              supabase.from('players').update({ status: 'left', has_acted_this_street: true }).eq('id', playerId),
              supabase.from('rooms').update(roomUpdate).eq('id', roomId),
            ]);
          } else {
            await supabase.from('players').update({ status: 'left' }).eq('id', playerId);
          }

          // Check if only 1 player remains
          const { data: remaining } = await supabase
            .from('players')
            .select()
            .eq('room_id', roomId)
            .in('status', ['active', 'all_in']);

          if (remaining && remaining.length === 1) {
            // Last player wins entire pot
            const lastPlayer = remaining[0];
            await supabase.from('players').update({ chips: lastPlayer.chips + (room?.pot ?? 0) }).eq('id', lastPlayer.id);
            await supabase.from('rooms').update({ current_round: 'showdown', current_player_seat: lastPlayer.seat_index }).eq('id', roomId);
          }

          navigation.replace('Home');
        },
      },
    ]);
  }

  // End game handler (host only)
  async function handleEndGame() {
    if (!room || !isHost) return;

    Alert.alert('End Game', 'End the game for all players? Pot will be distributed equally among active players.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Game',
        style: 'destructive',
        onPress: async () => {
          const activePlayers = players.filter(p => p.status === 'active' || p.status === 'all_in');
          if (activePlayers.length > 0 && room.pot > 0) {
            const share = Math.floor(room.pot / activePlayers.length);
            for (const p of activePlayers) {
              await supabase.from('players').update({ chips: p.chips + share }).eq('id', p.id);
            }
          }
          await supabase.from('rooms').update({ status: 'ended' }).eq('id', roomId);
          navigation.replace('Home');
        },
      },
    ]);
  }

  if (!room || !myPlayer) {
    return <View style={styles.loading}><Text style={styles.loadingText}>Loading...</Text></View>;
  }

  const maxBet = Math.max(...players.map(p => p.current_bet));
  const callAmount = maxBet - myPlayer.current_bet;
  const canCheck = callAmount === 0;

  // Landscape layout: left seats, table center, right seats
  const sorted = [...players].sort((a, b) => a.seat_index - b.seat_index);
  const topSeats = sorted.filter(p => p.seat_index < 2);
  const midRightSeats = sorted.filter(p => p.seat_index === 2);
  const midLeftSeats = sorted.filter(p => p.seat_index === 5);
  const bottomSeats = sorted.filter(p => p.seat_index >= 3 && p.seat_index <= 4);

  return (
    <View style={styles.container}>
      {/* Top bar: Leave + End Game buttons */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.leaveBtn} onPress={handleLeaveGame}>
          <Text style={styles.leaveBtnText}>Leave</Text>
        </TouchableOpacity>
        {isHost && (
          <TouchableOpacity style={styles.endGameBtn} onPress={handleEndGame}>
            <Text style={styles.endGameBtnText}>End Game</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Winner celebration overlay */}
      {showCelebration && (
        <View style={styles.celebrationOverlay}>
          {/* Confetti */}
          {confettiPieces.map((piece, i) => (
            <Animated.Text
              key={i}
              style={[
                styles.confettiEmoji,
                {
                  left: piece.left,
                  opacity: piece.animOpacity,
                  transform: [
                    { translateY: piece.animY },
                    { translateX: piece.animX },
                  ],
                },
              ]}
            >
              {piece.emoji}
            </Animated.Text>
          ))}
          <Animated.View
            style={[
              styles.celebrationCard,
              {
                opacity: celebrationOpacity,
                transform: [{ scale: celebrationScale }],
              },
            ]}
          >
            <Text style={styles.celebrationEmoji}>{'\u{1F3C6}'}</Text>
            <Text style={styles.celebrationText}>{winner}</Text>
          </Animated.View>
        </View>
      )}

      {/* Top seats */}
      <View style={styles.seatRow}>
        {topSeats.map(p => (
          <PlayerSeat
            key={p.id}
            player={p}
            isCurrentTurn={room.current_player_seat === p.seat_index}
            isDealer={room.dealer_seat === p.seat_index}
            showCards={p.id === playerId}
            onTimeout={() => handleTurnTimeout(p.seat_index)}
            turnKey={turnKey}
          />
        ))}
      </View>

      {/* Middle area */}
      <View style={styles.middleRow}>
        <View style={styles.sideSeats}>
          {midLeftSeats.map(p => (
            <PlayerSeat
              key={p.id}
              player={p}
              isCurrentTurn={room.current_player_seat === p.seat_index}
              isDealer={room.dealer_seat === p.seat_index}
              showCards={p.id === playerId}
              onTimeout={() => handleTurnTimeout(p.seat_index)}
              turnKey={turnKey}
            />
          ))}
        </View>

        {/* Table center */}
        <View style={styles.tableCenter}>
          <PotDisplay pot={room.pot} round={room.current_round} />
          <CommunityCards cards={room.community_cards} />
        </View>

        <View style={styles.sideSeats}>
          {midRightSeats.map(p => (
            <PlayerSeat
              key={p.id}
              player={p}
              isCurrentTurn={room.current_player_seat === p.seat_index}
              isDealer={room.dealer_seat === p.seat_index}
              showCards={p.id === playerId}
              onTimeout={() => handleTurnTimeout(p.seat_index)}
              turnKey={turnKey}
            />
          ))}
        </View>
      </View>

      {/* Bottom seats */}
      <View style={styles.seatRow}>
        {bottomSeats.map(p => (
          <PlayerSeat
            key={p.id}
            player={p}
            isCurrentTurn={room.current_player_seat === p.seat_index}
            isDealer={room.dealer_seat === p.seat_index}
            showCards={p.id === playerId}
            onTimeout={() => handleTurnTimeout(p.seat_index)}
            turnKey={turnKey}
          />
        ))}
      </View>

      {/* My hole cards */}
      <View style={styles.myCards}>
        <Text style={styles.myCardsLabel}>Your hand</Text>
        <View style={styles.myCardsRow}>
          {myHoleCards.map((card, i) => {
            const CardComp = require('../components/Card').default;
            return <CardComp key={i} card={card} />;
          })}
        </View>
      </View>

      {/* Action buttons */}
      {isMyTurn && myPlayer.status === 'active' && room.current_round !== 'showdown' && (
        <ActionButtons
          canCheck={canCheck}
          callAmount={callAmount}
          minRaise={room.min_raise}
          myChips={myPlayer.chips}
          onFold={handleFold}
          onCheck={() => handleAction(0)}
          onCall={() => handleAction(callAmount)}
          onRaise={(amount) => handleAction(amount)}
        />
      )}

      {!isMyTurn && myPlayer.status === 'active' && (
        <View style={styles.waitingBar}>
          <Text style={styles.waitingText}>Waiting for other players...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a5c1a' },
  loading: { flex: 1, backgroundColor: '#1a5c1a', alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#fff', fontSize: 18 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  leaveBtn: {
    backgroundColor: 'rgba(192,57,43,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  leaveBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  endGameBtn: {
    backgroundColor: 'rgba(142,68,173,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  endGameBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  seatRow: { flexDirection: 'row', justifyContent: 'space-evenly', paddingHorizontal: 8, paddingVertical: 4 },
  middleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingHorizontal: 8 },
  sideSeats: { width: 100, alignItems: 'center' },
  tableCenter: {
    flex: 1,
    backgroundColor: '#145214',
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderWidth: 4,
    borderColor: '#0d3b0d',
    minHeight: 140,
  },
  myCards: { alignItems: 'center', paddingVertical: 6, backgroundColor: '#0d3b0d' },
  myCardsLabel: { color: '#aaa', fontSize: 11, marginBottom: 2 },
  myCardsRow: { flexDirection: 'row' },
  waitingBar: { backgroundColor: '#0d2b0d', padding: 10, alignItems: 'center' },
  waitingText: { color: '#888', fontSize: 14 },
  // Celebration overlay
  celebrationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebrationCard: {
    backgroundColor: '#1e4620',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#f39c12',
  },
  celebrationEmoji: { fontSize: 48, marginBottom: 12 },
  celebrationText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    maxWidth: 300,
  },
  confettiEmoji: {
    position: 'absolute',
    fontSize: 24,
    top: 0,
  },
});
