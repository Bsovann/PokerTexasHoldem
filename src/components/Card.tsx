import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card as CardType, cardLabel } from '../engine/deck';

interface Props {
  card?: CardType;
  faceDown?: boolean;
  small?: boolean;
}

export default function Card({ card, faceDown = false, small = false }: Props) {
  const size = small ? styles.small : styles.normal;
  const textSize = small ? styles.textSmall : styles.textNormal;

  if (faceDown || !card) {
    return (
      <View style={[styles.card, size, styles.faceDown]}>
        <Text style={styles.backText}>🂠</Text>
      </View>
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const suitSymbol = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };

  return (
    <View style={[styles.card, size, styles.faceUp]}>
      <Text style={[styles.rank, textSize, isRed ? styles.red : styles.black]}>
        {card.rank}
      </Text>
      <Text style={[styles.suit, textSize, isRed ? styles.red : styles.black]}>
        {suitSymbol[card.suit]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 2,
  },
  normal: { width: 48, height: 68 },
  small: { width: 32, height: 44 },
  faceUp: { backgroundColor: '#fff' },
  faceDown: { backgroundColor: '#1a3a8f' },
  rank: { fontWeight: 'bold' },
  suit: {},
  textNormal: { fontSize: 14 },
  textSmall: { fontSize: 10 },
  red: { color: '#d00' },
  black: { color: '#111' },
  backText: { fontSize: 20, color: '#fff' },
});
