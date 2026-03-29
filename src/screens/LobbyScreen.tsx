import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { initializeGame } from '../engine/gameLogic';

export default function LobbyScreen({ route, navigation }: any) {
  const { roomId, playerId, sessionToken } = route.params;
  const [players, setPlayers] = useState<any[]>([]);
  const [room, setRoom] = useState<any>(null);
  const [myPlayer, setMyPlayer] = useState<any>(null);

  useEffect(() => {
    fetchData();

    const sub = supabase
      .channel(`lobby:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, () => fetchData())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
        if (payload.new?.status === 'playing') {
          navigation.replace('Game', { roomId, playerId, sessionToken });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, []);

  async function fetchData() {
    const [{ data: roomData }, { data: playersData }] = await Promise.all([
      supabase.from('rooms').select().eq('id', roomId).single(),
      supabase.from('players').select().eq('room_id', roomId).order('seat_index'),
    ]);
    setRoom(roomData);
    setPlayers(playersData ?? []);
    setMyPlayer(playersData?.find((p: any) => p.id === playerId) ?? null);
  }

  async function startGame() {
    if (players.length < 2) return Alert.alert('Need at least 2 players');
    try {
      const init = initializeGame(players, room);
      const { playerUpdates, ...roomUpdate } = init;

      // Update room
      await supabase.from('rooms').update(roomUpdate).eq('id', roomId);

      // Update each player's hole cards and status
      for (const pu of playerUpdates) {
        const { id, ...fields } = pu as any;
        await supabase.from('players').update(fields).eq('id', id);
      }
    } catch (e: any) {
      Alert.alert('Error starting game', e.message);
    }
  }

  async function shareCode() {
    await Share.share({ message: `Join my poker game! Room code: ${room?.code}` });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Waiting Room</Text>

      {room && (
        <TouchableOpacity style={styles.codeBox} onPress={shareCode}>
          <Text style={styles.codeLabel}>Room Code</Text>
          <Text style={styles.code}>{room.code}</Text>
          <Text style={styles.tapShare}>Tap to share</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionLabel}>Players ({players.length}/6)</Text>

      <FlatList
        data={players}
        keyExtractor={p => p.id}
        style={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.playerRow, item.id === playerId && styles.myRow]}>
            <Text style={styles.seat}>#{item.seat_index + 1}</Text>
            <Text style={styles.playerName}>{item.nickname}</Text>
            {item.is_host && <Text style={styles.hostBadge}>HOST</Text>}
            {item.id === playerId && <Text style={styles.youBadge}>YOU</Text>}
          </View>
        )}
      />

      {myPlayer?.is_host && (
        <TouchableOpacity
          style={[styles.startBtn, players.length < 2 && styles.disabled]}
          onPress={startGame}
          disabled={players.length < 2}
        >
          <Text style={styles.startBtnText}>
            {players.length < 2 ? 'Waiting for players...' : 'Start Game'}
          </Text>
        </TouchableOpacity>
      )}

      {!myPlayer?.is_host && (
        <Text style={styles.waitingText}>Waiting for host to start...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d2b0d', padding: 20 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  codeBox: {
    backgroundColor: '#1e4620',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  codeLabel: { color: '#aaa', fontSize: 12 },
  code: { color: '#fff', fontSize: 36, fontWeight: 'bold', letterSpacing: 8 },
  tapShare: { color: '#4caf50', fontSize: 11, marginTop: 4 },
  sectionLabel: { color: '#aaa', fontSize: 13, marginBottom: 8 },
  list: { flex: 1 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e4620',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  myRow: { borderColor: '#4caf50', borderWidth: 1 },
  seat: { color: '#888', fontSize: 12, width: 24 },
  playerName: { color: '#fff', fontSize: 16, flex: 1 },
  hostBadge: {
    backgroundColor: '#f39c12',
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  youBadge: {
    backgroundColor: '#2980b9',
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  startBtn: {
    backgroundColor: '#27ae60',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  disabled: { backgroundColor: '#555' },
  startBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  waitingText: { color: '#888', textAlign: 'center', marginTop: 12 },
});
