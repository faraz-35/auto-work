import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { C, S, T, W } from '../theme';
import { useStyles } from '../components/useStyles';
import { Screen } from '../components/Screen';
import { Btn, Card, Fab, Pill, Row, SectionTitle, roles } from '../components/ui';
import { Sheet } from '../components/Sheet';
import { ChoreModal } from '../components/ChoreModal';
import { useApp } from '../state/AppContext';
import { houseStats } from '../logic/stats';
import { formatDay, formatShortDate, formatTime12, formatTimeOf, scheduleLabel } from '../logic/human';
import { assigneeFor, eventFor, localDateOf, nextForMe, occursOn } from '../logic/rotation';
import { errorMessage } from '../logic/errors';
import type { Chore } from '../types';

export function HomeScreen() {
  const app = useApp();
  const { chores, events, members, overrides, swaps, me, today, stale, error, actions } = app;
  const [addOpen, setAddOpen] = useState(false);
  const styles = useStyles(makeStyles);
  const [swapFor, setSwapFor] = useState<Chore | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const memberName = app.memberName;

  const occurrences = useMemo(
    () => chores.filter((c) => c.active && occursOn(c, today)),
    [chores, today]
  );
  const myOpen = useMemo(
    () => occurrences.filter((c) =>
      assigneeFor(c, today, members, overrides)?.id === me?.id && !eventFor(events, c.id, today)),
    [occurrences, members, overrides, me, events, today]
  );

  const house = useMemo(
    () => houseStats({ chores, events, members, overrides, from: today, to: today }),
    [chores, events, members, overrides, today]
  );

  const doneByMe = useMemo(
    () => events
      .filter((e) => e.on_date === today && e.status === 'done' && e.done_by === me?.id)
      .sort((a, b) => Date.parse(b.done_at ?? '') - Date.parse(a.done_at ?? '')),
    [events, today, me]
  );

  const next = useMemo(
    () => (me ? nextForMe(me, chores, members, overrides, today) : null),
    [me, chores, members, overrides, today]
  );

  const pendingSwaps = useMemo(
    () => swaps.filter((s) => s.status === 'pending' && s.on_date >= today && s.from_member_id !== me?.id),
    [swaps, today, me]
  );

  const onMe = myOpen.length;

  const guard = (fn: () => Promise<void> | void) => {
    try {
      const r = fn();
      if (r && typeof (r as Promise<void>).catch === 'function') {
        (r as Promise<void>).catch((e) => Alert.alert('Something broke', errorMessage(e)));
      }
    } catch (e) {
      Alert.alert('Something broke', errorMessage(e));
    }
  };

  return (
    <Screen>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <SectionTitle>{`Your day · ${formatShortDate(today)}`}</SectionTitle>

        {stale && <Text style={styles.stale}>showing saved state — refreshing…</Text>}
        {error && !stale && <Text style={styles.stale}>{error}</Text>}

        <Card style={{ paddingVertical: 20 }}>
          <Text style={[styles.heroState, { color: onMe === 0 ? C.good : C.text }]}>
            {onMe === 0 ? 'All clear' : onMe === 1 ? 'One thing on you' : `${onMe} things on you`}
          </Text>
          <Text style={styles.heroMeta}>
            {doneByMe.length > 0 ? `${doneByMe.length} done by you · ` : ''}
            {house.left > 0 ? `${house.left} left in the house` : 'nothing left in the house'}
          </Text>
        </Card>

        {myOpen.map((c) => {
          const overdue = c.due_at != null && Date.parse(c.due_at) < now;
          return (
            <Card key={c.id}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.cardTitle}>{c.title}</Text>
                <Row style={{ gap: 6 }}>
                  {c.strict && !overdue && <Pill text="alarm" tone="warn" />}
                  {overdue && <Pill text="overdue" tone="bad" />}
                </Row>
              </Row>
              {c.note && <Text style={styles.meta}>{c.note}</Text>}
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={styles.meta}>
                  {scheduleLabel(c)}
                </Text>
              </Row>
              <Btn title="Done" compact onPress={() => guard(() => actions.completeChore(c.id))} />
              {/* parked — swap logic (SwapModal below, requests feed) stays; only this entry point is hidden
              {(c.rotate || c.repeat_days != null) && (
                <Btn title="I can't — ask someone else" kind="link" onPress={() => setSwapFor(c)} />
              )}
              */}
            </Card>
          );
        })}

        {doneByMe.length > 0 && (
          <>
            <SectionTitle>Done today</SectionTitle>
            <Card style={{ gap: 10 }}>
              {doneByMe.map((e) => (
                <Row key={e.id} style={{ justifyContent: 'space-between' }}>
                  <Text style={styles.doneTitle}>{chores.find((c) => c.id === e.chore_id)?.title ?? 'A chore'}</Text>
                  <Text style={styles.doneTime}>{e.done_at ? formatTimeOf(e.done_at) : ''}</Text>
                </Row>
              ))}
            </Card>
          </>
        )}

        {next && (
          <>
            <SectionTitle>Next up</SectionTitle>
            <Card>
              <Text style={styles.cardTitle}>{next.chore.title}</Text>
              <Text style={styles.meta}>
                {next.chore.due_at
                  ? `by ${formatDay(localDateOf(next.chore.due_at))}, ${formatTimeOf(next.chore.due_at)}`
                  : `${formatDay(next.date)} at ${formatTime12(next.chore.time_of_day)}`}
              </Text>
            </Card>
          </>
        )}

        {pendingSwaps.length > 0 && (
          <>
            <SectionTitle>Swap requests</SectionTitle>
            {pendingSwaps.map((sw) => {
              const chore = chores.find((c) => c.id === sw.chore_id);
              return (
                <Card key={sw.id}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={styles.cardTitle}>
                      {memberName(sw.from_member_id)} can't do {chore?.title ?? 'a chore'}
                    </Text>
                    {sw.to_member_id == null
                      ? <Pill text="anyone" tone="dim" />
                      : sw.to_member_id === me?.id ? <Pill text="asks you" tone="warn" /> : null}
                  </Row>
                  {(sw.to_member_id == null || sw.to_member_id === me?.id) && (
                    <Btn title="I'll take it" onPress={() => guard(() => actions.acceptSwap(sw.id))} />
                  )}
                  {sw.to_member_id != null && sw.to_member_id !== me?.id && (
                    <Text style={styles.meta}>Waiting for {memberName(sw.to_member_id)}.</Text>
                  )}
                </Card>
              );
            })}
          </>
        )}

        <ChoreModal visible={addOpen} onClose={() => setAddOpen(false)} />
        <SwapModal
          chore={swapFor}
          onClose={() => setSwapFor(null)}
          onSubmit={(to) => {
            if (swapFor) guard(() => actions.requestSwap(swapFor.id, to));
            setSwapFor(null);
          }}
        />
      </ScrollView>
      <Fab icon="add" label="Add chore" onPress={() => setAddOpen(true)} />
    </Screen>
  );
}

