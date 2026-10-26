import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { C, R, T, W } from '../theme';
import { useStyles } from './useStyles';
import { angleOf, handAngle, hourAt, joinTime, minuteAt, splitTime } from '../logic/clock';

const SIZE = 224;
const RADIUS = SIZE / 2 - 30;
const HAND = RADIUS - 6;
const KNOB = 26;

const label = (i: number, stage: 'hour' | 'minute'): string =>
  stage === 'hour' ? String(i === 0 ? 12 : i) : String(i * 5).padStart(2, '0');

/** The circular clock — drag or tap the hour, it advances to minutes; the
 *  center dot switches back. "HH:MM" (24h) comes out live, minutes snap to 5. */
export function ClockDial({ time, onChange, below }: {
  time: string;
  onChange: (time: string) => void;
  below?: ReactNode;
}) {
  const styles = useStyles(makeStyles);
  const init = splitTime(time);
  const [h, setH] = useState(init.h);
  const [m, setM] = useState(init.m);
  const [pm, setPm] = useState(init.pm);
  const [stage, setStage] = useState<'hour' | 'minute'>('hour');

  // follow outside changes (presets, edit fill); the stage stays where it is
  useEffect(() => {
    const s = splitTime(time);
    setH(s.h);
    setM(s.m);
    setPm(s.pm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time]);

  const state = useRef({ stage, h, m, pm });
  state.current = { stage, h, m, pm };
  const emit = (nh: number, nm: number, npm: boolean) => onChange(joinTime(nh, nm, npm));

  const track = (e: { nativeEvent: { locationX: number; locationY: number } }) => {
    const { locationX, locationY } = e.nativeEvent;
    if (!Number.isFinite(locationX) || !Number.isFinite(locationY)) return;
    const deg = angleOf(locationX - SIZE / 2, locationY - SIZE / 2);
    const s = state.current;
    if (s.stage === 'hour') {
      const nh = hourAt(deg);
      if (nh !== s.h) { setH(nh); emit(nh, s.m, s.pm); }
    } else {
      const nm = minuteAt(deg);
      if (nm !== s.m) { setM(nm); emit(s.h, nm, s.pm); }
    }
  };

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: track,
    onPanResponderMove: track,
    onPanResponderRelease: () => {
      if (state.current.stage === 'hour') setStage('minute');
    },
  })).current;

  const deg = handAngle(h, m, stage);

  return (
    <View style={styles.row}>
      <View style={styles.dialWrap}>
        <View style={[styles.dial, { width: SIZE, height: SIZE }]} {...pan.panHandlers}>
          {Array.from({ length: 12 }, (_, i) => {
            const rad = (i * 30 - 90) * Math.PI / 180;
            const on = stage === 'hour' ? h === (i === 0 ? 12 : i) : m === i * 5;
            return (
              <View
                key={i}
                pointerEvents="none"
                style={[
                  styles.num,
                  {
                    left: SIZE / 2 + RADIUS * Math.cos(rad) - 15,
                    top: SIZE / 2 + RADIUS * Math.sin(rad) - 15,
                  },
                  on && styles.numOn,
                ]}
              >
                <Text style={[styles.numText, on && styles.numTextOn]}>{label(i, stage)}</Text>
              </View>
            );
          })}
          <View
            pointerEvents="none"
            style={[styles.handLayer, { width: SIZE, height: SIZE }, { transform: [{ rotate: `${deg}deg` }] }]}
          >
            <View style={[styles.hand, { top: SIZE / 2 - HAND, height: HAND }]} />
            <View style={[styles.knob, { top: SIZE / 2 - HAND - KNOB / 2, left: SIZE / 2 - KNOB / 2 }]} />
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={stage === 'hour' ? 'Minutes' : 'Hours'}
          onPress={() => setStage(stage === 'hour' ? 'minute' : 'hour')}
          style={styles.center}
        />
      </View>
      <View style={styles.ampm}>
        {(['AM', 'PM'] as const).map((half) => {
          const on = pm === (half === 'PM');
          return (
            <Pressable
              key={half}
              accessibilityRole="button"
              accessibilityLabel={half}
              accessibilityState={{ selected: on }}
              onPress={() => { setPm(half === 'PM'); emit(h, m, half === 'PM'); }}
              style={[styles.half, on && styles.halfOn]}
            >
              <Text style={[styles.halfText, on && styles.halfTextOn]}>{half}</Text>
            </Pressable>
          );
        })}
        {below}
      </View>
    </View>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
    dialWrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
    dial: {
      borderRadius: SIZE / 2,
      backgroundColor: C.inputBg,
    },
    num: {
      position: 'absolute',
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    numOn: { backgroundColor: C.accentBg },
    numText: { color: C.dim, fontSize: T.meta, fontWeight: W.medium, fontVariant: ['tabular-nums'] },
    numTextOn: { color: C.accent, fontWeight: W.semibold },
    handLayer: { position: 'absolute', left: 0, top: 0 },
    hand: {
      position: 'absolute',
      left: SIZE / 2 - 2,
      width: 4,
      borderRadius: 2,
      backgroundColor: C.accent,
    },
    knob: {
      position: 'absolute',
      width: KNOB,
      height: KNOB,
      borderRadius: KNOB / 2,
      backgroundColor: C.accent,
    },
    center: {
      position: 'absolute',
      left: SIZE / 2 - 11,
      top: SIZE / 2 - 11,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: C.cardRaised,
      borderWidth: 1,
      borderColor: C.border,
    },
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
