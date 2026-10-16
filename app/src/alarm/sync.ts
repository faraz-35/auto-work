import MotorAlarms from './native';
import { alarmsToNativeJson, type AlarmSpec } from '../logic/alarms';

// The native engine receives full desired-state snapshots; this dedupes
// consecutive identical ones so unchanged state never crosses the bridge.
let appliedJson = '';

export function syncAlarms(alarms: AlarmSpec[], onError: (message: string) => void): void {
  const json = alarmsToNativeJson(alarms);
  if (json === appliedJson) return;
  appliedJson = json;
  MotorAlarms.syncAlarms(json).catch((e) => onError(String(e)));
}

/** One-off pushes (the test alarm) that must land even if it duplicates the
 *  last synced set; the pushed set becomes the new baseline. */
export function pushAlarmSet(alarms: AlarmSpec[]): Promise<void> {
  const json = alarmsToNativeJson(alarms);
  appliedJson = json;
  return MotorAlarms.syncAlarms(json);
}
