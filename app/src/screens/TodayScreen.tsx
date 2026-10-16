import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';
import { Screen } from '../components/Screen';
import { Btn, Card, Pill, Row, SectionTitle } from '../components/ui';
import { ChoreModal } from '../components/ChoreModal';
import { useApp } from '../state/AppContext';
import { formatRemaining } from '../logic/alarms';
import { assigneeFor, eventFor, occursOn } from '../logic/rotation';
import type { Chore } from '../types';

export function TodayScreen() {
  const app = useApp();
  const { chores, events, members, overrides, swaps, me, today, stale, error, actions } = app;
  const [addOpen, setAddOpen] = useState(false);
  const [swapFor, setSwapFor] = useState<Chore | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? '—';

  const occurrences = useMemo(
    () => chores.filter((c) => c.active && occursOn(c, today)),
    [chores, today]
  );
  const myOpen = useMemo(
    () => occurrences.filter((c) =>
      assigneeFor(c, today, members, overrides)?.id === me?.id && !eventFor(events, c.id, today)),
    [occurrences, members, overrides, me, events, today]
  );
  const othersOpen = useMemo(
    () => occurrences.filter((c) => {
      const a = assigneeFor(c, today, members, overrides);
      return a && a.id !== me?.id && !eventFor(events, c.id, today);
    }),
    [occurrences, members, overrides, me, events, today]
  );
  // open close-chores (spawned by a start) are "happening now" countdowns
  const runningClose = useMemo(
    () => chores.filter((c) => c.active && c.spawned_from != null && !eventFor(events, c.id, today)),
    [chores, events, today]
  );

  const pendingSwaps = useMemo(
    () => swaps.filter((s) => s.status === 'pending' && s.on_date >= today && s.from_member_id !== me?.id),
    [swaps, today, me]
  );

  const doneToday = useMemo(
    () => events.filter((e) => e.on_date === today && e.status !== 'started').length,
    [events, today]
  );

  const onMe = myOpen.length + runningClose.length;

  const guard = (fn: () => Promise<void> | void) => {
    try {
      const r = fn();
      if (r && typeof (r as Promise<void>).catch === 'function') {
        (r as Promise<void>).catch((e) =>
          Alert.alert('Something broke', e instanceof Error ? e.message : String(e)));
      }
    } catch (e) {
      Alert.alert('Something broke', e instanceof Error ? e.message : String(e));
    }
  };

  const byMember = useMemo(() => {
    const groups = new Map<string, Chore[]>();
    for (const c of othersOpen) {
      const a = assigneeFor(c, today, members, overrides)!;
      groups.set(a.name, [...(groups.get(a.name) ?? []), c]);
    }
    return [...groups.entries()];
  }, [othersOpen, members, overrides, today]);

  return (
    <Screen>
      <ScrollView style={s.screen} contentContainerStyle={s.content}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <SectionTitle>Today · {today}</SectionTitle>
          <Btn title="+ Add chore" kind="ghost" onPress={() => setAddOpen(true)} />
        </Row>

        {stale && <Text style={s.stale}>showing saved state — refreshing…</Text>}
        {error && !stale && <Text style={s.stale}>{error}</Text>}

        <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Text style={s.heroLabel}>{onMe === 0 ? 'ALL CLEAR' : onMe === 1 ? '1 THING ON YOU' : `${onMe} THINGS ON YOU`}</Text>
          <Text style={s.heroMeta}>
            {doneToday > 0 ? `${doneToday} finished today · ` : ''}
            {othersOpen.length > 0 ? `${othersOpen.length} on the rest of the house` : 'nothing else pending'}
          </Text>
        </Card>

        {runningClose.map((c) => {
          const at = c.due_at ? Date.parse(c.due_at) : null;
          const remaining = at != null ? at - now : null;
          return (
            <Card key={c.id} style={remaining != null && remaining < 0 ? { borderColor: C.bad } : undefined}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={s.cardTitle}>{c.title}</Text>
                {remaining != null && (
                  <Text style={[s.countdown, { color: remaining > 0 ? C.warn : C.bad }]}>
                    {formatRemaining(remaining)}
                  </Text>
                )}
              </Row>
              <Text style={s.meta}>
                started by {memberName(c.assignee_member_id)}
                {remaining != null && remaining < 0 ? ' · overdue — close it now' : ' until the alarm rings'}
              </Text>
              <Btn
                title="I closed it"
                onPress={() => guard(() => actions.completeChore(c.id, c.due_at ? localDateOfSafe(c.due_at) : today))}
              />
            </Card>
          );
        })}

        {myOpen.map((c) => {
          const overdue = c.due_at != null && Date.parse(c.due_at) < now;
          const isTurn = c.duration_minutes != null;
          return (
            <Card key={c.id} style={overdue ? { borderColor: C.bad } : undefined}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={s.cardTitle}>{c.title}</Text>
                <Row style={{ gap: 6 }}>
                  {c.strict && <Pill text="alarm" tone="warn" />}
                  {overdue && <Pill text="overdue" tone="bad" />}
                </Row>
              </Row>
              {c.note && <Text style={s.meta}>{c.note}</Text>}
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={s.meta}>
                  {c.amount != null ? `Rs ${c.amount.toLocaleString('en-PK')} · ` : ''}
                  {c.due_at != null
                    ? `by ${c.due_at.slice(11, 16)}`
                    : `every ${c.repeat_days ?? '?'}d at ${c.time_of_day.slice(0, 5)}`}
                </Text>
              </Row>
              {isTurn ? (
                <Btn title={`Start — ${c.duration_minutes} min run`} onPress={() => guard(() => actions.startChore(c.id))} />
              ) : (
                <Btn title="Done" onPress={() => guard(() => actions.completeChore(c.id))} />
              )}
              {(c.rotate || c.repeat_days != null) && (
                <Btn title="I can't — ask someone else" kind="ghost" onPress={() => setSwapFor(c)} />
              )}
            </Card>
          );
        })}

        {byMember.length > 0 && (
          <>
            <SectionTitle>Around the house</SectionTitle>
            {byMember.map(([name, list]) => (
              <Card key={name} style={{ gap: 8 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={s.cardTitle}>{name}</Text>
                  <Pill text={`${list.length}`} tone="dim" />
                </Row>
                {list.map((c) => (
                  <Text key={c.id} style={s.meta}>• {c.title}{c.amount != null ? ` (Rs ${c.amount.toLocaleString('en-PK')})` : ''}</Text>
                ))}
              </Card>
            ))}
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
                    <Text style={s.cardTitle}>
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
                    <Text style={s.meta}>Waiting for {memberName(sw.to_member_id)}.</Text>
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
    </Screen>
  );
}

/** Karachi date of an ISO stamp, without pulling config into JSX helpers. */
function localDateOfSafe(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date(iso));
}

function SwapModal({
  chore, onClose, onSubmit,
}: {
  chore: Chore | null;
  onClose: () => void;
  onSubmit: (toMemberId: string | null) => void;
}) {
  const { members, me, swaps, today } = useApp();
  const insets = useSafeAreaInsets();
  if (!chore) return null;
  const alreadyRequested = swaps.some(
    (s) => s.status === 'pending' && s.from_member_id === me?.id && s.chore_id === chore.id && s.on_date === today
  );
  const others = members.filter((m) => m.active && m.id !== me?.id);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={[s.modalSheet, { paddingBottom: 20 + insets.bottom }]}>
          <Text style={s.sheetTitle}>Hand over "{chore.title}"</Text>
          {alreadyRequested ? (
            <Text style={s.meta}>Your request is already out — ask a sibling directly if it's urgent.</Text>
          ) : (
            <>
              <Text style={s.meta}>
                Whoever accepts covers it, and repays you by taking your next turn of this chore.
              </Text>
              <Btn title="Ask anyone in the house" onPress={() => onSubmit(null)} />
              <Text style={s.or}>or pick someone specific:</Text>
              {others.map((m) => (
                <Btn key={m.id} title={`Ask ${m.name}`} kind="ghost" onPress={() => onSubmit(m.id)} />
              ))}
            </>
          )}
          <Btn title="Close" kind="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  heroLabel: { color: C.dim, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  heroMeta: { color: C.text, fontSize: 15, textAlign: 'center', marginTop: 6 },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '600', flex: 1 },
  countdown: { fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] },
  meta: { color: C.dim, fontSize: 13 },
  stale: { color: C.warn, fontSize: 13 },
  or: { color: C.dim, fontSize: 13, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: C.border, padding: 20, gap: 12,
  },
  sheetTitle: { color: C.text, fontSize: 20, fontWeight: '700' },
});
