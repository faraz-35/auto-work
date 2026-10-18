import { useEffect, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { C, T, W } from '../theme';
import { useStyles } from './useStyles';
import { Btn, Chip, IconField, Row, Token } from './ui';
import { Sheet } from './Sheet';
import { WhenEditor, ordinal, type Schedule } from './WhenEditor';
import { ChoreDraft } from '../db/api';
import type { Chore } from '../types';
import { useApp } from '../state/AppContext';
import { localDate } from '../logic/rotation';
import { formatDay, formatTime12 } from '../logic/human';
import { errorMessage } from '../logic/errors';

/** "18:00" -> "6 PM" where minutes are zero — token-sized. */
const compactTime = (t: string) => formatTime12(t).replace(':00 ', ' ');

const karachiDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(d);

/** Wall-clock "HH:MM" in the household's timezone — due_at comes back from
 *  the server in UTC, so slicing the string reads the wrong hour. */
const karachiTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

const freshSchedule = (): Schedule => {
  const today = localDate();
  return {
    kind: 'once',
    repeat: 'daily',
    date: today,
    time: '18:00',
    interval: 1,
    weekdays: 1 << new Date(today + 'T00:00:00Z').getUTCDay(),
    monthlyDay: 25,
  };
};

type Props = {
  visible: boolean;
  onClose: () => void;
  editing?: Chore | null;
};

/** Create / edit a chore. One input line, one strip of detail tokens, add.
 *  People multi-select (everyone picked gets the chore); the sync toggle
 *  turns the selection into a daily rotation. Once or repeat — daily,
 *  weekly (picked weekdays) or monthly — lives in the WhenEditor. Strict
 *  chores ring a real alarm on the assignee's phone. */
export function ChoreModal({ visible, onClose, editing = null }: Props) {
  const { members, me, actions } = useApp();
  const styles = useStyles(makeStyles);

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [people, setPeople] = useState<string[]>([]);
  const [rotate, setRotate] = useState(true);
  const [strict, setStrict] = useState(false);
  const [schedule, setSchedule] = useState<Schedule>(freshSchedule);
  const [open, setOpen] = useState<'who' | 'when' | 'more' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const s = freshSchedule();
    if (editing) {
      setTitle(editing.title);
      setNote(editing.note ?? '');
      if (editing.rotate) {
        setRotate(true);
        setPeople(editing.rotation_members ?? []);
      } else {
        setRotate(false);
        setPeople(editing.assignee_member_id ? [editing.assignee_member_id] : []);
      }
      if (editing.due_at) {
        s.kind = 'once';
        s.date = karachiDate(new Date(editing.due_at));
        s.time = karachiTime(editing.due_at) || '18:00';
      } else if (editing.repeat_days != null) {
        s.kind = 'repeat'; s.repeat = 'daily'; s.interval = editing.repeat_days;
        s.time = editing.time_of_day.slice(0, 5) || '18:00';
      } else if (editing.repeat_weekdays != null) {
        s.kind = 'repeat'; s.repeat = 'weekly'; s.weekdays = editing.repeat_weekdays;
        s.time = editing.time_of_day.slice(0, 5) || '18:00';
      } else {
        s.kind = 'repeat'; s.repeat = 'monthly';
        s.monthlyDay = editing.repeat_monthly_day ?? 25;
        s.time = editing.time_of_day.slice(0, 5) || '18:00';
      }
      setStrict(editing.strict);
    } else {
      setTitle(''); setNote(''); setRotate(true); setPeople([]);
      setStrict(false);
    }
    setSchedule(s);
    setOpen(null);
  }, [visible, editing]);

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? '?';
  const togglePerson = (id: string) =>
    setPeople((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const toggle = (key: 'who' | 'when' | 'more') => setOpen((cur) => (cur === key ? null : key));

  const whoLabel = () => {
    if (rotate) return people.length === 0 ? 'Everyone' : people.map(nameOf).join(', ');
    if (people.length === 0) return 'Who';
    if (people.length === 1) return nameOf(people[0]);
    return `${nameOf(people[0])} +${people.length - 1}`;
  };

  const whenLabel = () => {
    const at = compactTime(schedule.time);
    if (schedule.kind === 'once') return `${formatDay(schedule.date)} ${at}`;
    if (schedule.repeat === 'daily') {
      return schedule.interval === 1 ? `Daily ${at}` : `Every ${schedule.interval} days ${at}`;
    }
    if (schedule.repeat === 'weekly') return `Weekly ${at}`;
    return `Monthly on the ${ordinal(schedule.monthlyDay)} ${at}`;
  };

  const notePreview = note.trim();

  const submit = async () => {
    try {
      const trimmed = title.trim();
      if (trimmed.length < 1 || trimmed.length > 80) throw new Error('Give the chore a name (1–80 letters).');
      if (!rotate && people.length === 0) throw new Error('Pick a person.');

      const base: ChoreDraft = {
        title: trimmed,
        note: note.trim() || null,
        rotate,
        strict,
        rotationMembers: rotate ? (people.length > 0 ? people : null) : null,
      };
      if (schedule.kind === 'once') {
        base.dueAt = `${schedule.date}T${schedule.time}:00+05:00`;
      } else if (schedule.repeat === 'daily') {
        base.repeatDays = schedule.interval;
        base.timeOfDay = `${schedule.time}:00`;
      } else if (schedule.repeat === 'weekly') {
        if (schedule.weekdays === 0) throw new Error('Pick the days of the week.');
        base.repeatWeekdays = schedule.weekdays;
        base.timeOfDay = `${schedule.time}:00`;
      } else {
        base.repeatMonthlyDay = schedule.monthlyDay;
        base.timeOfDay = `${schedule.time}:00`;
      }

      setBusy(true);
      if (editing) {
        const patch: Partial<Chore> = {
          title: base.title, note: base.note,
          assignee_member_id: rotate ? null : people[0], rotate,
          strict: base.strict,
          due_at: base.dueAt ?? null, repeat_days: base.repeatDays ?? null,
          repeat_weekdays: base.repeatWeekdays ?? null,
          repeat_monthly_day: base.repeatMonthlyDay ?? null,
          time_of_day: base.timeOfDay ?? editing.time_of_day,
          rotation_members: rotate ? (people.length > 0 ? people : null) : null,
        };
        await actions.editChore(editing.id, patch);
        if (!rotate) {
          // everyone picked beyond the first gets their own chore
          for (const id of people.slice(1)) await actions.saveChore({ ...base, assigneeMemberId: id });
        }
      } else {
        const drafts = rotate ? [base] : people.map((id) => ({ ...base, assigneeMemberId: id }));
        for (const d of drafts) await actions.saveChore(d);
      }
      onClose();
    } catch (e) {
      Alert.alert('Chore', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} scroll>
      <TextInput
        style={styles.titleInput}
        value={title}
        onChangeText={setTitle}
        placeholder="What needs doing?"
        placeholderTextColor={C.dim}
        autoFocus
        returnKeyType="done"
      />

      <Row style={{ flexWrap: 'wrap' }}>
        <Token
          icon={rotate ? 'sync-outline' : 'person-outline'}
          label={whoLabel()}
          active={open === 'who'}
          shrink
          onPress={() => toggle('who')}
        />
        <Token icon="calendar-outline" label={whenLabel()} active={open === 'when'} shrink onPress={() => toggle('when')} />
        <Token
          icon={strict ? 'notifications' : 'notifications-off-outline'}
          active={strict}
          tone="warn"
          accessibilityLabel={strict ? 'Alarm rings at the deadline — tap to turn off' : 'No alarm — tap to ring one at the deadline'}
          onPress={() => setStrict(!strict)}
        />
      </Row>
      <View style={{ alignSelf: 'flex-start' }}>
        <Token
          icon="ellipsis-horizontal"
          chevron
          label={open === 'more' ? 'Less' : notePreview !== '' ? notePreview : 'Note'}
          active={open === 'more'}
          accessibilityLabel={open === 'more' ? 'Hide the note field' : 'Show the note field'}
          onPress={() => toggle('more')}
        />
      </View>

      {open === 'who' && (
        <Row style={{ flexWrap: 'wrap' }}>
          {members.filter((m) => m.active).map((m) => (
            <Chip
              key={m.id}
              active={people.includes(m.id)}
              label={m.id === me?.id ? `${m.name} (you)` : m.name}
              onPress={() => togglePerson(m.id)}
            />
          ))}
          <Token
            icon={rotate ? 'sync' : 'sync-outline'}
            active={rotate}
            accessibilityLabel={rotate ? 'Rotates daily between the selected people — tap to keep everyone selected' : 'Tap to rotate daily between the selected people'}
            onPress={() => setRotate(!rotate)}
          />
        </Row>
      )}

      {open === 'when' && <WhenEditor value={schedule} onChange={setSchedule} />}

      {open === 'more' && (
        <IconField icon="create-outline" value={note} onChangeText={setNote} placeholder="Note" />
      )}

      <Btn title={editing ? 'Save changes' : 'Add chore'} onPress={submit} loading={busy} />
    </Sheet>
  );
}

const makeStyles = () => StyleSheet.create({
  titleInput: {
    color: C.text,
    fontSize: T.heading,
    fontWeight: W.semibold,
    paddingVertical: 6,
  },
});
