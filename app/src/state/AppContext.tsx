import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PermissionsAndroid } from 'react-native';
import { syncAlarms } from '../alarm/sync';
import type { Chore, ChoreEvent, Household, Member, Profile, Purchase, Swap } from '../types';
import type { ChoreDraft } from '../db/api';
import type { ChoreOverrides } from '../logic/rotation';
import { localDate } from '../logic/rotation';
import { computeDesiredAlarms } from '../logic/alarms';
import { errorMessage } from '../logic/errors';
import { ensureDeviceSession } from '../db/client';
import * as api from '../db/api';
import { loadSnapshot, saveSnapshot, type SnapshotData } from './snapshot';
import { loadProfile, saveProfile } from './profile';
import { watchHousehold } from './realtime';

type Phase = 'boot' | 'error' | 'ready';

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
  memberName: (id: string | null) => string;
  refresh: () => Promise<void>;
  actions: {
    retry: () => void;
    startChore: (choreId: string) => void;
    completeChore: (choreId: string, date?: string) => void;
    skipChore: (choreId: string) => void;
    saveChore: (draft: ChoreDraft) => Promise<void>;
    editChore: (choreId: string, patch: Partial<Chore>) => Promise<void>;
    archiveChore: (choreId: string) => Promise<void>;
    requestSwap: (choreId: string, toMemberId: string | null) => void;
    acceptSwap: (requestId: string) => void;
    cancelSwap: (requestId: string) => void;
    loadPurchases: () => Promise<void>;
    addPurchase: (item: string, amount: number) => void;
    deletePurchase: (purchaseId: string) => void;
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

  const refresh = useCallback(async () => {
    if (!profile) return;
    try {
      let p = profile;
      // the device's member row can vanish (household rebuilt, fresh join) —
      // then RLS hides the whole household and even the fetch fails, so the
      // rebind via ensure_household has to cover the failed fetch too
      const reensure = async () => {
        p = await api.ensureHousehold('Me');
        saveProfile(p);
        setProfile(p);
        return api.fetchHouseholdData(p.householdId);
      };
      let data = await api.fetchHouseholdData(p.householdId).catch(() => reensure());
      if (!data.members.some((m) => m.id === p.memberId)) data = await reensure();
      setHousehold(data.household);
      setMembers(data.members);
      setChores(data.chores);
      setEvents(data.events);
      setOverrides(data.overrides);
      setSwaps(data.swaps);
      setToday(localDate());
      setStale(false);
      setError(null);
      const snapshot: SnapshotData = {
        household: data.household, members: data.members, chores: data.chores,
        events: data.events, overrides: data.overrides, swaps: data.swaps,
      };
      saveSnapshot(snapshot);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [profile]);

  // bootstrap: cached profile + snapshot render instantly; otherwise the
  // device signs itself in and joins the household invisibly under a default
  // name (members are renamed from the admin side). The user sees no setup.
  useEffect(() => {
    (async () => {
      try {
        const [cachedProfile, snapshot] = await Promise.all([loadProfile(), loadSnapshot()]);
        await ensureDeviceSession();
        const p = cachedProfile ?? await api.ensureHousehold('Me');
        if (!cachedProfile) saveProfile(p);
        if (snapshot) {
          setHousehold(snapshot.household);
          setMembers(snapshot.members);
          setChores(snapshot.chores);
          setEvents(snapshot.events);
          setOverrides(snapshot.overrides ?? {});
          setSwaps(snapshot.swaps ?? []);
          setStale(true);
        }
        setProfile(p);
        setPhase('ready');
      } catch (e) {
        setError(errorMessage(e));
        setPhase('error');
      }
    })();
  }, [reloadKey]);

  useEffect(() => {
    if (phase !== 'ready') return;
    (async () => {
      try {
        await ensureDeviceSession();
      } catch (e) {
        setError(errorMessage(e));  // offline: keep showing the snapshot
      }
      await refresh();
    })();
  }, [phase, reloadKey, refresh]);

  useEffect(() => {
    if (!profile) return;
    return watchHousehold(profile.householdId, () => setReloadKey((k) => k + 1));
  }, [profile]);

  useEffect(() => {
    if (phase !== 'ready') return;
    void PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => undefined);
  }, [phase]);

  const me = useMemo(
    () => members.find((m) => m.id === profile?.memberId) ?? null,
    [members, profile]
  );

  const memberName = useCallback(
    (id: string | null) => members.find((m) => m.id === id)?.name ?? '—',
    [members]
  );

  // reconcile the native alarm engine with desired state (local-first: alarms
  // live on the assignee's phone; the server only feeds them state)
  const desiredAlarms = useMemo(
    () => computeDesiredAlarms(me, members, chores, events, overrides),
    [me, members, chores, events, overrides]
  );
  useEffect(() => {
    if (phase !== 'ready') return;
    syncAlarms(desiredAlarms, setError);
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
      setError(errorMessage(e));
      await refresh();
    });
  }, [refresh]);

  const actions: AppState['actions'] = useMemo(() => ({
    retry() {
      setError(null);
      setPhase('boot');
      setReloadKey((k) => k + 1);
    },

    startChore(choreId) {
      const chore = chores.find((c) => c.id === choreId);
      if (!chore || !me || !household) return;
      const now = new Date().toISOString();
      const spawnId = `tmp-spawn-${choreId}-${today}`;
      writeBehind(
        () => {
          setEvents((prev) => [
            ...prev.filter((e) => !(e.chore_id === choreId && e.on_date === today)),
            {
              id: `tmp-${choreId}-${today}`, household_id: household.id, chore_id: choreId, on_date: today,
              status: 'started' as const, started_at: now, started_by: me.id, done_at: null, done_by: null, created_at: now,
            },
          ]);
          if (chore.duration_minutes != null) {
            setChores((prev) => [
              ...prev.filter((c) => c.spawned_from !== spawnId),
              {
                id: spawnId, household_id: household.id,
                title: `Close: ${chore.title}`, note: null,
                assignee_member_id: me.id, rotate: false, rotation_offset: 0, strict: true,
                due_at: new Date(Date.now() + chore.duration_minutes! * 60_000).toISOString(),
                repeat_days: null, repeat_weekdays: null, repeat_monthly_day: null, time_of_day: '10:00:00',
                duration_minutes: null, amount: null, rotation_members: null,
                spawned_from: `tmp-${choreId}-${today}`, active: true,
                created_by: me.id, created_at: now,
              },
            ]);
          }
        },
        async () => { await api.startChore(choreId, today); },
      );
    },

    completeChore(choreId, date = today) {
      const chore = chores.find((c) => c.id === choreId);
      if (!chore || !me || !household) return;
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
        () => api.completeChore(choreId, date),
      );
    },

    skipChore(choreId) {
      if (!me || !household) return;
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
        () => api.skipChore(choreId, today),
      );
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
      if (!profile || !me) return;
      writeBehind(
        () => {},
        () => api.requestSwap(profile.householdId, choreId, today, me.id, toMemberId),
      );
    },

    acceptSwap(requestId) {
      writeBehind(() => {}, () => api.acceptSwap(requestId));
    },

    cancelSwap(requestId) {
      writeBehind(() => {}, () => api.cancelSwap(requestId));
    },

    async loadPurchases() {
      if (!profile || purchases) return;
      try {
        setPurchases(await api.fetchPurchases(profile.householdId));
      } catch (e) {
        setError(errorMessage(e));
      }
    },

    addPurchase(item, amount) {
      if (!profile || !me) return;
      const now = new Date().toISOString();
      writeBehind(
        () => {
          setPurchases((prev) => [{
            id: `tmp-p-${Date.now()}`, household_id: profile.householdId, member_id: me.id,
            item, amount, created_at: now,
          }, ...(prev ?? [])]);
        },
        () => api.addPurchase(profile.householdId, me.id, item, amount).then(() => undefined),
      );
    },

    deletePurchase(purchaseId) {
      setPurchases((prev) => (prev ?? []).filter((p) => p.id !== purchaseId));
      api.deletePurchase(purchaseId).catch(async (e) => {
        setError(errorMessage(e));
        await refresh();
      });
    },
  }), [chores, events, household, me, profile, purchases, refresh, today, writeBehind]);

  const value: AppState = {
    phase, error, stale, profile, household, members, chores, events, overrides, swaps, purchases,
    today, me, memberName, refresh, actions,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}
