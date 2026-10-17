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

/** Icon (+ optional value text) pill for detail strips — tap to expand or
 *  toggle what it stands for. `tone` colors the active state. */
export function Token({
  icon, label, active, tone = 'accent', onPress, accessibilityLabel, shrink,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label?: string;
  active?: boolean;
  tone?: 'accent' | 'warn';
  onPress: () => void;
  accessibilityLabel?: string;
  shrink?: boolean;
}) {
  const fg = active ? (tone === 'warn' ? C.warn : C.accent) : C.dim;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.token,
        shrink && { flexShrink: 1 },
        active && { borderColor: tone === 'warn' ? C.warn : C.accent, backgroundColor: tone === 'warn' ? C.warnBg : C.accentBg },
        pressed && !active && { backgroundColor: C.card },
      ]}
    >
      <Ionicons name={icon} size={15} color={fg} />
      {label != null && (
        <Text numberOfLines={1} style={[styles.tokenText, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Segmented control — the only way to pick one of a few modes. */
export function Segmented({
  options, index, onChange,
}: {
  options: string[];
  index: number;
  onChange: (i: number) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((opt, i) => (
        <Pressable
          key={opt}
          accessibilityRole="button"
          accessibilityState={{ selected: i === index }}
          onPress={() => onChange(i)}
          style={({ pressed }) => [
            styles.segment,
            i === index && styles.segmentOn,
            pressed && i !== index && { backgroundColor: C.card },
          ]}
        >
          <Text style={[styles.segmentText, i === index && styles.segmentTextOn]}>{opt}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Tap-to-adjust value: [−] value [+]. The owner clamps and formats;
 *  the stepper never lets a step through when canDec/canInc is false. */
export function Stepper({
  value, onDec, onInc, canDec = true, canInc = true,
}: {
  value: string;
  onDec: () => void;
  onInc: () => void;
  canDec?: boolean;
  canInc?: boolean;
}) {
  const dim = { opacity: 0.35 };
  return (
    <View style={styles.stepper}>
      <Pressable accessibilityRole="button" accessibilityLabel="Decrease" hitSlop={8} onPress={onDec} disabled={!canDec} style={({ pressed }) => [styles.stepBtn, !canDec && dim, pressed && { opacity: 0.6 }]}>
        <Ionicons name="remove" size={18} color={C.text} />
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Increase" hitSlop={8} onPress={onInc} disabled={!canInc} style={({ pressed }) => [styles.stepBtn, !canInc && dim, pressed && { opacity: 0.6 }]}>
        <Ionicons name="add" size={18} color={C.text} />
      </Pressable>
    </View>
  );
}

/** Boxed text input with a leading icon and optional unit text — the
 *  labeled Field, collapsed into one line. */
export function IconField({
  icon, prefix, suffix, value, onChangeText, placeholder, keyboardType = 'default', style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  prefix?: string;
  suffix?: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.iconField, style]}>
      <Ionicons name={icon} size={16} color={C.dim} />
      {prefix && <Text style={styles.iconFieldUnit}>{prefix}</Text>}
      <TextInput
        style={styles.iconFieldInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.dim}
        keyboardType={keyboardType}
        autoCapitalize="sentences"
        autoCorrect={false}
      />
      {suffix && <Text style={styles.iconFieldUnit}>{suffix}</Text>}
    </View>
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
  token: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: C.cardRaised,
    paddingLeft: 12,
    paddingRight: 13,
    height: 34,
  },
  tokenText: { fontSize: T.body, flexShrink: 1 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: R.pill,
    padding: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: R.pill,
    alignItems: 'center',
  },
  segmentOn: { backgroundColor: C.accentBg, borderWidth: 1, borderColor: C.border },
  segmentText: { color: C.dim, fontSize: T.body },
  segmentTextOn: { color: C.accent, fontWeight: W.semibold },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: R.pill,
    paddingLeft: 5,
    paddingRight: 5,
    height: 34,
  },
  stepBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.cardRaised, alignItems: 'center', justifyContent: 'center' },
  stepValue: { color: C.text, fontSize: T.body, fontWeight: W.semibold, fontVariant: ['tabular-nums'], minWidth: 64, textAlign: 'center' },
  iconField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: R.input,
    paddingHorizontal: 12,
    height: 42,
  },
  iconFieldUnit: { color: C.dim, fontSize: T.body, fontWeight: W.medium },
  iconFieldInput: { flex: 1, color: C.text, fontSize: T.title, paddingVertical: 10 },
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
