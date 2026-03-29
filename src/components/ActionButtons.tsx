import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';

interface Props {
  canCheck: boolean;
  callAmount: number;
  minRaise: number;
  myChips: number;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onRaise: (amount: number) => void;
}

export default function ActionButtons({
  canCheck,
  callAmount,
  minRaise,
  myChips,
  onFold,
  onCheck,
  onCall,
  onRaise,
}: Props) {
  const [raiseAmount, setRaiseAmount] = useState(String(minRaise * 2));

  const handleRaise = () => {
    const amount = parseInt(raiseAmount, 10);
    if (!isNaN(amount) && amount >= minRaise) {
      onRaise(amount);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <TouchableOpacity style={[styles.btn, styles.fold]} onPress={onFold}>
          <Text style={styles.btnText}>Fold</Text>
        </TouchableOpacity>

        {canCheck ? (
          <TouchableOpacity style={[styles.btn, styles.check]} onPress={onCheck}>
            <Text style={styles.btnText}>Check</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.btn, styles.call]} onPress={onCall}>
            <Text style={styles.btnText}>Call ${callAmount}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.raiseRow}>
        <TextInput
          style={styles.raiseInput}
          keyboardType="number-pad"
          value={raiseAmount}
          onChangeText={setRaiseAmount}
        />
        <TouchableOpacity style={[styles.btn, styles.raise]} onPress={handleRaise}>
          <Text style={styles.btnText}>Raise</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.allin]}
          onPress={() => onRaise(myChips)}
        >
          <Text style={styles.btnText}>All In</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, backgroundColor: '#0d2b0d' },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 8 },
  raiseRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, alignItems: 'center' },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  fold: { backgroundColor: '#c0392b' },
  check: { backgroundColor: '#27ae60' },
  call: { backgroundColor: '#2980b9' },
  raise: { backgroundColor: '#8e44ad' },
  allin: { backgroundColor: '#e67e22' },
  raiseInput: {
    backgroundColor: '#fff',
    color: '#000',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: 80,
    fontSize: 14,
    textAlign: 'center',
  },
});
