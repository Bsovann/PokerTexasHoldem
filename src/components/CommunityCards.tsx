import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card as CardType } from '../engine/deck';
import Card from './Card';

interface Props {
  cards: CardType[];
}

export default function CommunityCards({ cards }: Props) {
  return (
    <View style={styles.container}>
      {[0, 1, 2, 3, 4].map(i => (
        <Card key={i} card={cards[i]} faceDown={!cards[i]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
