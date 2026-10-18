import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { C, S } from '../theme';
import { useStyles } from '../components/useStyles';
import { Screen } from '../components/Screen';
import { ActionSheet } from '../components/ActionSheet';
import { Card, Fab, Overflow, Pill, Row, SectionTitle, Token, roles } from '../components/ui';
import { ChoreModal } from '../components/ChoreModal';
import { useApp } from '../state/AppContext';
import { scheduleLabel } from '../logic/human';
import { assigneeFor } from '../logic/rotation';
import { DEFAULT_CHORE_FILTERS, filterChores, isRecurring, type ChoreFilters } from '../logic/chores';
import type { Chore } from '../types';

const STATE_LABELS: Record<ChoreFilters['state'], string> = { active: 'Active', stopped: 'Stopped', all: 'All' };
const KIND_LABELS: Record<ChoreFilters['kind'], string> = { all: 'All', recurring: 'Repeats', once: 'One-off' };

export function ChoresScreen() {
  const { chores, members, overrides, today, me, memberName, actions } = useApp();
  const [editing, setEditing] = useState<Chore | null>(null);
  const styles = useStyles(makeStyles);
  const [addOpen, setAddOpen] = useState(false);
  const [menuChore, setMenuChore] = useState<Chore | null>(null);
  const [stopChore, setStopChore] = useState<Chore | null>(null);
  const [filters, setFilters] = useState<ChoreFilters>(DEFAULT_CHORE_FILTERS);
  const [picker, setPicker] = useState<'state' | 'by' | 'for' | 'kind' | null>(null);

  const visible = useMemo(() => filterChores(chores, filters), [chores, filters]);
  const recurring = visible.filter(isRecurring);
  const oneoffs = visible
    .filter((c) => !isRecurring(c) && c.due_at != null && Date.parse(c.due_at) > Date.now() - 7 * 86400_000)
    .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));
  const emptyLine = recurring.length === 0 && oneoffs.length === 0
    ? (chores.length === 0 ? 'No chores yet.' : 'Nothing matches these filters.')
    : null;

  // manage = edit or stop; only the chore's creator gets the menu
  const mine = (c: Chore) => me != null && c.created_by === me.id;

  const scheduleLine = (c: Chore) => {
    const parts = [scheduleLabel(c)];
    if (c.rotate) {
      const who = assigneeFor(c, today, members, overrides);
      parts.push(who ? `${who.name} today` : 'rotating');
    } else if (c.assignee_member_id) {
      parts.push(memberName(c.assignee_member_id));
    }
    if (c.created_by != null) parts.push(`by ${c.created_by === me?.id ? 'me' : memberName(c.created_by)}`);
    return parts.join(' · ');
  };

  const setFilter = <K extends keyof ChoreFilters>(key: K, value: ChoreFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const memberActions = (key: 'createdBy' | 'assignee') => [
    { label: 'Anyone', active: filters[key] == null, onPress: () => setFilter(key, null) },
    ...members.filter((m) => m.active).map((m) => ({
      label: m.name, active: filters[key] === m.id, onPress: () => setFilter(key, m.id),
    })),
  ];

  return (
    <Screen>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Row style={{ flexWrap: 'wrap' }}>
          <Token icon="funnel-outline" label={STATE_LABELS[filters.state]} chevron
            active={filters.state !== 'active'} onPress={() => setPicker('state')} />
          <Token icon="create-outline" label={filters.createdBy ? `By ${memberName(filters.createdBy)}` : 'By anyone'} chevron shrink
            active={filters.createdBy != null} onPress={() => setPicker('by')} />
          <Token icon="person-outline" label={filters.assignee ? `For ${memberName(filters.assignee)}` : 'For anyone'} chevron shrink
            active={filters.assignee != null} onPress={() => setPicker('for')} />
          <Token icon="repeat-outline" label={KIND_LABELS[filters.kind]} chevron
            active={filters.kind !== 'all'} onPress={() => setPicker('kind')} />
        </Row>

        {recurring.length > 0 && (
          <>
            <SectionTitle>Recurring</SectionTitle>
            {recurring.map((c) => (
              <Card key={c.id}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={styles.title}>{c.title}</Text>
                  <Row style={{ gap: 6 }}>
                    {!c.active && <Pill text="stopped" tone="dim" />}
                    {c.active && c.strict && <Pill text="alarm" tone="warn" />}
                    {mine(c) && <Overflow label={`Options for ${c.title}`} onPress={() => setMenuChore(c)} />}
                  </Row>
                </Row>
                <Text style={styles.meta}>{scheduleLine(c)}</Text>
              </Card>
            ))}
          </>
        )}

        {oneoffs.length > 0 && (
          <>
            <SectionTitle>One-offs</SectionTitle>
            {oneoffs.map((c) => {
              const overdue = c.active && c.due_at != null && Date.parse(c.due_at) < Date.now();
              return (
                <Card key={c.id}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={styles.title}>{c.title}</Text>
                    <Row style={{ gap: 6 }}>
                      {!c.active && <Pill text="stopped" tone="dim" />}
                      {overdue && <Pill text="overdue" tone="bad" />}
                      {!overdue && c.active && c.strict && <Pill text="alarm" tone="warn" />}
                      {c.amount != null && <Pill text={`Rs ${c.amount.toLocaleString('en-PK')}`} tone="dim" />}
                      {mine(c) && <Overflow label={`Options for ${c.title}`} onPress={() => setMenuChore(c)} />}
                    </Row>
                  </Row>
                  <Text style={styles.meta}>{scheduleLine(c)}</Text>
                </Card>
              );
            })}
          </>
        )}

        {emptyLine && <Text style={styles.meta}>{emptyLine}</Text>}

        <ChoreModal visible={editing != null} editing={editing} onClose={() => setEditing(null)} />
        <ChoreModal visible={addOpen} onClose={() => setAddOpen(false)} />
        <ActionSheet
          visible={picker === 'state'}
          onClose={() => setPicker(null)}
          title="Active or stopped"
          actions={(Object.keys(STATE_LABELS) as ChoreFilters['state'][]).map((s) => ({
            label: STATE_LABELS[s], active: filters.state === s, onPress: () => setFilter('state', s),
          }))}
        />
        <ActionSheet
          visible={picker === 'by'}
          onClose={() => setPicker(null)}
          title="Made by"
          actions={memberActions('createdBy')}
        />
        <ActionSheet
          visible={picker === 'for'}
          onClose={() => setPicker(null)}
          title="Assigned to"
          actions={memberActions('assignee')}
        />
        <ActionSheet
          visible={picker === 'kind'}
          onClose={() => setPicker(null)}
          title="Repeats or one-off"
          actions={(Object.keys(KIND_LABELS) as ChoreFilters['kind'][]).map((k) => ({
            label: KIND_LABELS[k], active: filters.kind === k, onPress: () => setFilter('kind', k),
          }))}
        />
        <ActionSheet
          visible={menuChore != null}
          onClose={() => setMenuChore(null)}
          title={menuChore?.title ?? ''}
          subtitle={menuChore ? scheduleLine(menuChore) : undefined}
          actions={[
            { label: 'Edit', onPress: () => setEditing(menuChore) },
            ...(menuChore?.active ? [{
              label: menuChore.due_at != null ? 'Cancel chore' : 'Stop chore',
              destructive: true,
              onPress: () => setStopChore(menuChore),
            }] : []),
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
