import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase';
import {
  Player,
  GameRoom,
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

export default function GameScreen({ route, navigation }: any) {
  const { roomId, playerId, sessionToken } = route.params;
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myHoleCards, setMyHoleCards] = useState<any[]>([]);
  const [winner, setWinner] = useState<string | null>(null);

  const myPlayer = players.find(p => p.id === playerId);
  const isMyTurn = room?.current_player_seat === myPlayer?.seat_index;
  const isHost = myPlayer?.is_host;

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
      supabase.from('players').select('id,nickname,seat_index,chips,current_bet,total_bet_this_round,status,is_host,session_token').eq('room_id', roomId),
      supabase.from('players').select('hole_cards').eq('id', playerId).single(),
    ]);

    if (roomData) setRoom(roomData as GameRoom);
    if (playersData) setPlayers(playersData as Player[]);
    if (myData?.hole_cards) setMyHoleCards(myData.hole_cards);

    // Handle showdown
    if (roomData?.current_round === 'showdown' && playersData) {
      handleShowdown(roomData as GameRoom, playersData as Player[]);
    }
  }

  async function handleShowdown(r: GameRoom, p: Player[]) {
    if (!isHost) return;

    // Fetch hole cards for all active players
    const active = p.filter(pl => pl.status === 'active' || pl.status === 'all_in');
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

    setWinner(`${winnerNames} wins with ${handLabel}!`);

    // Award pot
    for (const wid of winnerIds) {
      const winner = p.find(pl => pl.id === wid)!;
      await supabase.from('players').update({ chips: winner.chips + share }).eq('id', wid);
    }

    // Reset for next hand after 3s
    setTimeout(() => resetForNextHand(r, p), 3000);
  }

  async function resetForNextHand(r: GameRoom, p: Player[]) {
    setWinner(null);
    // Move dealer button
    const active = p.filter(pl => pl.chips > 0).sort((a, b) => a.seat_index - b.seat_index);
    const nextDealerIdx = (active.findIndex(pl => pl.seat_index > r.dealer_seat) + 1) % active.length;
    const newDealer = active[nextDealerIdx]?.seat_index ?? active[0].seat_index;

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
    const state = { room, players };
    const { playerUpdate, roomUpdate } = applyFold(state, playerId);

    await Promise.all([
      supabase.from('players').update({ status: playerUpdate.status }).eq('id', playerId),
      supabase.from('rooms').update(roomUpdate).eq('id', roomId),
    ]);

    if (isHost) await checkAdvanceStreet();
  }

  async function handleAction(amount: number) {
    if (!room || !myPlayer) return;
    const state = { room, players };
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
    const state = { room: latestRoom as GameRoom, players: latestPlayers as Player[] };

    if (shouldAdvanceStreet(state)) {
      const { roomUpdate, playerUpdates } = advanceStreet(state);
      await supabase.from('rooms').update(roomUpdate).eq('id', roomId);
      for (const pu of playerUpdates) {
        const { id, ...fields } = pu as any;
        await supabase.from('players').update(fields).eq('id', id);
      }
    }
  }

  if (!room || !myPlayer) {
    return <View style={styles.loading}><Text style={styles.loadingText}>Loading...</Text></View>;
  }

  const maxBet = Math.max(...players.map(p => p.current_bet));
  const callAmount = maxBet - myPlayer.current_bet;
  const canCheck = callAmount === 0;

  // Layout: top row, middle row, bottom row of seats
  const sorted = [...players].sort((a, b) => a.seat_index - b.seat_index);
  const topSeats = sorted.filter(p => p.seat_index < 2);
  const midRightSeats = sorted.filter(p => p.seat_index === 2);
  const midLeftSeats = sorted.filter(p => p.seat_index === 5);
  const bottomSeats = sorted.filter(p => p.seat_index >= 3 && p.seat_index <= 4);

  return (
    <View style={styles.container}>
      {/* Winner announcement */}
      {winner && (
        <View style={styles.winnerBanner}>
          <Text style={styles.winnerText}>{winner}</Text>
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
  seatRow: { flexDirection: 'row', justifyContent: 'space-evenly', paddingHorizontal: 8, paddingVertical: 8 },
  middleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  sideSeats: { width: 100, alignItems: 'center' },
  tableCenter: {
    flex: 1,
    backgroundColor: '#145214',
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    borderWidth: 4,
    borderColor: '#0d3b0d',
  },
  myCards: { alignItems: 'center', paddingVertical: 8, backgroundColor: '#0d3b0d' },
  myCardsLabel: { color: '#aaa', fontSize: 11, marginBottom: 4 },
  myCardsRow: { flexDirection: 'row' },
  waitingBar: { backgroundColor: '#0d2b0d', padding: 14, alignItems: 'center' },
  waitingText: { color: '#888', fontSize: 14 },
  winnerBanner: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 10,
    backgroundColor: '#f39c12',
    padding: 12,
    alignItems: 'center',
  },
  winnerText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
});
