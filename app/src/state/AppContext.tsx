import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid } from 'react-native';
import MotorAlarms from '../alarm/native';
import { PROFILE_KEY, SNAPSHOT_KEY } from '../config';
import type { Chore, ChoreEvent, Household, Member, Profile, Purchase, Swap } from '../types';
import type { ChoreDraft } from '../db/api';
import { ChoreOverrides, localDate, overrideKey } from '../logic/rotation';
import { alarmsToNativeJson, computeDesiredAlarms } from '../logic/alarms';
import { ensureDeviceSession, db } from '../db/client';
import * as api from '../db/api';

type Phase = 'boot' | 'needName' | 'ready';

type Snapshot = {
  v: 2;
  household: Household | null;
  members: Member[];
  chores: Chore[];
  events: ChoreEvent[];
  overrides: ChoreOverrides;
  swaps: Swap[];
  savedAt: string;
};

type AppState = {
  phase: Phase;
  error: string | null;
  stale: boolean;             // showing the cached snapshot, not yet revalidated
  profile: Profile | null;
  household: Household | null;
  members: Member[];
  chores: Chore[];
  events: ChoreEvent[];
  overrides: ChoreOverrides;
  swaps: Swap[];
  purchases: Purchase[] | null;  // null = ledger not loaded yet
  today: string;
  me: Member | null;
  refresh: () => Promise<void>;
  actions: {
    signIn: (name: string) => Promise<void>;
    startChore: (choreId: string) => Promise<void>;
    completeChore: (choreId: string, date?: string) => Promise<void>;
    skipChore: (choreId: string) => Promise<void>;
    saveChore: (draft: ChoreDraft) => Promise<void>;
    editChore: (choreId: string, patch: Partial<Chore>) => Promise<void>;
    archiveChore: (choreId: string) => Promise<void>;
    requestSwap: (choreId: string, toMemberId: string | null) => Promise<void>;
    acceptSwap: (requestId: string) => Promise<void>;
    cancelSwap: (requestId: string) => Promise<void>;
    saveSettings: (patch: Partial<Pick<Household, 'snooze_minutes'>>) => Promise<void>;
    leave: () => Promise<void>;
    loadPurchases: () => Promise<void>;
    addPurchase: (item: string, amount: number) => Promise<void>;
    deletePurchase: (purchaseId: string) => Promise<void>;
    ringTestAlarm: () => Promise<void>;
  };
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('boot');
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [chores, setChores] = useState<Chore[]>([]);
  const [events, setEvents] = useState<ChoreEvent[]>([]);
  const [overrides, setOverrides] = useState<ChoreOverrides>({});
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [today, setToday] = useState(localDate());
  const [reloadKey, setReloadKey] = useState(0);
  const appliedAlarms = useRef<string>('');

  const persistSnapshot = useCallback((data: Omit<Snapshot, 'v' | 'savedAt'>) => {
    void AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ ...data, v: 2, savedAt: new Date().toISOString() } as Snapshot));
  }, []);

  const refresh = useCallback(async () => {
    if (!profile) return;
    try {
      const data = await api.fetchHouseholdData(profile.householdId);
      setHousehold(data.household);
      setMembers(data.members);
      setChores(data.chores);
      setEvents(data.events);
      setOverrides(data.overrides);
      setSwaps(data.swaps);
      setToday(localDate());
      setStale(false);
      setError(null);
      persistSnapshot({ household: data.household, members: data.members, chores: data.chores, events: data.events, overrides: data.overrides, swaps: data.swaps });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [profile, persistSnapshot]);

  // bootstrap: cached profile + snapshot render instantly; the session and a
  // fresh fetch settle in the background (stale-while-revalidate — never
  // block the today screen on the network)
  useEffect(() => {
    (async () => {
      try {
        const [rawProfile, rawSnapshot] = await Promise.all([
          AsyncStorage.getItem(PROFILE_KEY),
          AsyncStorage.getItem(SNAPSHOT_KEY),
        ]);
        if (!rawProfile) {
          setPhase('needName');
          return;
        }
        const p: Profile = JSON.parse(rawProfile);
        setProfile(p);
        if (rawSnapshot) {
          const snap: Snapshot = JSON.parse(rawSnapshot);
          if (snap.v === 2) {
            setHousehold(snap.household);
            setMembers(snap.members);
            setChores(snap.chores);
            setEvents(snap.events);
            setOverrides(snap.overrides ?? {});
            setSwaps(snap.swaps ?? []);
            setStale(true);
          }
        }
        setPhase('ready');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase('needName');
      }
    })();
  }, []);

  useEffect(() => {
    if (phase === 'ready') {
      (async () => {
        try {
          await ensureDeviceSession();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));  // offline: keep showing the snapshot
        }
        await refresh();
      })();
    }
  }, [phase, reloadKey, refresh]);

  // realtime: any household-row change (chores, events, members, swaps,
  // purchases, chore_assignments) or the household's own settings row
  // triggers a refetch
  useEffect(() => {
    if (!profile) return;
    const channel = db.channel(`household-${profile.householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', filter: `household_id=eq.${profile.householdId}` },
        () => { setReloadKey((k) => k + 1); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'households', filter: `id=eq.${profile.householdId}` },
        () => { setReloadKey((k) => k + 1); }
      )
      .subscribe();
    return () => { void db.removeChannel(channel); };
  }, [profile]);

  // notification permission (Android 13+)
  useEffect(() => {
    if (phase !== 'ready') return;
    void PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => undefined);
  }, [phase]);

  const me = useMemo(
    () => members.find((m) => m.id === profile?.memberId) ?? null,
    [members, profile]
  );

  // reconcile the native alarm engine with desired state (local-first: alarms
  // live on the assignee's phone; the server only feeds them state)
  const desiredAlarms = useMemo(
    () => computeDesiredAlarms(me, members, chores, events, overrides),
    [me, members, chores, events, overrides]
  );
  useEffect(() => {
    if (phase !== 'ready') return;
    const key = alarmsToNativeJson(desiredAlarms);
    if (key === appliedAlarms.current) return;
    appliedAlarms.current = key;
    MotorAlarms.syncAlarms(key).catch((e) => setError(String(e)));
  }, [phase, desiredAlarms]);

  // a minute ticker so "today" rolls over on screen and stale days age out
  useEffect(() => {
    const t = setInterval(() => setToday(localDate()), 30_000);
    return () => clearInterval(t);
  }, []);

  /** Optimistic wrapper: apply locally now, write in the background, heal
   *  from the server on realtime or on failure (refetch = rollback). */
  const writeBehind = useCallback((local: () => void, write: () => Promise<void>) => {
    local();
    write().catch(async (e) => {
      setError(e instanceof Error ? e.message : String(e));
      await refresh();
    });
  }, [refresh]);

  const actions: AppState['actions'] = useMemo(() => ({
    async signIn(name) {
      await ensureDeviceSession();
      const p = await api.ensureHousehold(name);
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
      setProfile(p);
      setPhase('ready');
    },

    startChore(choreId) {
      const chore = chores.find((c) => c.id === choreId);
      if (!chore || !me || !household) return Promise.resolve();
      const now = new Date().toISOString();
      writeBehind(
        () => {
          setEvents((prev) => {
            const rest = prev.filter((e) => !(e.chore_id === choreId && e.on_date === today));
            return [...rest, {
              id: `tmp-${choreId}-${today}`, household_id: household.id, chore_id: choreId, on_date: today,
              status: 'started' as const, started_at: now, started_by: me.id, done_at: null, done_by: null, created_at: now,
            }];
          });
          if (chore.duration_minutes != null) {
            setChores((prev) => [
              ...prev.filter((c) => c.spawned_from !== `tmp-${choreId}-${today}`),
              {
                id: `tmp-spawn-${choreId}-${today}`, household_id: household.id,
                title: `Close: ${chore.title}`, note: null,
                assignee_member_id: me.id, rotate: false, rotation_offset: 0, strict: true,
                due_at: new Date(Date.now() + chore.duration_minutes! * 60_000).toISOString(),
                repeat_days: null, repeat_monthly_day: null, time_of_day: '10:00:00',
                duration_minutes: null, amount: null,
                spawned_from: `tmp-${choreId}-${today}`, active: true,
                created_by: me.id, created_at: now,
              },
            ]);
          }
        },
        async () => { await api.startChore(choreId, today); }
      );
      return Promise.resolve();
    },

    completeChore(choreId, date = today) {
      const chore = chores.find((c) => c.id === choreId);
      if (!chore || !me || !household) return Promise.resolve();
      const now = new Date().toISOString();
      const parentEventId = chore.spawned_from;
      writeBehind(
        () => {
          setEvents((prev) => {
            const rest = prev.filter((e) => !(e.chore_id === choreId && e.on_date === date));
            const next = [...rest, {
              id: `tmp-${choreId}-${date}`, household_id: household.id, chore_id: choreId, on_date: date,
              status: 'done' as const, started_at: null, started_by: null, done_at: now, done_by: me.id, created_at: now,
            }];
            if (parentEventId) {
              return next.map((e) => e.id === parentEventId
                ? { ...e, status: 'done' as const, done_at: now, done_by: me.id }
                : e);
            }
            return next;
          });
        },
        async () => { await api.completeChore(choreId, date); }
      );
      return Promise.resolve();
    },

    skipChore(choreId) {
      if (!me || !household) return Promise.resolve();
      const now = new Date().toISOString();
      writeBehind(
        () => {
          setEvents((prev) => [
            ...prev.filter((e) => !(e.chore_id === choreId && e.on_date === today)),
            {
              id: `tmp-${choreId}-${today}`, household_id: household.id, chore_id: choreId, on_date: today,
              status: 'skipped' as const, started_at: null, started_by: null, done_at: now, done_by: me.id, created_at: now,
            },
          ]);
        },
        async () => { await api.skipChore(choreId, today); }
      );
      return Promise.resolve();
    },

    async saveChore(draft) {
      await api.createChore(draft);
      await refresh();
    },

    async editChore(choreId, patch) {
      await api.updateChore(choreId, patch);
      await refresh();
    },

    async archiveChore(choreId) {
      await api.updateChore(choreId, { active: false });
      await refresh();
    },

    requestSwap(choreId, toMemberId) {
      if (!profile || !me) return Promise.resolve();
      writeBehind(
        () => {},
        async () => { await api.requestSwap(profile.householdId, choreId, today, me.id, toMemberId); }
      );
      return Promise.resolve();
    },

    acceptSwap(requestId) {
      writeBehind(
        () => {},
        async () => { await api.acceptSwap(requestId); }
      );
      return Promise.resolve();
    },

    cancelSwap(requestId) {
      writeBehind(
        () => {},
        async () => { await api.cancelSwap(requestId); }
      );
      return Promise.resolve();
    },

    async saveSettings(patch) {
      if (!profile) return;
      if (patch.snooze_minutes != null) await MotorAlarms.setSnoozeMinutes(patch.snooze_minutes);
      await api.saveHouseholdSettings(profile.householdId, patch);
      await refresh();
    },

    async leave() {
      if (!profile) return;
      await api.leaveHousehold(profile.memberId);
      await AsyncStorage.removeItem(PROFILE_KEY);
      await AsyncStorage.removeItem(SNAPSHOT_KEY);
      await MotorAlarms.syncAlarms('{}');
      setProfile(null);
      setHousehold(null);
      setMembers([]);
      setChores([]);
      setEvents([]);
      setOverrides({});
      setSwaps([]);
      setPurchases(null);
      setPhase('needName');
    },

    async loadPurchases() {
      if (!profile || purchases) return;
      try {
        setPurchases(await api.fetchPurchases(profile.householdId));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },

    addPurchase(item, amount) {
      if (!profile || !me) return Promise.resolve();
      const now = new Date().toISOString();
      writeBehind(
        () => {
          setPurchases((prev) => [{
            id: `tmp-p-${Date.now()}`, household_id: profile.householdId, member_id: me.id,
            item, amount, created_at: now,
          }, ...(prev ?? [])]);
        },
        async () => { await api.addPurchase(profile.householdId, me.id, item, amount); }
      );
      return Promise.resolve();
    },

    deletePurchase(purchaseId) {
      setPurchases((prev) => (prev ?? []).filter((p) => p.id !== purchaseId));
      api.deletePurchase(purchaseId).catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        void refresh();
      });
      return Promise.resolve();
    },

    async ringTestAlarm() {
      // keep the real alarms and add a one-shot test entry a minute out
      const test = [{
        id: 'test',
        atMs: Date.now() + 60_000,
        title: 'Test alarm',
        body: 'If you see this, alarms work on this phone.',
        rechain: false,
      }];
      const combined = [...desiredAlarms.filter((a) => a.id !== 'test'), ...test];
      await MotorAlarms.syncAlarms(alarmsToNativeJson(combined));
    },
  }), [chores, events, household, me, profile, purchases, refresh, today, writeBehind, desiredAlarms]);

  const value: AppState = {
    phase, error, stale, profile, household, members, chores, events, overrides, swaps, purchases,
    today, me, refresh, actions,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}
