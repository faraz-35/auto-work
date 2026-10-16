import React, { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import MotorAlarms from '../alarm/native';
import { C } from '../theme';
import { Screen } from '../components/Screen';
import { Btn, Card, Field, Pill, Row, SectionTitle } from '../components/ui';
import { useApp } from '../state/AppContext';

type Checks = {
  notifications: boolean;
  battery: boolean;
};

export function FamilyScreen() {
  const app = useApp();
  const { household, members, me, actions } = app;
  const [checks, setChecks] = useState<Checks | null>(null);
  const [snooze, setSnooze] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const runChecks = useCallback(() => {
    setChecks({
      notifications: MotorAlarms.notificationsEnabled(),
      battery: MotorAlarms.isIgnoringBatteryOptimizations(),
    });
  }, []);

  useEffect(() => { runChecks(); }, [runChecks]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') runChecks();
    });
    return () => sub.remove();
  }, [runChecks]);

  useEffect(() => {
    if (household) setSnooze(String(household.snooze_minutes));
  }, [household?.snooze_minutes]);
  useEffect(() => {
    if (me) setName(me.name);
  }, [me?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) {
      Alert.alert('Something broke', e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const saveName = () =>
    guard(async () => {
      const trimmed = name.trim();
      if (trimmed.length < 1 || trimmed.length > 30) throw new Error('Name must be 1–30 letters.');
      await actions.renameMe(trimmed);
    });

  const saveSnooze = () =>
    guard(async () => {
      const ss = Number(snooze);
      if (!(ss >= 1 && ss <= 30)) throw new Error('Snooze must be 1–30 minutes.');
      await actions.saveSettings({ snooze_minutes: ss });
      Alert.alert('Saved', 'Applies on every phone next time the app opens.');
    });

  const testAlarm = () =>
    guard(async () => {
      await actions.ringTestAlarm();
      Alert.alert(
        'Test armed',
        'Lock the phone now. In one minute the alarm should light up the screen and ring. If it only shows as a banner, do step 4 below.'
      );
    });

  return (
    <Screen>
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <SectionTitle>Your name</SectionTitle>
      <Card style={{ gap: 14 }}>
        <Field label="What the family calls you" value={name} onChangeText={setName} placeholder={me?.name ?? 'Me'} />
        <Btn title="Save name" onPress={saveName} loading={busy} />
      </Card>

      <SectionTitle>Members</SectionTitle>
      <Card style={{ gap: 14 }}>
        {members.map((m) => (
          <Row key={m.id} style={{ justifyContent: 'space-between' }}>
            <Text style={[s.member, !m.active && { color: C.dim, textDecorationLine: 'line-through' }]}>
              {m.rotation_order + 1}. {m.name}
            </Text>
            {m.id === me?.id ? <Pill text="you" tone="good" /> : !m.active ? <Pill text="left" tone="dim" /> : null}
          </Row>
        ))}
        <Text style={s.meta}>
          A new phone just installs the app and opens it — it joins by itself.
        </Text>
      </Card>

      <SectionTitle>Alarms</SectionTitle>
      <Card style={{ gap: 14 }}>
        <Field label="Snooze minutes" value={snooze} onChangeText={setSnooze} keyboardType="number-pad" placeholder="5" />
        <Btn title="Save" onPress={saveSnooze} loading={busy} />
      </Card>

      <SectionTitle>Make alarms reliable on this phone</SectionTitle>
      <Card style={{ gap: 14 }}>
        <CheckRow
          ok={checks?.notifications}
          label="Notifications allowed"
          fix="Allow" onFix={() => void MotorAlarms.openNotificationSettings()}
        />
        <CheckRow
          ok={checks?.battery}
          label="Not battery-optimized (survives idle nights)"
          fix="Exempt" onFix={() => void MotorAlarms.requestIgnoreBatteryOptimizations()}
        />
        <View style={{ gap: 6 }}>
          <Text style={s.checkLabel}>3. Autostart after reboot (manual on Xiaomi / Infinix)</Text>
          <Btn title="Open autostart settings" kind="ghost" onPress={() => MotorAlarms.openAutostartSettings()} />
          <Text style={s.meta}>
            On Redmi: Security app → Permissions → Autostart → enable Ghar. On Infinix/HiOS the
            toggle lives in Phone Master or Settings → Apps → Ghar → autostart.
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={s.checkLabel}>
            4. Alarms that take over the screen (manual on Xiaomi / Infinix)
          </Text>
          <Btn title="Open app permissions" kind="ghost" onPress={() => MotorAlarms.openAppDetails()} />
          <Text style={s.meta}>
            In the app's permission page, also allow "Display pop-up windows while running in the
            background" (Redmi) / "Display pop-up windows" (Infinix). Without it the alarm still
            rings and vibrates, but shows as a banner instead of lighting up the full screen.
          </Text>
        </View>
        <Btn title="Ring a test alarm in 1 minute" onPress={testAlarm} loading={busy} />
      </Card>

      <Text style={s.version}>Ghar v2.0.2 · household {household?.id?.slice(0, 8) ?? '—'}</Text>
    </ScrollView>
    </Screen>
  );
}

function CheckRow({
  ok, label, fix, onFix,
}: {
  ok: boolean | undefined; label: string; fix: string; onFix: () => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={[s.checkLabel, { flex: 1 }]}>{label}</Text>
        {ok === undefined ? <Pill text="…" tone="dim" /> : ok ? <Pill text="ok" tone="good" /> : <Pill text="needed" tone="bad" />}
      </Row>
      {ok === false && <Btn title={fix} kind="ghost" onPress={onFix} />}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  meta: { color: C.dim, fontSize: 13 },
  member: { color: C.text, fontSize: 16, fontWeight: '500' },
  checkLabel: { color: C.text, fontSize: 15 },
  version: { color: C.dim, fontSize: 12, textAlign: 'center', marginTop: 8 },
});
