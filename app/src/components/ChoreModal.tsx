import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';
import { Btn, Card, Field, Pill, Row } from './ui';
import { ChoreDraft } from '../db/api';
import type { Chore } from '../types';
import { useApp } from '../state/AppContext';
import { addDays, localDate } from '../logic/rotation';
import { formatDay } from '../logic/human';

const karachiToday = () => localDate();
const todayStr = () => karachiToday();
const tomorrowStr = () => addDays(karachiToday(), 1);
const humanDay = (d: string) => (dateOk(d) ? formatDay(d) : d);
function dateOk(d: string) { return /^\d{4}-\d{2}-\d{2}$/.test(d); }

type Mode = 'once' | 'every' | 'monthly';

type Props = {
  visible: boolean;
  onClose: () => void;
  editing?: Chore | null;
};

/** Create / edit a chore. One-offs get a due date; recurring chores repeat
 *  every N days or on a day of the month. Strict chores ring a real alarm on
 *  the assignee's phone. Amount makes it a bill; duration spawns a close
 *  chore when started (the motor works this way). */
export function ChoreModal({ visible, onClose, editing = null }: Props) {
  const { members, me, actions } = useApp();
  const insets = useSafeAreaInsets();

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
    } else {
      setTitle(''); setNote(''); setAssigneeId('rotate'); setMode('once');
      setOnceDate(addDays(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()), 0));
      setOnceTime('18:00'); setEveryDays('1'); setEveryTime('18:00');
      setMonthlyDay('25'); setMonthlyTime('09:00');
      setStrict(false); setAmount(''); setDuration('');
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={[s.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            <Text style={s.title}>{editing ? 'Edit chore' : 'New chore'}</Text>
            <Field label="What needs doing" value={title} onChangeText={setTitle} placeholder="Pay the electricity bill" />
            <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="KE bill, online portal" />

            <Text style={s.label}>Who</Text>
            <Row style={{ flexWrap: 'wrap' }}>
              <PickerChip active={assigneeId === 'rotate'} label="Rotating" onPress={() => setAssigneeId('rotate')} />
              {members.filter((m) => m.active).map((m) => (
                <PickerChip
                  key={m.id}
                  active={assigneeId === m.id}
                  label={m.id === me?.id ? `${m.name} (you)` : m.name}
                  onPress={() => setAssigneeId(m.id)}
                />
              ))}
            </Row>
            {assigneeId === 'rotate' && (
              <Text style={s.hint}>Everyone active takes a turn, one after another.</Text>
            )}

            <Text style={s.label}>When</Text>
            <Row>
              <PickerChip active={mode === 'once'} label="Once" onPress={() => setMode('once')} />
              <PickerChip active={mode === 'every'} label="Every N days" onPress={() => setMode('every')} />
              <PickerChip active={mode === 'monthly'} label="Monthly" onPress={() => setMode('monthly')} />
            </Row>
            {mode === 'once' && (
              <>
                <Row style={{ flexWrap: 'wrap' }}>
                  <PickerChip active={onceDate === todayStr()} label="Today" onPress={() => setOnceDate(todayStr())} />
                  <PickerChip active={onceDate === tomorrowStr()} label="Tomorrow" onPress={() => setOnceDate(tomorrowStr())} />
                  {dateOk(onceDate) && onceDate !== todayStr() && onceDate !== tomorrowStr() && (
                    <PickerChip active label={humanDay(onceDate)} onPress={() => undefined} />
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
              <PickerChip active={strict} label={strict ? 'Alarm 🔔' : 'No alarm'} onPress={() => setStrict(!strict)} />
              <Text style={[s.hint, { flex: 1 }]}>
                {strict
                  ? 'Rings a full-screen alarm on the assignee\'s phone at the deadline.'
                  : 'Just shows on the today list.'}
              </Text>
            </Row>

            <Row>
              <View style={{ flex: 1 }}>
                <Field label="Rs (optional, for bills)" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="4500" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Takes ~min (optional)" value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="10" />
              </View>
            </Row>
            {duration.trim() !== '' && (
              <Text style={s.hint}>
                When started, a second chore appears to close it — that's how the motor works.
              </Text>
            )}

            <Btn title={editing ? 'Save changes' : 'Add chore'} onPress={submit} loading={busy} />
            <Btn title="Cancel" kind="ghost" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PickerChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Card style={[s.chip, active && { borderColor: C.accent, backgroundColor: C.accentBg }]}>
      <Text style={[s.chipText, active && { color: C.accent, fontWeight: '700' }]} onPress={onPress}>
        {label}
      </Text>
    </Card>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: C.border, paddingHorizontal: 20, paddingTop: 20,
    maxHeight: '88%',
  },
  title: { color: C.text, fontSize: 20, fontWeight: '700' },
  label: { color: C.dim, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  hint: { color: C.dim, fontSize: 13 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 },
  chipText: { color: C.text, fontSize: 14 },
});
