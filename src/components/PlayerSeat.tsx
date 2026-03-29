import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Player } from '../engine/gameLogic';
import Card from './Card';

interface Props {
  player: Player;
  isCurrentTurn: boolean;
  isDealer: boolean;
  showCards: boolean;
}

export default function PlayerSeat({ player, isCurrentTurn, isDealer, showCards }: Props) {
  const isFolded = player.status === 'folded' || player.status === 'out';

  return (
    <View style={[styles.seat, isCurrentTurn && styles.activeSeat, isFolded && styles.foldedSeat]}>
      {isDealer && <View style={styles.dealerBadge}><Text style={styles.dealerText}>D</Text></View>}
      <Text style={styles.nickname} numberOfLines={1}>{player.nickname}</Text>
      <Text style={styles.chips}>${player.chips}</Text>
      {player.current_bet > 0 && (
        <Text style={styles.bet}>Bet: ${player.current_bet}</Text>
      )}
      <View style={styles.cards}>
        {showCards && player.hole_cards?.length === 2 ? (
          <>
            <Card card={player.hole_cards[0]} small />
            <Card card={player.hole_cards[1]} small />
          </>
        ) : player.status !== 'waiting' ? (
          <>
            <Card faceDown small />
            <Card faceDown small />
          </>
        ) : null}
      </View>
      {player.status === 'folded' && <Text style={styles.statusLabel}>FOLD</Text>}
      {player.status === 'all_in' && <Text style={[styles.statusLabel, styles.allIn]}>ALL IN</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  seat: {
    width: 90,
    alignItems: 'center',
    backgroundColor: '#1e4620',
    borderRadius: 8,
    padding: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  activeSeat: { borderColor: '#ffdd00' },
  foldedSeat: { opacity: 0.4 },
  dealerBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealerText: { fontSize: 10, fontWeight: 'bold', color: '#000' },
  nickname: { color: '#fff', fontWeight: 'bold', fontSize: 11, maxWidth: 80 },
  chips: { color: '#4caf50', fontSize: 11 },
  bet: { color: '#ffdd00', fontSize: 10 },
  cards: { flexDirection: 'row', marginTop: 4 },
  statusLabel: { color: '#ff5555', fontSize: 9, fontWeight: 'bold', marginTop: 2 },
  allIn: { color: '#ff9900' },
});
