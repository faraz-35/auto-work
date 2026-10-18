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
