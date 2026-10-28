import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as api from '../db/api';
import { ensureDeviceSession } from '../db/client';
import { loadProfile } from '../state/profile';
import { saveSnapshot } from '../state/snapshot';
import { computeReminders } from './logic';
import { notifyAssignments, syncReminders } from './sync';

/** WorkManager wakes this every ≥15 minutes while the app is backgrounded:
 *  refresh the household, announce new assignments, re-arm reminders, and
 *  keep the boot snapshot fresh. Instant delivery in the foreground comes
 *  from realtime refetches running the same passes. */
export const SYNC_TASK = 'household-sync';

// The headless context re-runs the app bundle, so the task must be defined at
// module scope; AppContext imports this file, which covers both worlds.
let defined = false;

export function defineSyncTask(): void {
  if (defined) return;
  defined = true;
  TaskManager.defineTask(SYNC_TASK, async () => {
    try {
      const profile = await loadProfile();
      if (!profile) return BackgroundTask.BackgroundTaskResult.Success;
      await ensureDeviceSession();
      const data = await api.fetchHouseholdData(profile.householdId);
      const me = data.members.find((m) => m.id === profile.memberId);
      if (!me) return BackgroundTask.BackgroundTaskResult.Success;  // unbound; the open app handles re-picking
      saveSnapshot(data);
      await notifyAssignments(data.chores, data.members, me);
      syncReminders(computeReminders(me, data.members, data.chores, data.events, data.overrides), (m) => console.warn('reminder sync', m));
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (e) {
      console.warn('background sync', e);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export function enableSyncTask(): Promise<void> {
  return BackgroundTask.registerTaskAsync(SYNC_TASK, { minimumInterval: 15 });
}

export function disableSyncTask(): Promise<void> {
  return BackgroundTask.unregisterTaskAsync(SYNC_TASK);
}
