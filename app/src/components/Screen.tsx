import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../theme';
import { useStyles } from './useStyles';

/** Full-screen container that respects the status-bar (notch) inset. */
export function Screen({ children }: { children: React.ReactNode }) {
  const styles = useStyles(makeStyles);
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {children}
    </SafeAreaView>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
  });
