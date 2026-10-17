import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  StyleProp,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, R, S, T, W } from '../theme';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

type BtnProps = {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'danger' | 'link';
  compact?: boolean;
  loading?: boolean;
  disabled?: boolean;
};

export function Btn({ title, onPress, kind = 'primary', compact, loading, disabled }: BtnProps) {
  const bg = kind === 'primary' ? C.accent : kind === 'danger' ? C.badBg : 'transparent';
  const fg = kind === 'primary' ? C.bg : kind === 'danger' ? C.bad : kind === 'link' ? C.dim : C.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        kind === 'link' && styles.btnLink,
        compact && styles.btnCompact,
        { backgroundColor: bg, borderColor: kind === 'ghost' ? fg : 'transparent', opacity: disabled || loading ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : (
        <Text style={[styles.btnText, kind === 'link' && styles.btnLinkText, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

/** Selectable chip for the sheet forms (who, when, deadline). */
export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && { borderColor: C.accent, backgroundColor: C.accentBg },
        pressed && !active && { backgroundColor: C.card },
      ]}
    >
      <Text style={[styles.chipText, active && { color: C.accent, fontWeight: W.bold }]}>{label}</Text>
    </Pressable>
  );
}

/** Round accent action button (create actions). */
export function Fab({ icon, onPress, label }: { icon: 'add'; onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.fab, { opacity: pressed ? 0.85 : 1 }]}
    >
      <Ionicons name={icon} size={26} color={C.bg} />
    </Pressable>
  );
}

/** Quiet overflow icon (per-card actions). */
export function Overflow({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityLabel={label} hitSlop={12} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name="ellipsis-horizontal" size={20} color={C.dim} />
    </Pressable>
  );
}

export function Pill({ text, tone }: { text: string; tone: 'good' | 'warn' | 'bad' | 'dim' }) {
  const map = { good: [C.good, C.goodBg], warn: [C.warn, C.warnBg], bad: [C.bad, C.badBg], dim: [C.dim, C.cardRaised] };
  const [fg, bg] = map[tone];
  return <View style={[styles.pill, { backgroundColor: bg }]}><Text style={[styles.pillText, { color: fg }]}>{text}</Text></View>;
}

export function Field({
  label, value, onChangeText, placeholder, keyboardType = 'default', autoFocus,
}: {
  label: string; value: string; onChangeText: (s: string) => void;
  placeholder?: string; keyboardType?: 'default' | 'number-pad'; autoFocus?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.dim}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
      />
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>;
}

/** Shared text roles — use these instead of raw fontSize/weight pairs. */
export const roles = {
  tiny: { color: C.dim, fontSize: T.tiny } as TextStyle,
  meta: { color: C.dim, fontSize: T.meta } as TextStyle,
  body: { color: C.dim, fontSize: T.body } as TextStyle,
  item: { color: C.text, fontSize: T.item, fontWeight: W.medium } as TextStyle,
  amount: { color: C.text, fontSize: T.item, fontVariant: ['tabular-nums'] } as TextStyle,
  title: { color: C.text, fontSize: T.title, fontWeight: W.semibold, flex: 1 } as TextStyle,
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.cardRaised,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: S.card,
    gap: S.rowGap,
  },
  sectionTitle: {
    color: C.dim,
    fontSize: T.meta,
    fontWeight: W.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: -4,
  },
  btn: {
    borderRadius: R.btn,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLink: { borderWidth: 0, paddingVertical: 8, alignSelf: 'flex-start' },
  btnLinkText: { fontSize: T.body, fontWeight: W.medium },
  btnCompact: { paddingVertical: 8, paddingHorizontal: 18, alignSelf: 'flex-end', borderRadius: R.pill },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontSize: T.item, fontWeight: W.semibold },
  chip: {
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: C.cardRaised,
  },
  chipText: { color: C.text, fontSize: T.body },
  pill: {
    borderRadius: R.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: T.tiny, fontWeight: W.bold, letterSpacing: 0.3 },
  label: { color: C.dim, fontSize: T.meta, fontWeight: W.medium },
  input: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: R.input,
    borderWidth: 0,
    borderColor: C.border,
    color: C.text,
    fontSize: T.title,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
