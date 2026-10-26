import { useEffect, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, R, T, W } from '../theme';
import { useStyles } from './useStyles';

const HOURS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const ITEM = 34;

/** "18:00" -> { h: 6, mIdx, pm: true } */
const split = (time: string) => {
  const [h24, m] = time.split(':').map(Number);
  return { h: h24 % 12 === 0 ? 12 : h24 % 12, mIdx: Math.min(11, Math.floor(m / 5)), pm: h24 >= 12 };
};

/** The two snap wheels and AM/PM — spin them and "HH:MM" (24h) comes back.
 *  The value is live while spinning; no confirm step. */
export function TimeWheels({ time, onChange }: {
  time: string;
  onChange: (time: string) => void;
}) {
  const styles = useStyles(makeStyles);
  const init = split(time);
  const [h, setH] = useState(init.h);
  const [mIdx, setMIdx] = useState(init.mIdx);
  const [pm, setPm] = useState(init.pm);
  const hourRef = useRef<ScrollView>(null);
  const minuteRef = useRef<ScrollView>(null);
  const mounted = useRef(false);  // the follow pass starts after the wheels are centered

  // center both wheels on the value once, after layout settles
  useEffect(() => {
    const s = split(time);
    const scroll = () => {
      hourRef.current?.scrollTo({ y: (s.h - 1) * ITEM, animated: false });
      minuteRef.current?.scrollTo({ y: s.mIdx * ITEM, animated: false });
    };
    scroll();
    const t = setTimeout(scroll, 150);
    mounted.current = true;
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // follow the value when it changes from outside (presets, edit fill) —
  // the wheels' own spins land here too, as no-op scrolls to where they are
  useEffect(() => {
    if (!mounted.current) return;
    const s = split(time);
    setH(s.h);
    setMIdx(s.mIdx);
    setPm(s.pm);
    hourRef.current?.scrollTo({ y: (s.h - 1) * ITEM, animated: true });
    minuteRef.current?.scrollTo({ y: s.mIdx * ITEM, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time]);

  const emit = (hour: number, minute: number, isPm: boolean) => {
    const h24 = isPm ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
    onChange(`${String(h24).padStart(2, '0')}:${MINUTES[minute]}`);
  };

  const spun = (which: 'h' | 'm') => (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const count = which === 'h' ? HOURS.length : MINUTES.length;
    const i = Math.max(0, Math.min(count - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM)));
    if (which === 'h') {
      setH(i + 1);
      emit(i + 1, mIdx, pm);
    } else {
      setMIdx(i);
      emit(h, i, pm);
    }
  };

  const wheel = (
    ref: React.RefObject<ScrollView | null>,
    items: string[],
    active: number,
    onSpin: (e: NativeSyntheticEvent<NativeScrollEvent>) => void,
    onPick: (i: number) => void,
  ) => (
    <View style={styles.wheelWrap}>
      <View style={styles.band} pointerEvents="none" />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM}
        decelerationRate="fast"
        contentContainerStyle={styles.wheelContent}
        onMomentumScrollEnd={onSpin}
      >
        {items.map((label, i) => (
          <Pressable
            key={label}
            accessibilityLabel={label}
            onPress={() => {
              onPick(i);
              ref.current?.scrollTo({ y: i * ITEM, animated: true });
            }}
            style={styles.wheelItem}
          >
            <Text style={[styles.wheelText, i === active && styles.wheelTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.wheels}>
      {wheel(
        hourRef, HOURS, h, spun('h'),
        (i) => { setH(i + 1); emit(i + 1, mIdx, pm); },
      )}
      {wheel(
        minuteRef, MINUTES, mIdx, spun('m'),
        (i) => { setMIdx(i); emit(h, i, pm); },
      )}
      <View style={styles.ampm}>
        {(['AM', 'PM'] as const).map((half) => {
          const on = pm === (half === 'PM');
          return (
            <Pressable
              key={half}
              accessibilityRole="button"
              accessibilityLabel={half}
              accessibilityState={{ selected: on }}
              onPress={() => { setPm(half === 'PM'); emit(h, mIdx, half === 'PM'); }}
              style={[styles.half, on && styles.halfOn]}
            >
              <Text style={[styles.halfText, on && styles.halfTextOn]}>{half}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    wheels: { flexDirection: 'row', gap: 8 },
    wheelWrap: { flex: 1, height: ITEM * 3, borderRadius: R.input, backgroundColor: C.inputBg, overflow: 'hidden' },
    wheelContent: { paddingVertical: ITEM },
    band: {
      position: 'absolute',
      left: 6,
      right: 6,
      top: ITEM,
      height: ITEM,
      borderRadius: R.pill,
      backgroundColor: C.accentBg,
      borderWidth: 1,
      borderColor: C.border,
    },
    wheelItem: { height: ITEM, alignItems: 'center', justifyContent: 'center' },
    wheelText: { color: C.dim, fontSize: T.heading, fontWeight: W.medium, fontVariant: ['tabular-nums'] },
    wheelTextOn: { color: C.accent, fontWeight: W.semibold },
    ampm: { width: 64, gap: 6, justifyContent: 'center' },
    half: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: R.pill,
      backgroundColor: C.cardRaised,
    },
    halfOn: { backgroundColor: C.accentBg, borderWidth: 1, borderColor: C.border },
    halfText: { color: C.dim, fontSize: T.body, fontWeight: W.semibold },
    halfTextOn: { color: C.accent },
  });
