-- Ghar v2: chores-first rebuild. Everything due is a chore; the motor is two
-- chained chores (turn on -> spawned close chore), bills are chores with an
-- amount, purchases are the separate ledger. No login UI: ensure_household()
-- silently creates/joins/reactivates using the device-pool auth.

-- ============ tear down the v1 model (data unused) ============

drop table if exists public.runs cascade;
drop table if exists public.assignments cascade;
drop table if exists public.swap_requests cascade;

drop function if exists public.create_household(text, time, int) cascade;
drop function if exists public.join_household(text, text) cascade;
drop function if exists public.accept_swap(uuid) cascade;
drop function if exists public.cancel_swap(uuid) cascade;
drop function if exists public.rotation_assignment(uuid, date) cascade;
drop function if exists public.effective_assignment(uuid, date) cascade;

alter table public.households
  drop column if exists code,
  drop column if exists reminder_time,
  drop column if exists run_minutes;

-- ============ schema ============

create table public.chores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  note text,
  assignee_member_id uuid references public.members(id),
  rotate boolean not null default false,
  rotation_offset int not null default 0,
  strict boolean not null default false,
  due_at timestamptz,
  repeat_days int check (repeat_days between 1 and 365),
  repeat_monthly_day int check (repeat_monthly_day between 1 and 28),
  time_of_day time not null default '10:00',
  duration_minutes int check (duration_minutes between 1 and 120),
  amount numeric(12,2) check (amount > 0),
  spawned_from uuid,
  active boolean not null default true,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now(),
  constraint chore_schedule_one_way check (
    (due_at is not null)::int + (repeat_days is not null)::int + (repeat_monthly_day is not null)::int = 1
  ),
  constraint chore_rotate_xor_assignee check (rotate = (assignee_member_id is null))
);
create index chores_household_idx on public.chores(household_id, active);

create table public.chore_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  chore_id uuid not null references public.chores(id) on delete cascade,
  on_date date not null,
  status text not null check (status in ('started','done','skipped')),
  started_at timestamptz,
  started_by uuid references public.members(id),
  done_at timestamptz,
  done_by uuid references public.members(id),
  created_at timestamptz not null default now(),
  unique (chore_id, on_date)
);

-- circular FK: close-chores point at the event that spawned them
alter table public.chores
  add constraint chores_spawned_from_fkey foreign key (spawned_from) references public.chore_events(id) on delete set null;

create table public.chore_assignments (
  household_id uuid not null references public.households(id) on delete cascade,
  chore_id uuid not null references public.chores(id) on delete cascade,
  on_date date not null,
  member_id uuid not null references public.members(id),
  primary key (chore_id, on_date)
);

create table public.swap_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  chore_id uuid not null references public.chores(id) on delete cascade,
  on_date date not null,
  from_member_id uuid not null references public.members(id),
  to_member_id uuid references public.members(id),
  status text not null check (status in ('pending','accepted','canceled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.members(id)
);
create index swaps_household_idx on public.swap_requests(household_id, status);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.members(id),
  item text not null check (char_length(btrim(item)) between 1 and 120),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index purchases_household_idx on public.purchases(household_id, created_at desc);

-- ============ scheduling logic (must match app/src/logic/rotation.ts) ============
-- Karachi is UTC+5 with no DST; day number = floor(UTC epoch of the date / 86400).

create function public.occurs_on(p_chore uuid, p_date date)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when c.due_at is not null then
      p_date = (c.due_at at time zone 'Asia/Karachi')::date
    when c.repeat_days is not null then
      (extract(epoch from p_date)::bigint / 86400)
        >= (extract(epoch from (c.created_at at time zone 'Asia/Karachi')::date)::bigint / 86400)
      and ((extract(epoch from p_date)::bigint / 86400)
        - (extract(epoch from (c.created_at at time zone 'Asia/Karachi')::date)::bigint / 86400))
        % c.repeat_days = 0
    else
      extract(day from p_date) = c.repeat_monthly_day
  end
  from public.chores c
  where c.id = p_chore and c.active;
$$;

-- Rotation default for a rotating chore: active members by join order, offset
-- per chore so two rotating chores don't always land on the same person.
create function public.rotation_assignment(p_chore uuid, p_date date)
returns uuid
language sql stable security definer set search_path = public as $$
  with c as (
    select household_id, rotation_offset from public.chores where id = p_chore
  ), m as (
    select m.id, row_number() over (order by m.rotation_order, m.joined_at) - 1 as idx
    from public.members m, c
    where m.household_id = c.household_id and m.active
  )
  select m.id from m, c
  where m.idx = ((extract(epoch from p_date)::bigint / 86400) + c.rotation_offset) % (select count(*) from m);
$$;

create function public.assignee_for(p_chore uuid, p_date date)
returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select ca.member_id from public.chore_assignments ca
     where ca.chore_id = p_chore and ca.on_date = p_date),
    case c.rotate
      when true then public.rotation_assignment(p_chore, p_date)
      else c.assignee_member_id
    end
  )
  from public.chores c
  where c.id = p_chore;
