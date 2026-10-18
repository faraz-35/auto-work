import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { C, S } from '../theme';
import { useStyles } from '../components/useStyles';
import { Screen } from '../components/Screen';
import { ActionSheet } from '../components/ActionSheet';
import { Card, Fab, Overflow, Pill, Row, SectionTitle, roles } from '../components/ui';
import { ChoreModal } from '../components/ChoreModal';
import { useApp } from '../state/AppContext';
import { scheduleLabel } from '../logic/human';
import { assigneeFor } from '../logic/rotation';
import type { Chore } from '../types';

export function ChoresScreen() {
  const { chores, members, overrides, today, memberName, actions } = useApp();
  const [editing, setEditing] = useState<Chore | null>(null);
  const styles = useStyles(makeStyles);
  const [addOpen, setAddOpen] = useState(false);
  const [menuChore, setMenuChore] = useState<Chore | null>(null);
  const [stopChore, setStopChore] = useState<Chore | null>(null);

  const recurring = useMemo(
    () => chores.filter((c) => c.active && (c.repeat_days != null || c.repeat_weekdays != null || c.repeat_monthly_day != null) && c.spawned_from == null),
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
    if (c.rotate) {
      const who = assigneeFor(c, today, members, overrides);
      parts.push(who ? `${who.name} today` : 'rotating');
    } else if (c.assignee_member_id) {
      parts.push(memberName(c.assignee_member_id));
    }
    return parts.join(' · ');
  };

  return (
    <Screen>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <SectionTitle>Recurring</SectionTitle>
        {recurring.map((c) => (
          <Card key={c.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={styles.title}>{c.title}</Text>
              {c.strict && <Pill text="alarm" tone="warn" />}
              <Overflow label={`Options for ${c.title}`} onPress={() => setMenuChore(c)} />
            </Row>
            <Text style={styles.meta}>{scheduleLine(c)}</Text>
          </Card>
        ))}
        {recurring.length === 0 && <Text style={styles.meta}>Nothing recurring yet — add a chore below.</Text>}

        {upcoming.length > 0 && (
          <>
            <SectionTitle>One-offs</SectionTitle>
            {upcoming.map((c) => {
              const overdue = c.due_at != null && Date.parse(c.due_at) < Date.now();
              return (
                <Card key={c.id}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={styles.title}>{c.title}</Text>
                    <Row style={{ gap: 6 }}>
                      {overdue && <Pill text="overdue" tone="bad" />}
                      {!overdue && c.strict && <Pill text="alarm" tone="warn" />}
                      {c.amount != null && <Pill text={`Rs ${c.amount.toLocaleString('en-PK')}`} tone="dim" />}
                      <Overflow label={`Options for ${c.title}`} onPress={() => setMenuChore(c)} />
                    </Row>
                  </Row>
                  <Text style={styles.meta}>{scheduleLine(c)}</Text>
                </Card>
              );
            })}
          </>
        )}

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

const makeStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: S.screen, gap: S.gap, paddingBottom: 96 },
  title: { ...roles().title },
  meta: { ...roles().meta },
});
