import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

const TURN_DURATION = 30000; // 30 seconds

interface Props {
  isActive: boolean;
  onTimeout: () => void;
  turnKey: string; // changes when turn changes, to reset timer
}

export default function TurnTimer({ isActive, onTimeout, turnKey }: Props) {
  const progress = useRef(new Animated.Value(1)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Reset on every turn change
    if (animRef.current) {
      animRef.current.stop();
      animRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!isActive) {
      progress.setValue(1);
      return;
    }

    progress.setValue(1);
    const anim = Animated.timing(progress, {
      toValue: 0,
      duration: TURN_DURATION,
      useNativeDriver: false,
    });
    animRef.current = anim;
    anim.start();

    timeoutRef.current = setTimeout(() => {
      onTimeout();
    }, TURN_DURATION);

    return () => {
      if (animRef.current) {
        animRef.current.stop();
        animRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [turnKey, isActive]);

  if (!isActive) return null;

  const widthInterp = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const colorInterp = progress.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: ['#e74c3c', '#f39c12', '#2ecc71'],
  });

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.bar,
          {
            width: widthInterp,
            backgroundColor: colorInterp,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  bar: {
    height: '100%',
    borderRadius: 2,
  },
});
