import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';

export type SheetAction = {
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

/** In-app replacement for the OS option box: same bottom-sheet language as
 *  the rest of the app. Native dialogs stay only where the OS requires them
 *  (permissions). */
export function ActionSheet({
  visible, onClose, title, subtitle, actions, cancelLabel = 'Close',
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  actions: SheetAction[];
  cancelLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: 16 + insets.bottom }]} onPress={() => undefined}>
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
          <View style={s.group}>
            {actions.map((a) => (
              <Pressable
                key={a.label}
                onPress={() => { onClose(); a.onPress(); }}
                style={({ pressed }) => [s.item, pressed && s.itemPressed]}
              >
                <Text style={[s.itemText, a.destructive && { color: C.bad }]}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [s.item, s.cancel, pressed && s.itemPressed]}
          >
            <Text style={s.cancelText}>{cancelLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  title: { color: C.text, fontSize: 18, fontWeight: '700' },
  subtitle: { color: C.dim, fontSize: 14, marginTop: -6 },
  group: { borderRadius: 14, backgroundColor: C.cardRaised, overflow: 'hidden' },
  item: { paddingVertical: 15, paddingHorizontal: 16 },
  itemPressed: { backgroundColor: C.border },
  itemText: { color: C.text, fontSize: 16 },
  cancel: { alignItems: 'center', borderRadius: 14, backgroundColor: C.cardRaised },
  cancelText: { color: C.dim, fontSize: 15, fontWeight: '600' },
});
