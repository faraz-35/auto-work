import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { C, S, T, W } from '../theme';
import { Screen } from '../components/Screen';
import { ActionSheet } from '../components/ActionSheet';
import { Card, Fab, Overflow, Pill, Row, SectionTitle, roles } from '../components/ui';
import { ChoreModal } from '../components/ChoreModal';
import { useApp } from '../state/AppContext';
import { formatDay, scheduleLabel } from '../logic/human';
import { addDays } from '../logic/rotation';
import type { Chore } from '../types';

export function ChoresScreen() {
  const { chores, events, memberName, actions } = useApp();
  const [editing, setEditing] = useState<Chore | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [menuChore, setMenuChore] = useState<Chore | null>(null);
  const [stopChore, setStopChore] = useState<Chore | null>(null);

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
              <Overflow label={`Options for ${c.title}`} onPress={() => setMenuChore(c)} />
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
                    <Overflow label={`Options for ${c.title}`} onPress={() => setMenuChore(c)} />
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
                <Text style={{ color: C.text, fontWeight: W.semibold }}>{memberName(e.done_by ?? e.started_by)}</Text>
                {' '}{e.status === 'skipped' ? 'skipped' : e.status === 'started' ? 'started' : 'did'}{' '}
                {e.chore!.title}
              </Text>
              <Text style={s.date}>{formatDay(e.on_date)}</Text>
            </Row>
          ))}
        </Card>

        <ChoreModal visible={editing != null} editing={editing} onClose={() => setEditing(null)} />
        <ChoreModal visible={addOpen} onClose={() => setAddOpen(false)} />
        <ActionSheet
          visible={menuChore != null}
          onClose={() => setMenuChore(null)}
          title={menuChore?.title ?? ''}
          subtitle={menuChore ? scheduleLine(menuChore) : undefined}
          actions={[
            { label: 'Edit', onPress: () => setEditing(menuChore) },
            {
              label: menuChore?.due_at != null ? 'Cancel chore' : 'Stop chore',
              destructive: true,
              onPress: () => setStopChore(menuChore),
            },
          ]}
        />
        <ActionSheet
          visible={stopChore != null}
          onClose={() => setStopChore(null)}
          title={`Stop "${stopChore?.title ?? ''}"?`}
          subtitle="It disappears from everyone's today list. History stays."
          cancelLabel="Keep"
          actions={[{
            label: 'Stop',
            destructive: true,
            onPress: () => { if (stopChore) actions.archiveChore(stopChore.id).catch(showErr); },
          }]}
        />
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
  content: { padding: S.screen, gap: S.gap, paddingBottom: 96 },
  title: { ...roles.title },
  meta: { ...roles.meta },
  activity: { color: C.dim, fontSize: T.body, flex: 1 },
  date: { color: C.dim, fontSize: T.tiny, fontVariant: ['tabular-nums'] },
});
