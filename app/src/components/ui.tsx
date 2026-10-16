import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  StyleProp,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, R } from '../theme';

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
  label, value, onChangeText, placeholder, keyboardType = 'default',
}: {
  label: string; value: string; onChangeText: (s: string) => void;
  placeholder?: string; keyboardType?: 'default' | 'number-pad';
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
      />
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.cardRaised,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: 18,
    gap: 10,
  },
  sectionTitle: {
    color: C.dim,
    fontSize: 13,
    fontWeight: '600',
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
  btnLinkText: { fontSize: 14, fontWeight: '500' },
  btnCompact: { paddingVertical: 8, paddingHorizontal: 18, alignSelf: 'flex-end', borderRadius: 999 },
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
  btnText: { fontSize: 15, fontWeight: '600' },
  pill: {
    borderRadius: R.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  label: { color: C.dim, fontSize: 13, fontWeight: '500' },
  input: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    borderWidth: 0,
    borderColor: C.border,
    color: C.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
