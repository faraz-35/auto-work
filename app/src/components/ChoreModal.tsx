import { useEffect, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { C, T, W } from '../theme';
import { Btn, Chip, IconField, Row, Segmented, Stepper, Token } from './ui';
import { Sheet } from './Sheet';
import { ChoreDraft } from '../db/api';
import type { Chore } from '../types';
import { useApp } from '../state/AppContext';
import { addDays, localDate } from '../logic/rotation';
import { formatDay, formatTime12 } from '../logic/human';

type Mode = 'once' | 'every' | 'monthly';
const MODES: Mode[] = ['once', 'every', 'monthly'];

/** Common chore times; the stepper covers everything else. */
const TIME_PRESETS: [string, string][] = [['Morning', '09:00'], ['Evening', '18:00'], ['Night', '21:00']];

const stepTime = (t: string, dir: number) => {
  const [h, m] = t.split(':').map(Number);
  const total = Math.min(1425, Math.max(0, h * 60 + m + dir * 15));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** Wall-clock "HH:MM" in the household's timezone — due_at comes back from
 *  the server in UTC, so slicing the string reads the wrong hour. */
const karachiTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

/** The ordinal word used by scheduleLabel: "on the 25". */
const ordinal = (n: number) => `${n}${n === 1 || n === 21 ? 'st' : n === 2 || n === 22 ? 'nd' : n === 3 || n === 23 ? 'rd' : 'th'}`;

/** "6:00 PM" -> "6 PM" where minutes are zero — token-sized. */
const compactTime = (t: string) => formatTime12(t).replace(':00 ', ' ');

type Props = {
  visible: boolean;
  onClose: () => void;
  editing?: Chore | null;
};

/** Create / edit a chore. One input line, one strip of detail tokens, add.
 *  Nothing else shows until a token is tapped — who, when and note/amount/
 *  duration each unfold in place. Strict chores ring a real alarm on the
 *  assignee's phone. */
export function ChoreModal({ visible, onClose, editing = null }: Props) {
  const { members, me, actions } = useApp();

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>('rotate');
  const [mode, setMode] = useState<Mode>('once');
  const [onceDate, setOnceDate] = useState(() => localDate());
  const [time, setTime] = useState('18:00');
  const [everyDays, setEveryDays] = useState(1);
  const [monthlyDay, setMonthlyDay] = useState(25);
  const [strict, setStrict] = useState(false);
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('');
  const [open, setOpen] = useState<'who' | 'when' | 'more' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
    if (editing) {
      setTitle(editing.title);
      setNote(editing.note ?? '');
      setAssigneeId(editing.rotate ? 'rotate' : editing.assignee_member_id ?? '');
      setMode(editing.due_at != null ? 'once' : editing.repeat_days != null ? 'every' : 'monthly');
      if (editing.due_at) {
        setOnceDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date(editing.due_at)));
        setTime(karachiTime(editing.due_at) || '18:00');
      } else {
        setTime(editing.time_of_day.slice(0, 5) || '18:00');
      }
      setEveryDays(editing.repeat_days ?? 1);
      setMonthlyDay(editing.repeat_monthly_day ?? 25);
      setStrict(editing.strict);
      setAmount(editing.amount != null ? String(editing.amount) : '');
      setDuration(editing.duration_minutes != null ? String(editing.duration_minutes) : '');
    } else {
      setTitle(''); setNote(''); setAssigneeId('rotate'); setMode('once');
      setOnceDate(today); setTime('18:00');
      setEveryDays(1); setMonthlyDay(25);
      setStrict(false); setAmount(''); setDuration('');
    }
    setOpen(null);
  }, [visible, editing]);

  const whoLabel = () => {
    if (assigneeId === 'rotate') return 'Rotate';
    const m = members.find((x) => x.id === assigneeId);
    return m ? (m.id === me?.id ? `${m.name} (you)` : m.name) : 'Rotate';
  };

  const whenLabel = () => {
    const at = compactTime(time);
    if (mode === 'once') return `${formatDay(onceDate)} ${at}`;
    if (mode === 'every') return everyDays === 1 ? `Daily ${at}` : `Every ${everyDays} days ${at}`;
    return `Monthly on the ${ordinal(monthlyDay)} ${at}`;
  };

  const moreParts = [note.trim(), amount.trim() !== '' ? `Rs ${Number(amount)}` : '', duration.trim() !== '' ? `${duration} min` : ''].filter(Boolean);
  const toggle = (key: 'who' | 'when' | 'more') => setOpen((cur) => (cur === key ? null : key));

  const submit = async () => {
    try {
      const trimmed = title.trim();
      if (trimmed.length < 1 || trimmed.length > 80) throw new Error('Give the chore a name (1–80 letters).');
      const rotate = assigneeId === 'rotate';
      if (!rotate && !assigneeId) throw new Error('Pick a person, or choose Rotating.');
      const amountN = amount.trim() === '' ? null : Number(amount);
      if (amountN != null && !(amountN > 0)) throw new Error('Amount must be more than 0.');
      const durationN = duration.trim() === '' ? null : Number(duration);
      if (durationN != null && !(durationN >= 1 && durationN <= 120)) throw new Error('Duration must be 1–120 minutes.');

      const draft: ChoreDraft = {
        title: trimmed,
        note: note.trim() || null,
        assigneeMemberId: rotate ? null : assigneeId,
        rotate,
        strict,
        amount: amountN,
        durationMinutes: durationN,
      };
      if (mode === 'once') {
        draft.dueAt = `${onceDate}T${time}:00+05:00`;
      } else if (mode === 'every') {
        draft.repeatDays = everyDays;
        draft.timeOfDay = `${time}:00`;
      } else {
        draft.repeatMonthlyDay = monthlyDay;
        draft.timeOfDay = `${time}:00`;
      }

      setBusy(true);
      if (editing) {
        await actions.editChore(editing.id, {
          title: draft.title, note: draft.note,
          assignee_member_id: draft.assigneeMemberId, rotate: draft.rotate,
          strict: draft.strict, amount: draft.amount, duration_minutes: draft.durationMinutes,
          due_at: draft.dueAt ?? null, repeat_days: draft.repeatDays ?? null,
          repeat_monthly_day: draft.repeatMonthlyDay ?? null,
          time_of_day: draft.timeOfDay ?? editing.time_of_day,
        });
      } else {
        await actions.saveChore(draft);
      }
      onClose();
    } catch (e) {
      Alert.alert('Chore', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const today = localDate();

  return (
    <Sheet visible={visible} onClose={onClose} title={editing ? 'Edit chore' : 'New chore'} scroll>
      <TextInput
        style={s.titleInput}
        value={title}
        onChangeText={setTitle}
        placeholder="What needs doing?"
        placeholderTextColor={C.dim}
        autoFocus
        returnKeyType="done"
      />

      <Row style={{ flexWrap: 'wrap' }}>
        <Token icon="person-outline" label={whoLabel()} active={open === 'who'} shrink onPress={() => toggle('who')} />
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
          label={open === 'more' ? 'Less' : moreParts.length > 0 ? moreParts.join(' · ') : 'More'}
          active={open === 'more'}
          accessibilityLabel={open === 'more' ? 'Hide the note, amount and duration fields' : 'Show the note, amount and duration fields'}
          onPress={() => toggle('more')}
        />
      </View>

      {open === 'who' && (
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip active={assigneeId === 'rotate'} label="Rotating" onPress={() => { setAssigneeId('rotate'); setOpen(null); }} />
          {members.filter((m) => m.active).map((m) => (
            <Chip
              key={m.id}
              active={assigneeId === m.id}
              label={m.id === me?.id ? `${m.name} (you)` : m.name}
              onPress={() => { setAssigneeId(m.id); setOpen(null); }}
            />
          ))}
        </Row>
      )}

      {open === 'when' && (
        <>
          <Segmented options={['Once', 'Every', 'Monthly']} index={MODES.indexOf(mode)} onChange={(i) => setMode(MODES[i])} />
          {mode === 'once' && (
            <Row style={{ flexWrap: 'wrap' }}>
              <Chip active={onceDate === today} label="Today" onPress={() => setOnceDate(today)} />
              <Chip active={onceDate === addDays(today, 1)} label="Tomorrow" onPress={() => setOnceDate(addDays(today, 1))} />
            </Row>
          )}
          <Row>
            {mode === 'once' && (
              <Stepper
                value={formatDay(onceDate)}
                onDec={() => setOnceDate(addDays(onceDate, -1))}
                onInc={() => setOnceDate(addDays(onceDate, 1))}
                canDec={onceDate > today}
              />
            )}
            {mode === 'every' && (
              <Stepper
                value={everyDays === 1 ? 'every day' : `every ${everyDays} days`}
                onDec={() => setEveryDays(Math.max(1, everyDays - 1))}
                onInc={() => setEveryDays(Math.min(365, everyDays + 1))}
                canDec={everyDays > 1}
                canInc={everyDays < 365}
              />
            )}
            {mode === 'monthly' && (
              <Stepper
                value={`on the ${ordinal(monthlyDay)}`}
                onDec={() => setMonthlyDay(Math.max(1, monthlyDay - 1))}
                onInc={() => setMonthlyDay(Math.min(28, monthlyDay + 1))}
                canDec={monthlyDay > 1}
                canInc={monthlyDay < 28}
              />
            )}
            <Stepper value={formatTime12(time)} onDec={() => setTime(stepTime(time, -15))} onInc={() => setTime(stepTime(time, 15))} />
          </Row>
          <Row>
            {TIME_PRESETS.map(([label, t]) => (
              <Chip key={label} label={label} active={time === t} onPress={() => setTime(t)} />
            ))}
          </Row>
        </>
      )}

      {open === 'more' && (
        <>
          <IconField icon="create-outline" value={note} onChangeText={setNote} placeholder="Note" />
          <Row>
            <IconField icon="cash-outline" prefix="Rs" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="4500" style={{ flex: 1 }} />
            <IconField icon="time-outline" suffix="min" value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="10" style={{ width: 128 }} />
          </Row>
        </>
      )}

      <Btn title={editing ? 'Save changes' : 'Add chore'} onPress={submit} loading={busy} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  titleInput: {
    color: C.text,
    fontSize: T.heading,
    fontWeight: W.semibold,
    paddingVertical: 6,
  },
});
