import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, T, W } from '../theme';
import { Sheet } from './Sheet';

export type SheetAction = {
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

/** In-app replacement for the OS option box: a grouped action list inside the
 *  shared Sheet. Native dialogs stay only where the OS requires them
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
  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <View style={s.group}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            onPress={() => { onClose(); a.onPress(); }}
            style={({ pressed }) => [s.item, pressed && s.itemPressed]}
          >
            <Text style={[s.itemText, a.destructive && { color: C.bad }]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={({ pressed }) => [s.item, s.cancel, pressed && s.itemPressed]}
      >
        <Text style={s.cancelText}>{cancelLabel}</Text>
      </Pressable>
    </Sheet>
  );
}

const s = StyleSheet.create({
  group: { borderRadius: 14, backgroundColor: C.cardRaised, overflow: 'hidden' },
  item: { paddingVertical: 15, paddingHorizontal: 16 },
  itemPressed: { backgroundColor: C.border },
  itemText: { color: C.text, fontSize: T.body },
  cancel: { alignItems: 'center', borderRadius: 14, backgroundColor: C.cardRaised },
  cancelText: { color: C.dim, fontSize: T.body, fontWeight: W.semibold },
});
