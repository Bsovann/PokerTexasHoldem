import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function HomeScreen({ navigation }: any) {
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState('');

  useEffect(() => {
    (async () => {
      let token = await AsyncStorage.getItem('session_token');
      if (!token) {
        token = uuidv4();
        await AsyncStorage.setItem('session_token', token);
      }
      setSessionToken(token);
    })();
  }, []);

  async function createRoom() {
    if (!nickname.trim()) return Alert.alert('Enter a nickname first');
    setLoading(true);
    try {
      const code = generateRoomCode();
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert({ code, status: 'waiting' })
        .select()
        .single();

      if (roomError) throw roomError;

      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({
          room_id: room.id,
          nickname: nickname.trim(),
          seat_index: 0,
          is_host: true,
          session_token: sessionToken,
        })
        .select()
        .single();

      if (playerError) throw playerError;

      navigation.navigate('Lobby', { roomId: room.id, playerId: player.id, sessionToken });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom() {
    if (!nickname.trim()) return Alert.alert('Enter a nickname first');
    if (!roomCode.trim()) return Alert.alert('Enter a room code');
    setLoading(true);
    try {
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select()
        .eq('code', roomCode.trim().toUpperCase())
        .single();

      if (roomError || !room) throw new Error('Room not found');
      if (room.status !== 'waiting') throw new Error('Game already in progress');

      // Find next available seat
      const { data: existingPlayers } = await supabase
        .from('players')
        .select('seat_index')
        .eq('room_id', room.id);

      const takenSeats = new Set(existingPlayers?.map(p => p.seat_index) ?? []);
      let seat = 0;
      while (takenSeats.has(seat) && seat < 6) seat++;
      if (seat >= 6) throw new Error('Room is full');

      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({
          room_id: room.id,
          nickname: nickname.trim(),
          seat_index: seat,
          is_host: false,
          session_token: sessionToken,
        })
        .select()
        .single();

      if (playerError) throw playerError;

      navigation.navigate('Lobby', { roomId: room.id, playerId: player.id, sessionToken });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Texas Hold'em</Text>
      <Text style={styles.subtitle}>Multiplayer Poker</Text>

      <TextInput
        style={styles.input}
        placeholder="Your nickname"
        placeholderTextColor="#888"
        value={nickname}
        onChangeText={setNickname}
        maxLength={20}
      />

      <TouchableOpacity style={[styles.btn, styles.createBtn]} onPress={createRoom} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create Room</Text>}
      </TouchableOpacity>

      <View style={styles.divider}><Text style={styles.dividerText}>— or join —</Text></View>

      <TextInput
        style={[styles.input, styles.codeInput]}
        placeholder="Room code (e.g. ABC123)"
        placeholderTextColor="#888"
        value={roomCode}
        onChangeText={setRoomCode}
        autoCapitalize="characters"
        maxLength={6}
      />

      <TouchableOpacity style={[styles.btn, styles.joinBtn]} onPress={joinRoom} disabled={loading}>
        <Text style={styles.btnText}>Join Room</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d2b0d', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 36, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { color: '#4caf50', fontSize: 14, marginBottom: 40 },
  input: {
    backgroundColor: '#1e4620',
    color: '#fff',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    width: '100%',
    marginBottom: 12,
  },
  codeInput: { letterSpacing: 4, textAlign: 'center' },
  btn: {
    width: '100%',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  createBtn: { backgroundColor: '#27ae60' },
  joinBtn: { backgroundColor: '#2980b9' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  divider: { marginVertical: 12 },
  dividerText: { color: '#555', fontSize: 13 },
});
