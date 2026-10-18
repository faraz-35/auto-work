import React, { useEffect, useRef } from 'react';
import { Animated, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, R, S, T, W } from '../theme';
import { useStyles } from './useStyles';

/** The app's one bottom sheet: dim backdrop, rounded card, title, optional
 *  subtitle, safe-area padding. Every sheet in the app is this — tapping the
 *  backdrop closes it, tapping the card does not. The card glides above the
 *  keyboard (edge-to-edge Android ignores adjustResize, so we lift it here). */
export function Sheet({
  visible, onClose, title, subtitle, scroll, style, children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** content scrolls (long forms) instead of stacking */
  scroll?: boolean;
  style?: View['props']['style'];
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const didShow = Keyboard.addListener('keyboardDidShow', (e) =>
      Animated.timing(lift, { toValue: e.endCoordinates.height, duration: 220, useNativeDriver: true }).start());
    const didHide = Keyboard.addListener('keyboardDidHide', () =>
      Animated.timing(lift, { toValue: 0, duration: 200, useNativeDriver: true }).start());
    return () => { didShow.remove(); didHide.remove(); };
  }, [lift]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: S.sheetBottom + insets.bottom },
            { transform: [{ translateY: Animated.multiply(lift, -1) }] },
            style,
          ]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => undefined} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {scroll ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: S.gapTight }}>
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: C.scrim, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: C.card,
      borderTopLeftRadius: R.sheet,
      borderTopRightRadius: R.sheet,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: S.screen,
      paddingTop: S.screen,
      gap: S.gapTight,
      maxHeight: '88%',
    },
    title: { color: C.text, fontSize: T.heading, fontWeight: W.bold },
    subtitle: { color: C.dim, fontSize: T.meta, marginTop: -6 },
  });