$$;

-- ============ RPCs ============

-- The whole no-login flow. Call with the device's claimed auth: returns the
-- household and the caller's member row, creating/joining/reactivating as
-- needed. First device ever also seeds the default motor chores.
create function public.ensure_household(p_name text)
returns table (out_household uuid, out_member uuid, out_created boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.members;
  v_household uuid;
  v_member uuid;
  v_created boolean := false;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if char_length(btrim(p_name)) not between 1 and 30 then raise exception 'invalid name'; end if;

  select * into v_existing from public.members m where m.auth_uid = v_uid;
  if found then
    if not v_existing.active then
      update public.members m set active = true, name = btrim(p_name) where m.id = v_existing.id;
    end if;
    return query select v_existing.household_id, v_existing.id, false;
    return;
  end if;

  select h.id into v_household from public.households h order by h.created_at limit 1;
  if v_household is null then
    insert into public.households (id) values (default) returning id into v_household;
    insert into public.chores (household_id, title, rotate, strict, repeat_days, time_of_day, duration_minutes, rotation_offset)
      values (v_household, 'Turn on the motor', true, true, 1, '10:00', 10, 0);
    v_created := true;
  end if;

  insert into public.members (household_id, auth_uid, name, rotation_order)
    values (v_household, v_uid, btrim(p_name),
            coalesce((select max(m2.rotation_order) + 1 from public.members m2 where m2.household_id = v_household), 0))
    returning id into v_member;

  return query select v_household, v_member, v_created;
end $$;

create function public.create_chore(
  p_title text, p_note text, p_assignee uuid, p_rotate boolean, p_strict boolean,
  p_due_at timestamptz, p_repeat_days int, p_repeat_monthly_day int, p_time_of_day time,
  p_duration_minutes int, p_amount numeric
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_household uuid;
  v_member uuid;
  v_offset int;
  v_chore uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if char_length(btrim(p_title)) not between 1 and 80 then raise exception 'invalid title'; end if;
  if (p_due_at is not null)::int + (p_repeat_days is not null)::int + (p_repeat_monthly_day is not null)::int <> 1 then
    raise exception 'exactly one of due date / repeat days / monthly day';
  end if;
  if p_assignee is null and coalesce(p_rotate, false) = false then raise exception 'chore needs a person or rotating'; end if;
  if p_assignee is not null and coalesce(p_rotate, false) then raise exception 'rotating chores take no person'; end if;

  select m.id, m.household_id into v_member, v_household
  from public.members m where m.auth_uid = v_uid and m.active;
  if v_member is null then raise exception 'not a member of any household'; end if;
  if p_assignee is not null and not exists (
    select 1 from public.members m2 where m2.id = p_assignee and m2.household_id = v_household and m2.active
  ) then raise exception 'assignee is not in this household'; end if;

  select coalesce(max(c.rotation_offset), -1) + 1 into v_offset
  from public.chores c where c.household_id = v_household and c.rotate;

  insert into public.chores (
    household_id, title, note, assignee_member_id, rotate, rotation_offset, strict,
    due_at, repeat_days, repeat_monthly_day, time_of_day, duration_minutes, amount, created_by
  ) values (
    v_household, btrim(p_title), nullif(btrim(coalesce(p_note, '')), ''),
    p_assignee, coalesce(p_rotate, false), case when coalesce(p_rotate, false) then v_offset else 0 end,
    coalesce(p_strict, false), p_due_at, p_repeat_days, p_repeat_monthly_day,
    coalesce(p_time_of_day, '10:00'), p_duration_minutes, p_amount, v_member
  )
  returning id into v_chore;
  return v_chore;
end $$;

-- Mark an occurrence started; for duration chores (the motor) atomically spawn
-- a strict one-off close chore for the starter. Returns the close chore id or null.
create function public.start_chore(p_chore uuid, p_on_date date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c public.chores;
  v_me uuid;
  v_event uuid;
  v_spawn uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into c from public.chores ch where ch.id = p_chore;
  if not found then raise exception 'chore not found'; end if;

  select m.id into v_me from public.members m
  where m.auth_uid = v_uid and m.household_id = c.household_id and m.active;
  if v_me is null then raise exception 'not a member of this household'; end if;

  insert into public.chore_events (household_id, chore_id, on_date, status, started_at, started_by)
    values (c.household_id, p_chore, p_on_date, 'started', now(), v_me)
    on conflict (chore_id, on_date) do update
      set status = 'started', started_at = now(), started_by = v_me
    returning id into v_event;

  if c.duration_minutes is not null then
    delete from public.chores ch where ch.spawned_from = v_event;
    insert into public.chores (
      household_id, title, assignee_member_id, strict, due_at, spawned_from, created_by
    ) values (
      c.household_id, 'Close: ' || c.title, v_me, true,
      now() + make_interval(mins => c.duration_minutes), v_event, v_me
    )
    returning id into v_spawn;
  end if;
  return v_spawn;
end $$;

-- Complete an occurrence. Completing a spawned close chore also stamps its
-- parent occurrence done (the motor ran and was closed).
create function public.complete_chore(p_chore uuid, p_on_date date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c public.chores;
  v_me uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into c from public.chores ch where ch.id = p_chore;
  if not found then raise exception 'chore not found'; end if;

  select m.id into v_me from public.members m
  where m.auth_uid = v_uid and m.household_id = c.household_id and m.active;
  if v_me is null then raise exception 'not a member of this household'; end if;

  insert into public.chore_events (household_id, chore_id, on_date, status, done_at, done_by)
    values (c.household_id, p_chore, p_on_date, 'done', now(), v_me)
    on conflict (chore_id, on_date) do update
      set status = 'done', done_at = now(), done_by = v_me;

  if c.spawned_from is not null then
    update public.chore_events e
    set status = 'done', done_at = now(), done_by = v_me
    where e.id = c.spawned_from;
  end if;
end $$;

create function public.skip_chore(p_chore uuid, p_on_date date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_household uuid;
  v_me uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select m.id, m.household_id into v_me, v_household from public.members m
  where m.auth_uid = v_uid and m.active;
  if v_me is null then raise exception 'not a member of any household'; end if;

  insert into public.chore_events (household_id, chore_id, on_date, status, done_at, done_by)
    values (v_household, p_chore, p_on_date, 'skipped', now(), v_me)
    on conflict (chore_id, on_date) do update
      set status = 'skipped', done_at = now(), done_by = v_me;
end $$;

-- Two-way swap on one chore: accepter covers the requester's occurrence, the
-- requester repays by taking the accepter's next occurrence of that chore.
create function public.accept_swap(p_request_id uuid)
returns table (out_swap_date date, out_chore uuid, out_covered_by uuid, out_payback_date date, out_payback_by uuid)
language plpgsql security definer set search_path = public as $$
declare
  r public.swap_requests;
  v_me uuid;
  v_d2 date;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select * into r from public.swap_requests sr where sr.id = p_request_id;
  if not found then raise exception 'request not found'; end if;
  if r.status <> 'pending' then raise exception 'request is not pending'; end if;
  if r.on_date < (now() at time zone 'Asia/Karachi')::date then raise exception 'request date has passed'; end if;

  select m.id into v_me from public.members m
  where m.auth_uid = auth.uid() and m.household_id = r.household_id and m.active;
  if v_me is null then raise exception 'not a member of this household'; end if;
  if v_me = r.from_member_id then raise exception 'cannot accept your own request'; end if;
  if r.to_member_id is not null and r.to_member_id <> v_me then raise exception 'request addressed to someone else'; end if;
  if not public.occurs_on(r.chore_id, r.on_date) then raise exception 'chore does not occur that day'; end if;

  select d::date into v_d2
  from generate_series((r.on_date + 1)::timestamp, (r.on_date + 60)::timestamp, interval '1 day') d
  where public.occurs_on(r.chore_id, d::date)
    and public.assignee_for(r.chore_id, d::date) = v_me
    and d::date <> r.on_date
  order by d
  limit 1;

  if v_d2 is null then raise exception 'no upcoming occurrence found to repay the swap'; end if;

  insert into public.chore_assignments (household_id, chore_id, on_date, member_id)
  values (r.household_id, r.chore_id, r.on_date, v_me), (r.household_id, r.chore_id, v_d2, r.from_member_id)
  on conflict (chore_id, on_date) do update set member_id = excluded.member_id;

  update public.swap_requests sr
  set status = 'accepted', resolved_at = now(), resolved_by = v_me
  where sr.id = p_request_id;

  return query select r.on_date, r.chore_id, v_me, v_d2, r.from_member_id;
end $$;

create function public.cancel_swap(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select m.id into v_me from public.members m where m.auth_uid = auth.uid();
  update public.swap_requests sr
  set status = 'canceled', resolved_at = now(), resolved_by = v_me
  where sr.id = p_request_id and sr.from_member_id = v_me and sr.status = 'pending';
  if not found then raise exception 'cannot cancel this request'; end if;
end $$;

-- Anon keep-alive target for the GitHub Action so the free tier never idles out.
create function public.ping()
returns timestamptz
language sql security definer set search_path = public as $$
  select now();
$$;

-- ============ row level security ============

alter table public.chores enable row level security;
alter table public.chore_events enable row level security;
alter table public.chore_assignments enable row level security;
alter table public.swap_requests enable row level security;
alter table public.purchases enable row level security;

create policy chores_read on public.chores for select using (public.is_member(household_id));
create policy chores_insert on public.chores for insert with check (public.is_member(household_id));
create policy chores_update on public.chores for update using (public.is_member(household_id)) with check (public.is_member(household_id));
-- no delete policy: archive with active=false; stale spawned chores are cleaned by start_chore

create policy events_read on public.chore_events for select using (public.is_member(household_id));
create policy events_insert on public.chore_events for insert with check (public.is_member(household_id));
create policy events_update on public.chore_events for update using (public.is_member(household_id)) with check (public.is_member(household_id));

create policy chore_assignments_read on public.chore_assignments for select using (public.is_member(household_id));
-- writes only via accept_swap (security definer), like v1 assignments

create policy swaps_read on public.swap_requests for select using (public.is_member(household_id));
create policy swaps_insert on public.swap_requests for insert with check (
  public.is_member(household_id)
  and from_member_id in (select m.id from public.members m where m.auth_uid = auth.uid())
);

create policy purchases_read on public.purchases for select using (public.is_member(household_id));
create policy purchases_insert on public.purchases for insert with check (public.is_member(household_id));
create policy purchases_delete on public.purchases for delete using (public.is_member(household_id));

-- ============ realtime ============

do $$
begin
  alter publication supabase_realtime add table public.chores;
  alter publication supabase_realtime add table public.chore_events;
  alter publication supabase_realtime add table public.chore_assignments;
  alter publication supabase_realtime add table public.swap_requests;
  alter publication supabase_realtime add table public.purchases;
exception
  when duplicate_object then null;
end $$;
