import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, T, W } from '../theme';
import { useStyles } from './useStyles';
import { Sheet } from './Sheet';

export type SheetAction = {
  label: string;
  destructive?: boolean;
  active?: boolean;      // marks the current choice with a check
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
  const styles = useStyles(makeStyles);
  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <View style={styles.group}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            accessibilityState={{ selected: !!a.active }}
            onPress={() => { onClose(); a.onPress(); }}
            style={({ pressed }) => [styles.item, styles.itemRow, pressed && styles.itemPressed]}
          >
            <Text style={[styles.itemText, a.destructive && { color: C.bad }]}>{a.label}</Text>
            {a.active && <Ionicons name="checkmark" size={18} color={C.text} />}
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={({ pressed }) => [styles.item, styles.cancel, pressed && styles.itemPressed]}
      >
        <Text style={styles.cancelText}>{cancelLabel}</Text>
      </Pressable>
    </Sheet>
  );
}

const makeStyles = () => StyleSheet.create({
  group: { borderRadius: 14, backgroundColor: C.cardRaised, overflow: 'hidden' },
  item: { paddingVertical: 15, paddingHorizontal: 16 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemPressed: { backgroundColor: C.border },
  itemText: { color: C.text, fontSize: T.body },
  cancel: { alignItems: 'center', borderRadius: 14, backgroundColor: C.cardRaised },
  cancelText: { color: C.dim, fontSize: T.body, fontWeight: W.semibold },
});
