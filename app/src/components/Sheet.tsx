import React, { useEffect, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, R, S, T, W } from '../theme';

/** The app's one bottom sheet: dim backdrop, rounded card, title, optional
 *  subtitle, safe-area padding. Every sheet in the app is this — tapping the
 *  backdrop closes it, tapping the card does not. The card rides above the
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
  const [keyboard, setKeyboard] = useState(0);

  useEffect(() => {
    const didShow = Keyboard.addListener('keyboardDidShow', (e) => setKeyboard(e.endCoordinates.height));
    const didHide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => { didShow.remove(); didHide.remove(); };
  }, []);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable
          style={[
            s.sheet,
            { paddingBottom: S.sheetBottom + insets.bottom, marginBottom: keyboard },
            style,
          ]}
          onPress={() => undefined}
        >
          {title ? <Text style={s.title}>{title}</Text> : null}
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
          {scroll ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: S.gapTight }}>
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
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
