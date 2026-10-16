import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from '../theme';
import { Screen } from '../components/Screen';
import { Card, Fab, Overflow, Pill, Row, SectionTitle } from '../components/ui';
import { ChoreModal } from '../components/ChoreModal';
import { useApp } from '../state/AppContext';
import { formatDay, scheduleLabel } from '../logic/human';
import { addDays } from '../logic/rotation';
import type { Chore } from '../types';

export function ChoresScreen() {
  const { chores, events, members, actions } = useApp();
  const [editing, setEditing] = useState<Chore | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? '—';

  const recurring = useMemo(
    () => chores.filter((c) => c.active && (c.repeat_days != null || c.repeat_monthly_day != null) && c.spawned_from == null),
    [chores]
  );
  const upcoming = useMemo(
    () => chores
      .filter((c) => c.active && c.due_at != null && c.spawned_from == null && Date.parse(c.due_at) > Date.now() - 7 * 86400_000)
      .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!)),
    [chores]
  );

  const scheduleLine = (c: Chore) => {
    const parts = [scheduleLabel(c)];
    if (c.rotate) parts.push('rotating');
    else if (c.assignee_member_id) parts.push(memberName(c.assignee_member_id));
    return parts.join(' · ');
  };

  const confirmStop = (c: Chore) =>
    Alert.alert(`Stop "${c.title}"?`, 'It disappears from everyone\'s today list. History stays.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: () => actions.archiveChore(c.id).catch(showErr) },
    ]);

  const choreMenu = (c: Chore) =>
    Alert.alert(c.title, scheduleLine(c), [
      { text: 'Edit', onPress: () => setEditing(c) },
      { text: c.due_at != null ? 'Cancel chore' : 'Stop chore', style: 'destructive', onPress: () => confirmStop(c) },
      { text: 'Close', style: 'cancel' },
    ]);

  const activity = useMemo(() => {
    const since = addDays(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()), -14);
    return events
      .filter((e) => e.on_date >= since && e.on_date <= addDays(since, 15))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 40)
      .map((e) => ({
        ...e,
        chore: chores.find((c) => c.id === e.chore_id),
      }))
      .filter((e) => e.chore);
  }, [events, chores]);

  return (
    <Screen>
      <ScrollView style={s.screen} contentContainerStyle={s.content}>
        <SectionTitle>Recurring</SectionTitle>
        {recurring.map((c) => (
          <Card key={c.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={s.title}>{c.title}</Text>
              {c.strict && <Pill text="alarm" tone="warn" />}
              <Overflow label={`Options for ${c.title}`} onPress={() => choreMenu(c)} />
            </Row>
            <Text style={s.meta}>{scheduleLine(c)}</Text>
          </Card>
        ))}
        {recurring.length === 0 && <Text style={s.meta}>Nothing recurring yet — add chores from the Today tab.</Text>}

        {upcoming.length > 0 && (
          <>
            <SectionTitle>One-offs</SectionTitle>
            {upcoming.map((c) => (
              <Card key={c.id}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={s.title}>{c.title}</Text>
                  <Row style={{ gap: 6 }}>
                    {c.strict && <Pill text="alarm" tone="warn" />}
                    {c.amount != null && <Pill text={`Rs ${c.amount.toLocaleString('en-PK')}`} tone="dim" />}
                    <Overflow label={`Options for ${c.title}`} onPress={() => choreMenu(c)} />
                  </Row>
                </Row>
                <Text style={s.meta}>{scheduleLine(c)}</Text>
              </Card>
            ))}
          </>
        )}

        <SectionTitle>Activity · last 14 days</SectionTitle>
        <Card style={{ gap: 10 }}>
          {activity.length === 0 && <Text style={s.meta}>Nothing finished yet.</Text>}
          {activity.map((e) => (
            <Row key={e.id} style={{ justifyContent: 'space-between' }}>
              <Text style={s.activity}>
                <Text style={{ color: C.text, fontWeight: '600' }}>{memberName(e.done_by ?? e.started_by)}</Text>
                {' '}{e.status === 'skipped' ? 'skipped' : e.status === 'started' ? 'started' : 'did'}{' '}
                {e.chore!.title}
              </Text>
              <Text style={s.date}>{formatDay(e.on_date)}</Text>
            </Row>
          ))}
        </Card>

        <ChoreModal visible={editing != null} editing={editing} onClose={() => setEditing(null)} />
        <ChoreModal visible={addOpen} onClose={() => setAddOpen(false)} />
      </ScrollView>
      <Fab icon="add" label="Add chore" onPress={() => setAddOpen(true)} />
    </Screen>
  );
}

function showErr(e: unknown) {
  Alert.alert('Something broke', e instanceof Error ? e.message : String(e));
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, gap: 16, paddingBottom: 96 },
  title: { color: C.text, fontSize: 16, fontWeight: '600', flex: 1 },
  meta: { color: C.dim, fontSize: 13 },
  activity: { color: C.dim, fontSize: 14, flex: 1 },
  date: { color: C.dim, fontSize: 12, fontVariant: ['tabular-nums'] },
});
