import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { C, T, W } from '../theme';
import { Btn, Chip, Field, Row, roles } from './ui';
import { Sheet } from './Sheet';
import { ChoreDraft } from '../db/api';
import type { Chore } from '../types';
import { useApp } from '../state/AppContext';
import { addDays, localDate } from '../logic/rotation';
import { formatDay } from '../logic/human';

const todayStr = () => localDate();
const tomorrowStr = () => addDays(localDate(), 1);
const humanDay = (d: string) => (dateOk(d) ? formatDay(d) : d);
function dateOk(d: string) { return /^\d{4}-\d{2}-\d{2}$/.test(d); }

type Mode = 'once' | 'every' | 'monthly';

type Props = {
  visible: boolean;
  onClose: () => void;
  editing?: Chore | null;
};

/** Create / edit a chore. Fast path first: name it, pick who and when, add.
 *  Rare fields (note, amount, duration) stay folded away until asked for.
 *  Strict chores ring a real alarm on the assignee's phone. */
export function ChoreModal({ visible, onClose, editing = null }: Props) {
  const { members, me, actions } = useApp();

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>('rotate');
  const [mode, setMode] = useState<Mode>('once');
  const [onceDate, setOnceDate] = useState('');
  const [onceTime, setOnceTime] = useState('18:00');
  const [everyDays, setEveryDays] = useState('1');
  const [everyTime, setEveryTime] = useState('18:00');
  const [monthlyDay, setMonthlyDay] = useState('25');
  const [monthlyTime, setMonthlyTime] = useState('09:00');
  const [strict, setStrict] = useState(false);
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setTitle(editing.title);
      setNote(editing.note ?? '');
      setAssigneeId(editing.rotate ? 'rotate' : editing.assignee_member_id ?? '');
      setMode(editing.due_at != null ? 'once' : editing.repeat_days != null ? 'every' : 'monthly');
      if (editing.due_at) {
        const d = new Date(editing.due_at);
        setOnceDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(d));
        setOnceTime(editing.due_at.slice(11, 16) || '18:00');
      }
      setEveryDays(String(editing.repeat_days ?? 1));
      setEveryTime(editing.time_of_day.slice(0, 5));
      setMonthlyDay(String(editing.repeat_monthly_day ?? 25));
      setMonthlyTime(editing.time_of_day.slice(0, 5));
      setStrict(editing.strict);
      setAmount(editing.amount != null ? String(editing.amount) : '');
      setDuration(editing.duration_minutes != null ? String(editing.duration_minutes) : '');
      setMoreOpen(editing.note != null || editing.amount != null || editing.duration_minutes != null);
    } else {
      setTitle(''); setNote(''); setAssigneeId('rotate'); setMode('once');
      setOnceDate(addDays(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()), 0));
      setOnceTime('18:00'); setEveryDays('1'); setEveryTime('18:00');
      setMonthlyDay('25'); setMonthlyTime('09:00');
      setStrict(false); setAmount(''); setDuration('');
      setMoreOpen(false);
    }
  }, [visible, editing]);

  const timeOk = (t: string) => /^\d{1,2}:\d{2}$/.test(t);

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
      if (!timeOk(mode === 'once' ? onceTime : mode === 'every' ? everyTime : monthlyTime)) {
        throw new Error('Time must look like 18:00.');
      }

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
        if (!dateOk(onceDate)) throw new Error('Date must look like 2026-10-17.');
        draft.dueAt = `${onceDate}T${onceTime}:00+05:00`;
      } else if (mode === 'every') {
        const n = Number(everyDays);
        if (!(n >= 1 && n <= 365)) throw new Error('Repeat days must be 1–365.');
        draft.repeatDays = n;
        draft.timeOfDay = `${everyTime}:00`;
      } else {
        const n = Number(monthlyDay);
        if (!(n >= 1 && n <= 28)) throw new Error('Day of month must be 1–28.');
        draft.repeatMonthlyDay = n;
        draft.timeOfDay = `${monthlyTime}:00`;
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

  return (
    <Sheet visible={visible} onClose={onClose} title={editing ? 'Edit chore' : 'New chore'} scroll>
      <Field
        label="What needs doing"
        value={title}
        onChangeText={setTitle}
        placeholder="Pay the electricity bill"
        autoFocus
      />

      <Text style={s.label}>Who</Text>
      <Row style={{ flexWrap: 'wrap' }}>
        <Chip active={assigneeId === 'rotate'} label="Rotating" onPress={() => setAssigneeId('rotate')} />
        {members.filter((m) => m.active).map((m) => (
          <Chip
            key={m.id}
            active={assigneeId === m.id}
            label={m.id === me?.id ? `${m.name} (you)` : m.name}
            onPress={() => setAssigneeId(m.id)}
          />
        ))}
      </Row>
      {assigneeId === 'rotate' && (
        <Text style={roles.meta}>Everyone active takes a turn, one after another.</Text>
      )}

      <Text style={s.label}>When</Text>
      <Row>
        <Chip active={mode === 'once'} label="Once" onPress={() => setMode('once')} />
        <Chip active={mode === 'every'} label="Every N days" onPress={() => setMode('every')} />
        <Chip active={mode === 'monthly'} label="Monthly" onPress={() => setMode('monthly')} />
      </Row>
      {mode === 'once' && (
        <>
          <Row style={{ flexWrap: 'wrap' }}>
            <Chip active={onceDate === todayStr()} label="Today" onPress={() => setOnceDate(todayStr())} />
            <Chip active={onceDate === tomorrowStr()} label="Tomorrow" onPress={() => setOnceDate(tomorrowStr())} />
            {dateOk(onceDate) && onceDate !== todayStr() && onceDate !== tomorrowStr() && (
              <Chip active label={humanDay(onceDate)} onPress={() => undefined} />
            )}
          </Row>
          <Row>
            <View style={{ flex: 1 }}>
              <Field label="Date (YYYY-MM-DD)" value={onceDate} onChangeText={setOnceDate} placeholder="2026-10-17" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Time" value={onceTime} onChangeText={setOnceTime} placeholder="18:00" />
            </View>
          </Row>
        </>
      )}
      {mode === 'every' && (
        <Row>
          <View style={{ flex: 1 }}>
            <Field label="Every" value={everyDays} onChangeText={setEveryDays} keyboardType="number-pad" placeholder="1" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Time" value={everyTime} onChangeText={setEveryTime} placeholder="18:00" />
          </View>
        </Row>
      )}
      {mode === 'monthly' && (
        <Row>
          <View style={{ flex: 1 }}>
            <Field label="Day of month" value={monthlyDay} onChangeText={setMonthlyDay} keyboardType="number-pad" placeholder="25" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Time" value={monthlyTime} onChangeText={setMonthlyTime} placeholder="09:00" />
          </View>
        </Row>
      )}

      <Text style={s.label}>Deadline</Text>
      <Row style={{ alignItems: 'center' }}>
        <Chip active={strict} label={strict ? 'Rings an alarm' : 'No alarm'} onPress={() => setStrict(!strict)} />
        <Text style={[roles.meta, { flex: 1 }]}>
          {strict
            ? 'Full-screen alarm on the assignee\'s phone at the deadline.'
            : 'Just shows on the today list.'}
        </Text>
      </Row>

      {moreOpen ? (
        <>
          <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="KE bill, online portal" />
          <Row>
            <View style={{ flex: 1 }}>
              <Field label="Rs (optional, for bills)" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="4500" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Takes ~min (optional)" value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="10" />
            </View>
          </Row>
          {duration.trim() !== '' && (
            <Text style={roles.meta}>
              When started, a second chore appears to close it — that's how the motor works.
            </Text>
          )}
        </>
      ) : (
        <Btn title="Note, amount, duration…" kind="link" onPress={() => setMoreOpen(true)} />
      )}

      <Btn title={editing ? 'Save changes' : 'Add chore'} onPress={submit} loading={busy} />
      <Btn title="Cancel" kind="link" onPress={onClose} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  label: {
    color: C.dim,
    fontSize: T.tiny,
    fontWeight: W.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 4,
  },
});
