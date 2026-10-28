import { requireNativeModule } from 'expo';

type MotorAlarmsNative = {
  /** Full desired-state reconcile: {"<id>": {at, title, body, rechain}}. */
  syncAlarms(json: string): Promise<void>;
  /** Same reconcile for quiet deadline reminders: {"<id>": {at, title, body}}. */
  syncReminders(json: string): Promise<void>;
  /** One quiet notification on the Task alerts channel. */
  notify(id: string, title: string, body: string): Promise<void>;
  snoozeAlarm(id: string, minutes: number): Promise<void>;
  setSnoozeMinutes(minutes: number): Promise<void>;
  isIgnoringBatteryOptimizations(): boolean;
  requestIgnoreBatteryOptimizations(): Promise<void>;
  notificationsEnabled(): boolean;
  openAutostartSettings(): boolean;
  openAppDetails(): void;
  openNotificationSettings(): Promise<void>;
};

export default requireNativeModule<MotorAlarmsNative>('MotorAlarms');
