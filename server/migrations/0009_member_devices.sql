-- Many devices per person. The old model (members.auth_uid unique) made a
-- claim TRADE identities: picking a name on a second phone pushed the first
-- phone out of its row, so the who-are-you screen came back on every open.
-- Bindings now live in member_devices (auth_uid -> member_id): a claim
-- upserts one row, two phones can be the same person, and no other device
-- ever moves.

create table public.member_devices (
  auth_uid uuid primary key references auth.users(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade
);

alter table public.member_devices enable row level security;
-- no policies: only security definer functions touch it.

-- every existing binding moves as-is
insert into public.member_devices (auth_uid, member_id)
select auth_uid, id from public.members;

-- policies that name auth_uid directly must go before the column does;
-- they come back below, written against my_member_id()
drop policy if exists members_update_self on public.members;
drop policy if exists chores_update on public.chores;
drop policy if exists swaps_insert on public.swap_requests;

alter table public.members drop column auth_uid;

-- the one lookup every check below is written against
create or replace function public.my_member_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select d.member_id from public.member_devices d where d.auth_uid = auth.uid()
$$;

create or replace function public.is_member(p_household uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members m
    where m.id = public.my_member_id() and m.household_id = p_household and m.active
  );
$$;

-- claim: bind this device to the picked person. Upsert — re-claiming moves
-- only this device.
create or replace function public.claim_member(p_member uuid)
returns table (out_household uuid, out_member uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_target public.members;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into v_target from public.members m
  where m.id = p_member and m.active
    and m.household_id = (select h.id from public.households h order by h.created_at limit 1);
  if not found then raise exception 'pick someone from the list'; end if;

  insert into public.member_devices (auth_uid, member_id) values (v_uid, v_target.id)
  on conflict (auth_uid) do update set member_id = excluded.member_id;

  return query select v_target.household_id, v_target.id;
end $$;

-- legacy shim for APKs that predate the picker: a pure lookup, never creates
create or replace function public.ensure_household(p_name text)
returns table (out_household uuid, out_member uuid, out_created boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_member uuid;
  v_household uuid;
begin
  select m.id, m.household_id into v_member, v_household
  from public.members m
  where m.id = public.my_member_id() and m.active;
  if not found then raise exception 'not a member yet — update the app'; end if;
  return query select v_household, v_member, false;
end $$;

-- ============ RPCs: same behavior, member found via my_member_id() ============

create or replace function public.create_chore(p_title text, p_note text, p_assignee uuid, p_rotate boolean, p_strict boolean, p_due_at timestamp with time zone, p_repeat_days integer, p_repeat_monthly_day integer, p_time_of_day time without time zone, p_duration_minutes integer DEFAULT NULL, p_amount numeric DEFAULT NULL, p_rotation_members uuid[] DEFAULT NULL::uuid[], p_repeat_weekdays smallint DEFAULT NULL::smallint)
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_household uuid;
  v_member uuid;
  v_offset int;
  v_chore uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if char_length(btrim(p_title)) not between 1 and 80 then raise exception 'invalid title'; end if;
  if (p_due_at is not null)::int + (p_repeat_days is not null)::int
    + (p_repeat_weekdays is not null)::int + (p_repeat_monthly_day is not null)::int <> 1 then
    raise exception 'exactly one of due date / repeat days / weekdays / monthly day';
  end if;
  if p_assignee is null and coalesce(p_rotate, false) = false then raise exception 'chore needs a person or rotating'; end if;
  if p_assignee is not null and coalesce(p_rotate, false) then raise exception 'rotating chores take no person'; end if;
  if p_rotation_members is not null and not coalesce(p_rotate, false) then raise exception 'a rotation pool needs rotate'; end if;
  if p_repeat_weekdays is not null and coalesce(p_due_at is not null, false) then raise exception 'weekdays are a repeat schedule'; end if;

  select m.id, m.household_id into v_member, v_household
  from public.members m where m.id = public.my_member_id() and m.active;
  if v_member is null then raise exception 'not a member of any household'; end if;
  if p_assignee is not null and not exists (
    select 1 from public.members m2 where m2.id = p_assignee and m2.household_id = v_household and m2.active
  ) then raise exception 'assignee is not in this household'; end if;
  if p_rotation_members is not null and exists (
    select 1 from unnest(p_rotation_members) x(id)
    where not exists (
      select 1 from public.members m2 where m2.id = x.id and m2.household_id = v_household and m2.active
    )
  ) then raise exception 'rotation pool has someone outside this household'; end if;

  select coalesce(max(c.rotation_offset), -1) + 1 into v_offset
  from public.chores c where c.household_id = v_household and c.rotate;

  insert into public.chores (
    household_id, title, note, assignee_member_id, rotate, rotation_offset, strict,
    due_at, repeat_days, repeat_weekdays, repeat_monthly_day, time_of_day,
    duration_minutes, amount, rotation_members, created_by
  ) values (
    v_household, btrim(p_title), nullif(btrim(coalesce(p_note, '')), ''),
    p_assignee, coalesce(p_rotate, false), case when coalesce(p_rotate, false) then v_offset else 0 end,
    coalesce(p_strict, false), p_due_at, p_repeat_days, p_repeat_weekdays, p_repeat_monthly_day,
    coalesce(p_time_of_day, '10:00'), p_duration_minutes, p_amount, p_rotation_members, v_member
  )
  returning id into v_chore;
  return v_chore;
end $function$;

create or replace function public.start_chore(p_chore uuid, p_on_date date)
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
  where m.id = public.my_member_id() and m.household_id = c.household_id and m.active;
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

create or replace function public.complete_chore(p_chore uuid, p_on_date date)
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
  where m.id = public.my_member_id() and m.household_id = c.household_id and m.active;
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

create or replace function public.skip_chore(p_chore uuid, p_on_date date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_household uuid;
  v_me uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select m.household_id into v_household from public.members m
  where m.id = public.my_member_id() and m.active;
  if v_household is null then raise exception 'not a member of any household'; end if;

  insert into public.chore_events (household_id, chore_id, on_date, status, done_at, done_by)
    values (v_household, p_chore, p_on_date, 'skipped', now(), public.my_member_id())
    on conflict (chore_id, on_date) do update
      set status = 'skipped', done_at = now(), done_by = public.my_member_id();
end $$;

create or replace function public.accept_swap(p_request_id uuid)
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
  where m.id = public.my_member_id() and m.household_id = r.household_id and m.active;
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

create or replace function public.cancel_swap(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select public.my_member_id() into v_me;
  update public.swap_requests sr
  set status = 'canceled', resolved_at = now(), resolved_by = v_me
  where sr.id = p_request_id and sr.from_member_id = v_me and sr.status = 'pending';
  if not found then raise exception 'cannot cancel this request'; end if;
end $$;

-- ============ policies back in place ============

-- a member no longer updates their own row from the app (names are set on
-- creation and from the admin side); members_update_self is gone for good
create policy chores_update on public.chores for update
using (
  created_by in (select m.id from public.members m where m.id = public.my_member_id() and m.active)
) with check (
  created_by in (select m.id from public.members m where m.id = public.my_member_id() and m.active)
);

create policy swaps_insert on public.swap_requests for insert with check (
  public.is_member(household_id)
  and from_member_id = public.my_member_id()
);
