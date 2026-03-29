import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  pot: number;
  round: string;
}

export default function PotDisplay({ pot, round }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.round}>{round.toUpperCase()}</Text>
      <Text style={styles.pot}>Pot: ${pot}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', marginVertical: 8 },
  round: { color: '#aaa', fontSize: 11, letterSpacing: 1 },
  pot: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
