import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, S, T, W } from '../theme';
import { Screen } from '../components/Screen';
import { ActionSheet } from '../components/ActionSheet';
import { Card, DayBars, Meter, Row, SectionTitle, Segmented, Stepper, Token, roles } from '../components/ui';
import { Sheet } from '../components/Sheet';
import { useStyles } from '../components/useStyles';
import { useApp } from '../state/AppContext';
import { houseStats, type ChoreState } from '../logic/stats';
import { addDays } from '../logic/rotation';
import { formatDay, formatDayMonth, formatShortDate, formatTimeOf } from '../logic/human';

const RANGES = [7, 30, 90];
const EARLIEST_OFFSET = 91;  // the fetch window keeps 92 days of history

const STATE_LABELS: Record<ChoreState, string> = {
  done: 'Done',
  missed: 'Missed',
  skipped: 'Skipped',
  open: 'Still open',
};

export function AnalyticsScreen() {
  const styles = useStyles(makeStyles);
  const { chores, events, members, overrides, memberName, today } = useApp();
  const [days, setDays] = useState(30);
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [choreId, setChoreId] = useState<string | null>(null);
  const [status, setStatus] = useState<ChoreState | null>(null);
  const [picker, setPicker] = useState<'person' | 'chore' | 'status' | 'days' | null>(null);

  const earliest = addDays(today, -EARLIEST_OFFSET);
  const from = custom ? custom.from : addDays(today, -(days - 1));
  const to = custom ? custom.to : today;

  const stats = useMemo(
    () => houseStats({ chores, events, members, overrides, from, to, memberId: person, choreId, status }),
    [chores, events, members, overrides, from, to, person, choreId, status]
  );

  const pickableChores = chores.filter((c) => c.active && c.spawned_from == null);
  const personLabel = person ? memberName(person) : 'Everyone';
  const choreLabel = choreId ? chores.find((c) => c.id === choreId)?.title ?? 'All chores' : 'All chores';
  const rangeLabel = custom ? `${formatDayMonth(from)} – ${formatDayMonth(to)}` : `${days} days`;

  const count = status == null ? stats.done : status === 'open' ? stats.left : stats[status];
  const bigLine =
    stats.assigned === 0 ? 'Nothing due'
    : status == null ? `${stats.done} of ${stats.assigned} done`
    : `${count} ${STATE_LABELS[status].toLowerCase()}`;
  const bigColor = status === 'missed' ? C.bad : C.text;

  const metaParts: { text: string; color?: string }[] = [];
  if (status == null) {
    if (stats.missed > 0) metaParts.push({ text: `${stats.missed} missed`, color: C.bad });
    if (stats.skipped > 0) metaParts.push({ text: `${stats.skipped} skipped` });
    if (stats.left > 0) metaParts.push({ text: `${stats.left} still open` });
    if (metaParts.length === 0 && stats.assigned > 0) metaParts.push({ text: 'nothing missed' });
  } else if (stats.assigned > 0) {
    metaParts.push({ text: `of ${stats.assigned} assigned` });
  }

  const verb = (s: string) =>
    s === 'done' ? 'did' : s === 'skipped' ? 'skipped' : s === 'started' ? 'started' : s === 'missed' ? 'missed' : "hasn't done";
  const choreTitle = (id: string) => chores.find((c) => c.id === id)?.title ?? 'a chore';

  const stepFrom = (dir: number) =>
    setCustom((c) => {
      if (!c) return c;
      const next = addDays(c.from, dir);
      return next < earliest || next > c.to ? c : { ...c, from: next };
    });
  const stepTo = (dir: number) =>
    setCustom((c) => {
      if (!c) return c;
      const next = addDays(c.to, dir);
      return next < c.from || next > today ? c : { ...c, to: next };
    });

  return (
    <Screen>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <SectionTitle>Analytics</SectionTitle>

        <Row style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <Token icon="person-outline" label={personLabel} chevron active={person != null} onPress={() => setPicker('person')} shrink />
          <Token icon="checkbox-outline" label={choreLabel} chevron active={choreId != null} onPress={() => setPicker('chore')} shrink />
          <Token icon="funnel-outline" label={status ? STATE_LABELS[status] : 'All states'} chevron active={status != null} onPress={() => setPicker('status')} shrink />
          <Token icon="calendar-outline" label={rangeLabel} chevron active={custom != null || days !== 30} onPress={() => setPicker('days')} />
        </Row>

        <Card style={{ paddingVertical: 20 }}>
          <Text style={[styles.heroState, { color: bigColor }]}>{bigLine}</Text>
          {metaParts.length > 0 ? (
            <Text style={styles.heroMeta}>
              {metaParts.map((p, i) => (
                <Text key={i}>
                  {i > 0 ? ' · ' : ''}
                  <Text style={p.color ? { color: p.color } : undefined}>{p.text}</Text>
                </Text>
              ))}
            </Text>
          ) : (
            <Text style={styles.heroMeta}>in this range</Text>
          )}
        </Card>

        <Card style={{ gap: 8 }}>
          <DayBars values={stats.byDay.map((d) => d.done)} />
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={roles().tiny}>{formatShortDate(from)}</Text>
            <Text style={roles().tiny}>{to === today ? 'Today' : formatShortDate(to)}</Text>
          </Row>
        </Card>

        <SectionTitle>{person ? memberName(person) : 'Everyone'}</SectionTitle>
        <Card style={{ gap: 12 }}>
          {stats.byMember.map((sc) => (
            <View key={sc.member.id} style={{ gap: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={styles.memberName}>{sc.member.name}</Text>
                <Text style={[styles.score, sc.assigned === 0 && { color: C.dim }]}>
                  {sc.assigned > 0 ? `${sc.done}/${sc.assigned}` : '—'}
                </Text>
              </Row>
              <Row>
                <Meter value={sc.done} total={sc.assigned} good={sc.assigned > 0 && sc.done === sc.assigned} />
                {sc.missed > 0 && <Text style={styles.missed}>{sc.missed} missed</Text>}
              </Row>
            </View>
          ))}
        </Card>

        <SectionTitle>Who did what</SectionTitle>
        <Card style={{ gap: 10 }}>
          {stats.feed.length === 0 && <Text style={roles().meta}>Nothing in this range.</Text>}
          {stats.feed.slice(0, 60).map((e) => (
            <Row key={e.id} style={{ justifyContent: 'space-between' }}>
              <Text style={styles.feedText}>
                <Text style={{ color: C.text, fontWeight: W.semibold }}>{memberName(e.by)}</Text>
                {' '}{verb(e.status)}{' '}{choreTitle(e.choreId)}
              </Text>
              <Text style={styles.feedTime}>
                {formatDay(e.date)}{e.at ? ` ${formatTimeOf(e.at)}` : ''}
              </Text>
            </Row>
          ))}
        </Card>

        <ActionSheet
          visible={picker === 'person'}
          onClose={() => setPicker(null)}
          title="Whose chores"
          actions={[
            { label: 'Everyone', active: person == null, onPress: () => setPerson(null) },
            ...members.filter((m) => m.active).map((m) => ({ label: m.name, active: person === m.id, onPress: () => setPerson(m.id) })),
          ]}
        />
        <ActionSheet
          visible={picker === 'chore'}
          onClose={() => setPicker(null)}
          title="Which chore"
          actions={[
            { label: 'All chores', active: choreId == null, onPress: () => setChoreId(null) },
            ...pickableChores.map((c) => ({ label: c.title, active: choreId === c.id, onPress: () => setChoreId(c.id) })),
          ]}
        />
        <ActionSheet
          visible={picker === 'status'}
          onClose={() => setPicker(null)}
          title="Which state"
          actions={[
            { label: 'All states', active: status == null, onPress: () => setStatus(null) },
            ...((Object.keys(STATE_LABELS) as ChoreState[]).map((s) => ({
              label: STATE_LABELS[s],
              active: status === s,
              onPress: () => setStatus(s),
            }))),
          ]}
        />
        <Sheet visible={picker === 'days'} onClose={() => setPicker(null)} title="How far back">
          <Segmented
            options={['7 days', '30 days', '90 days', 'Custom']}
            index={custom ? 3 : RANGES.indexOf(days)}
            onChange={(i) => {
              if (i < 3) {
                setCustom(null);
                setDays(RANGES[i]);
                setPicker(null);
              } else {
                setCustom((c) => c ?? { from, to });
              }
            }}
          />
          {custom && (
            <>
              <Row>
                <Text style={styles.rangeLabel}>From</Text>
                <View style={{ flex: 1 }}>
                  <Stepper
                    value={formatDayMonth(custom.from)}
                    onDec={() => stepFrom(-1)}
                    onInc={() => stepFrom(1)}
                    canDec={custom.from > earliest}
                    canInc={custom.from < custom.to}
                  />
                </View>
              </Row>
              <Row>
                <Text style={styles.rangeLabel}>To</Text>
                <View style={{ flex: 1 }}>
                  <Stepper
                    value={formatDayMonth(custom.to)}
                    onDec={() => stepTo(-1)}
                    onInc={() => stepTo(1)}
                    canDec={custom.from < custom.to}
                    canInc={custom.to < today}
                  />
                </View>
              </Row>
            </>
          )}
        </Sheet>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: S.screen, gap: S.gap, paddingBottom: 32 },
    heroState: { color: C.text, fontSize: T.hero, fontWeight: W.bold, letterSpacing: -0.3 },
    heroMeta: { color: C.dim, fontSize: T.body, marginTop: 4 },
    memberName: { color: C.text, fontSize: T.body, fontWeight: W.medium, flex: 1 },
    score: { color: C.text, fontSize: T.body, fontWeight: W.semibold, fontVariant: ['tabular-nums'] },
    missed: { color: C.bad, fontSize: T.tiny, fontWeight: W.medium },
    feedText: { color: C.dim, fontSize: T.body, flex: 1 },
    feedTime: { color: C.dim, fontSize: T.tiny, fontVariant: ['tabular-nums'] },
    rangeLabel: { color: C.dim, fontSize: T.body, width: 48 },
  });
