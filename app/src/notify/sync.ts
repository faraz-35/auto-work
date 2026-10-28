import MotorAlarms from '../alarm/native';
import type { Chore, Member } from '../types';
import { localDate } from '../logic/rotation';
import { assignmentAlert, freshAssignments, myFixedChores, remindersToNativeJson, type ReminderSpec } from './logic';
import { loadSeen, markSeenInitialized, saveSeen, seenInitialized } from '../state/seen';

// ---- "added for you" alerts ----

// Passes run one at a time so two overlapping refreshes can't both see the
// same chore as unseen and notify twice.
let queue: Promise<void> = Promise.resolve();

export function notifyAssignments(chores: Chore[], members: Member[], me: Member): Promise<void> {
  const run = queue.then(() => announcePass(chores, members, me)).catch((e) => console.warn('notify pass', e));
  queue = run;
  return run;
}

async function announcePass(chores: Chore[], members: Member[], me: Member): Promise<void> {
  // a phone's first pass seeds silently — an install must not replay the
  // household's whole history as notifications
  if (!(await seenInitialized())) {
    saveSeen(myFixedChores(chores, me).map((c) => c.id));
    markSeenInitialized();
    return;
  }
  const seen = await loadSeen();
  saveSeen(myFixedChores(chores, me).map((c) => c.id));
  for (const chore of freshAssignments(chores, me, seen)) {
    const creator = members.find((m) => m.id === chore.created_by) ?? null;
    const alert = assignmentAlert(chore, creator, localDate());
    await MotorAlarms.notify(`assign:${chore.id}`, alert.title, alert.body);
  }
}

// ---- deadline reminders ----

// The native engine receives full desired-state snapshots; this dedupes
// consecutive identical ones so unchanged state never crosses the bridge.
let appliedReminders = '';

export function syncReminders(reminders: ReminderSpec[], onError: (message: string) => void): void {
  const json = remindersToNativeJson(reminders);
  if (json === appliedReminders) return;
  appliedReminders = json;
  MotorAlarms.syncReminders(json).catch((e) => onError(String(e)));
}