function SwapModal({
  chore, onClose, onSubmit,
}: {
  chore: Chore | null;
  onClose: () => void;
  onSubmit: (toMemberId: string | null) => void;
}) {
  const { members, me, swaps, today } = useApp();
  if (!chore) return null;
  const alreadyRequested = swaps.some(
    (s) => s.status === 'pending' && s.from_member_id === me?.id && s.chore_id === chore.id && s.on_date === today
  );
  const others = members.filter((m) => m.active && m.id !== me?.id);

  return (
    <Sheet visible onClose={onClose} title={`Hand over "${chore.title}"`}>
      {alreadyRequested ? (
        <Text style={roles().meta}>Your request is already out — ask a sibling directly if it's urgent.</Text>
      ) : (
        <>
          <Text style={roles().meta}>
            Whoever accepts covers it, and repays you by taking your next turn of this chore.
          </Text>
          <Btn title="Ask anyone in the house" onPress={() => onSubmit(null)} />
          {others.map((m) => (
            <Btn key={m.id} title={`Ask ${m.name}`} kind="link" onPress={() => onSubmit(m.id)} />
          ))}
        </>
      )}
      <Btn title="Close" kind="link" onPress={onClose} />
    </Sheet>
  );
}

const makeStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: S.screen, gap: S.gap, paddingBottom: 96 },
  heroState: { fontSize: T.hero, fontWeight: W.bold, letterSpacing: -0.3 },
  heroMeta: { color: C.dim, fontSize: T.body, marginTop: 4 },
  cardTitle: { ...roles().title },
  meta: { ...roles().meta },
  doneTitle: { ...roles().item, flex: 1 },
  doneTime: { color: C.dim, fontSize: T.meta, fontVariant: ['tabular-nums'] },
  stale: { color: C.warn, fontSize: T.meta },
});
