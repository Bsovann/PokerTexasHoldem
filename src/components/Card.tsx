import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Card as CardType } from '../engine/deck';

interface Props {
  card?: CardType;
  faceDown?: boolean;
  small?: boolean;
}

export default function CardComponent({ card, faceDown = false, small = false }: Props) {
  const flipAnim = useRef(new Animated.Value(faceDown || !card ? 0 : 1)).current;
  const prevFaceDown = useRef(faceDown || !card);

  useEffect(() => {
    const isFaceDown = faceDown || !card;
    if (prevFaceDown.current && !isFaceDown) {
      // Flip from face-down to face-up
      flipAnim.setValue(0);
      Animated.spring(flipAnim, {
        toValue: 1,
        friction: 8,
        tension: 60,
        useNativeDriver: true,
      }).start();
    } else if (!prevFaceDown.current && isFaceDown) {
      flipAnim.setValue(0);
    }
    prevFaceDown.current = isFaceDown;
  }, [faceDown, card]);

  const size = small ? styles.small : styles.normal;
  const textSize = small ? styles.textSmall : styles.textNormal;

  const isFaceDown = faceDown || !card;

  // Interpolate rotation
  const frontRotateY = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['90deg', '90deg', '0deg'],
  });
  const backRotateY = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['0deg', '90deg', '90deg'],
  });
  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });
  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1, 0],
  });

  if (isFaceDown) {
    return (
      <View style={[styles.card, size, styles.faceDown]}>
        <Text style={styles.backText}>{'\u{1F0A0}'}</Text>
      </View>
    );
  }

  const isRed = card!.suit === 'hearts' || card!.suit === 'diamonds';
  const suitSymbol: Record<string, string> = { spades: '\u2660', hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663' };

  return (
    <View style={[size, { position: 'relative' }]}>
      {/* Back face */}
      <Animated.View
        style={[
          styles.card,
          size,
          styles.faceDown,
          { position: 'absolute', backfaceVisibility: 'hidden', opacity: backOpacity, transform: [{ rotateY: backRotateY }] },
        ]}
      >
        <Text style={styles.backText}>{'\u{1F0A0}'}</Text>
      </Animated.View>
      {/* Front face */}
      <Animated.View
        style={[
          styles.card,
          size,
          styles.faceUp,
          { backfaceVisibility: 'hidden', opacity: frontOpacity, transform: [{ rotateY: frontRotateY }] },
        ]}
      >
        <Text style={[styles.rank, textSize, isRed ? styles.red : styles.black]}>
          {card!.rank}
        </Text>
        <Text style={[styles.suit, textSize, isRed ? styles.red : styles.black]}>
          {suitSymbol[card!.suit]}
        </Text>
      </Animated.View>
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
