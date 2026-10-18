import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { C, S, T, W } from '../theme';
import { useStyles } from '../components/useStyles';
import { Screen } from '../components/Screen';
import { Card, Meter, Row, SectionTitle, roles } from '../components/ui';
import { useApp } from '../state/AppContext';
import { houseStats } from '../logic/stats';
import { formatShortDate, formatTimeOf } from '../logic/human';

export function TodayScreen() {
  const { chores, events, members, overrides, memberName, me, today, stale, error } = useApp();
  const styles = useStyles(makeStyles);

  const stats = useMemo(
    () => houseStats({ chores, events, members, overrides, from: today, to: today }),
    [chores, events, members, overrides, today]
  );

  const verb = (status: string) => (status === 'done' ? 'did' : status === 'skipped' ? 'skipped' : 'started');
  const choreTitle = (id: string) => chores.find((c) => c.id === id)?.title ?? 'a chore';

  return (
    <Screen>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <SectionTitle>{`Whole house · ${formatShortDate(today)}`}</SectionTitle>

        {stale && <Text style={styles.stale}>showing saved state — refreshing…</Text>}
        {error && !stale && <Text style={styles.stale}>{error}</Text>}

        <Card style={{ paddingVertical: 20 }}>
          <Text style={[styles.heroState, { color: stats.left === 0 && stats.done > 0 ? C.good : C.text }]}>
            {stats.done === 0 && stats.left === 0
              ? 'Nothing due today'
              : stats.left === 0
                ? `${stats.done} done · all done`
                : `${stats.done} done · ${stats.left} left`}
          </Text>
          {stats.skipped > 0 && <Text style={styles.heroMeta}>{stats.skipped} skipped</Text>}
        </Card>

        <SectionTitle>Everyone</SectionTitle>
        <Card style={{ gap: 12 }}>
          {stats.byMember.map((sc) => (
            <Row key={sc.member.id}>
              <Text style={styles.memberName}>
                {sc.member.name}{sc.member.id === me?.id ? ' · you' : ''}
              </Text>
              <Meter value={sc.done} total={sc.assigned} good={sc.assigned > 0 && sc.done === sc.assigned} />
              <Text style={[styles.score, sc.assigned === 0 && { color: C.dim }]}>
                {sc.assigned > 0 ? `${sc.done}/${sc.assigned}` : '—'}
              </Text>
            </Row>
          ))}
        </Card>

        <SectionTitle>Who did what</SectionTitle>
        <Card style={{ gap: 10 }}>
          {stats.feed.length === 0 && <Text style={roles().meta}>Nothing yet today.</Text>}
          {stats.feed.map((e) => (
            <Row key={e.id} style={{ justifyContent: 'space-between' }}>
              <Text style={styles.feedText}>
                <Text style={{ color: C.text, fontWeight: W.semibold }}>{memberName(e.by)}</Text>
                {' '}{verb(e.status)}{' '}{choreTitle(e.choreId)}
              </Text>
              <Text style={styles.feedTime}>{e.at ? formatTimeOf(e.at) : ''}</Text>
            </Row>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: S.screen, gap: S.gap, paddingBottom: 32 },
  heroState: { fontSize: T.hero, fontWeight: W.bold, letterSpacing: -0.3 },
  heroMeta: { color: C.dim, fontSize: T.body, marginTop: 4 },
  memberName: { color: C.text, fontSize: T.body, fontWeight: W.medium, width: 96 },
  score: { color: C.text, fontSize: T.body, fontWeight: W.semibold, fontVariant: ['tabular-nums'], minWidth: 36, textAlign: 'right' },
  feedText: { color: C.dim, fontSize: T.body, flex: 1 },
  feedTime: { color: C.dim, fontSize: T.tiny, fontVariant: ['tabular-nums'] },
  stale: { color: C.warn, fontSize: T.meta },
});
