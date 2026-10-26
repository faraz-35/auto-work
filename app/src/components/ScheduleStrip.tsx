import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, T, W } from '../theme';
import { useStyles } from './useStyles';
import { Row, roles } from './ui';
import { DOW_LETTER } from './WhenEditor';
import { localDateOf } from '../logic/rotation';
import { formatDay, formatTimeOf, formatTime12 } from '../logic/human';
import type { Chore } from '../types';

/** The schedule as symbols, not a sentence: what repeats and when it's due.
 *  Once chores show the day; weekly shows the picked weekday letters lit;
 *  everything carries the deadline time. */
export function ScheduleStrip({ chore }: { chore: Chore }) {
  const styles = useStyles(makeStyles);
  const time = chore.due_at != null ? formatTimeOf(chore.due_at) : formatTime12(chore.time_of_day);

  return (
    <Row style={styles.row}>
      {chore.due_at != null ? (
        <Row style={styles.item}>
          <Ionicons name="calendar-outline" size={13} color={C.dim} />
          <Text style={styles.text}>{formatDay(localDateOf(chore.due_at))}</Text>
        </Row>
      ) : (
        <Row style={styles.item}>
          <Ionicons name="repeat" size={13} color={C.dim} />
          {chore.repeat_weekdays != null ? (
            <View style={styles.pips}>
              {DOW_LETTER.map((letter, d) => {
                const on = (chore.repeat_weekdays! & (1 << d)) !== 0;
                return (
                  <View key={d} style={[styles.pip, on && styles.pipOn]}>
                    <Text style={[styles.pipText, on && styles.pipTextOn]}>{letter}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.text}>
              {chore.repeat_days != null
                ? chore.repeat_days === 1 ? 'Every day' : `Every ${chore.repeat_days} days`
                : `On the ${chore.repeat_monthly_day}`}
            </Text>
          )}
        </Row>
      )}
      <Row style={styles.item}>
        <Ionicons name="time-outline" size={13} color={C.dim} />
        <Text style={styles.text}>{time}</Text>
      </Row>
    </Row>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    row: { flexWrap: 'wrap', gap: 12 },
    item: { gap: 5 },
    text: { ...roles().meta },
    pips: { flexDirection: 'row', gap: 3 },
    pip: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    pipOn: { backgroundColor: C.accentBg, borderWidth: 1, borderColor: C.border },
    pipText: { color: C.dim, fontSize: T.tiny, fontWeight: W.semibold },
    pipTextOn: { color: C.accent },
  });
