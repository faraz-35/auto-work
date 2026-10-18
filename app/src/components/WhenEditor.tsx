import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, R, S, T, W } from '../theme';
import { Stepper } from './ui';
import { addDays, localDate } from '../logic/rotation';
import { formatTime12 } from '../logic/human';

export type Schedule = {
  kind: 'once' | 'repeat';
  repeat: 'daily' | 'weekly' | 'monthly';
  date: string;       // once: the day ("YYYY-MM-DD")
  time: string;       // deadline time "HH:MM", shared by every kind
  interval: number;   // daily: every N days
  weekdays: number;   // weekly: bitmask, bit 0 = Sunday
  monthlyDay: number;
};

/** The ordinal word used by scheduleLabel: "on the 25". */
export const ordinal = (n: number) =>
  `${n}${n === 1 || n === 21 ? 'st' : n === 2 || n === 22 ? 'nd' : n === 3 || n === 23 ? 'rd' : 'th'}`;

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Helping shortcuts — one tap to a human time, fine-tune with the stepper. */
const PRESETS: [keyof typeof Ionicons.glyphMap, string][] = [
  ['sunny-outline', '09:00'],
  ['partly-sunny-outline', '18:00'],
  ['moon-outline', '21:00'],
];

const stepTime = (t: string, dir: number) => {
  const [h, m] = t.split(':').map(Number);
  const total = Math.min(1425, Math.max(0, h * 60 + m + dir * 15));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const dayOf = (dateStr: string) => new Date(dateStr + 'T00:00:00Z').getUTCDay();

/** The whole schedule in one control: once or repeat, the day(s), the time.
 *  Symbols carry the meaning; words only help. */
export function WhenEditor({ value, onChange }: {
  value: Schedule;
  onChange: (s: Schedule) => void;
}) {
  const set = (patch: Partial<Schedule>) => onChange({ ...value, ...patch });
  const stripRef = useRef<ScrollView>(null);
  const today = localDate();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));

  // keep the selected day in view when editing a chore further out
  useEffect(() => {
    const idx = days.indexOf(value.date);
    if (idx > 3) stripRef.current?.scrollTo({ x: (idx - 2) * 54, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.date]);

  const toggleWeekday = (d: number) =>
    set({ weekdays: value.weekdays ^ (1 << d) });

  return (
    <View style={{ gap: S.rowGap }}>
      <View style={s.switch}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: value.kind === 'once' }}
          onPress={() => set({ kind: 'once' })}
          style={({ pressed }) => [s.switchSide, value.kind === 'once' && s.switchOn, pressed && value.kind !== 'once' && s.sidePressed]}
        >
          <Text style={[s.switchIcon, value.kind === 'once' && s.switchIconOn]}>1</Text>
          <Text style={[s.switchText, value.kind === 'once' && s.switchTextOn]}>Once</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: value.kind === 'repeat' }}
          onPress={() => set({ kind: 'repeat' })}
          style={({ pressed }) => [s.switchSide, value.kind === 'repeat' && s.switchOn, pressed && value.kind !== 'repeat' && s.sidePressed]}
        >
          <Ionicons name="repeat" size={15} color={value.kind === 'repeat' ? C.accent : C.dim} />
          <Text style={[s.switchText, value.kind === 'repeat' && s.switchTextOn]}>Repeat</Text>
        </Pressable>
      </View>

      {value.kind === 'once' ? (
        <ScrollView
          ref={stripRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: S.screen }}
        >
          {days.map((d) => {
            const on = d === value.date;
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => set({ date: d })}
                style={[s.dayCell, on && s.cellOn]}
              >
                <Text style={[s.dayDow, on && s.cellTextOn]}>{DOW[dayOf(d)]}</Text>
                <Text style={[s.dayNum, on && s.cellTextOn]}>{Number(d.slice(8, 10))}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <>
          <View style={s.switch}>
            {(['daily', 'weekly', 'monthly'] as const).map((k) => (
              <Pressable
                key={k}
                accessibilityRole="button"
                accessibilityState={{ selected: value.repeat === k }}
                onPress={() => set({ repeat: k })}
                style={({ pressed }) => [s.switchSide, s.kindSide, value.repeat === k && s.switchOn, pressed && value.repeat !== k && s.sidePressed]}
              >
                <Text style={[s.switchText, value.repeat === k && s.switchTextOn]}>{k[0].toUpperCase() + k.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
          {value.repeat === 'daily' && (
            <Stepper
              value={value.interval === 1 ? 'every day' : `every ${value.interval} days`}
              onDec={() => set({ interval: Math.max(1, value.interval - 1) })}
              onInc={() => set({ interval: Math.min(365, value.interval + 1) })}
              canDec={value.interval > 1}
              canInc={value.interval < 365}
            />
          )}
          {value.repeat === 'weekly' && (
            <View style={s.weekRow}>
              {DOW_LETTER.map((letter, d) => {
                const on = (value.weekdays & (1 << d)) !== 0;
                return (
                  <Pressable
                    key={d}
                    accessibilityRole="button"
                    accessibilityLabel={DOW[d]}
                    accessibilityState={{ selected: on }}
                    onPress={() => toggleWeekday(d)}
                    style={[s.dowCell, on && s.cellOn]}
                  >
                    <Text style={[s.dowText, on && s.cellTextOn]}>{letter}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {value.repeat === 'monthly' && (
            <Stepper
              value={`on the ${ordinal(value.monthlyDay)}`}
              onDec={() => set({ monthlyDay: Math.max(1, value.monthlyDay - 1) })}
              onInc={() => set({ monthlyDay: Math.min(28, value.monthlyDay + 1) })}
              canDec={value.monthlyDay > 1}
              canInc={value.monthlyDay < 28}
            />
          )}
        </>
      )}

      <View style={s.timeRow}>
        <Stepper
          value={formatTime12(value.time)}
          onDec={() => set({ time: stepTime(value.time, -15) })}
          onInc={() => set({ time: stepTime(value.time, 15) })}
        />
        <View style={s.presets}>
          {PRESETS.map(([icon, t]) => {
            const on = value.time === t;
            return (
              <Pressable
                key={t}
                accessibilityRole="button"
                accessibilityLabel={`${t === '09:00' ? 'Morning' : t === '18:00' ? 'Evening' : 'Night'}, ${formatTime12(t)}`}
                accessibilityState={{ selected: on }}
                onPress={() => set({ time: t })}
                style={[s.preset, on && s.presetOn]}
              >
                <Ionicons name={icon} size={16} color={on ? C.accent : C.dim} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  switch: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: R.pill,
    padding: 2,
  },
  switchSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 9,
    borderRadius: R.pill,
  },
  kindSide: { paddingVertical: 6 },
  switchOn: { backgroundColor: C.accentBg, borderWidth: 1, borderColor: C.border },
  sidePressed: { backgroundColor: C.card },
  switchIcon: { color: C.dim, fontSize: T.title, fontWeight: W.heavy },
  switchIconOn: { color: C.accent },
  switchText: { color: C.dim, fontSize: T.body },
  switchTextOn: { color: C.accent, fontWeight: W.semibold },
  dayCell: {
    width: 46,
    paddingVertical: 7,
    borderRadius: 14,
    alignItems: 'center',
    gap: 1,
    backgroundColor: C.cardRaised,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayDow: { color: C.dim, fontSize: T.tiny },
  dayNum: { color: C.text, fontSize: T.title, fontWeight: W.semibold, fontVariant: ['tabular-nums'] },
  cellOn: { backgroundColor: C.accent, borderColor: C.accent },
  cellTextOn: { color: C.bg },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dowCell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.cardRaised,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dowText: { color: C.dim, fontSize: T.body, fontWeight: W.semibold },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  presets: { flexDirection: 'row', gap: 6, marginLeft: 'auto' },
  preset: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.cardRaised,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  presetOn: { borderColor: C.accent, backgroundColor: C.accentBg },
});
