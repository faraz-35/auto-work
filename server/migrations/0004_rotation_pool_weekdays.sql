-- When-editor v2: rotation can be limited to a chosen pool of people, and
-- repeats gain a weekly kind (picked weekdays). Both additive — nulls keep
-- the old behavior (rotate over everyone active / no weekly schedule).

alter table public.chores
  add column rotation_members uuid[],
  add column repeat_weekdays smallint check (repeat_weekdays between 1 and 127);

alter table public.chores drop constraint chore_schedule_one_way;
alter table public.chores add constraint chore_schedule_one_way check (
  (due_at is not null)::int + (repeat_days is not null)::int
    + (repeat_weekdays is not null)::int + (repeat_monthly_day is not null)::int = 1
);

create or replace function public.occurs_on(p_chore uuid, p_date date)
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
    when c.repeat_weekdays is not null then
      (c.repeat_weekdays::int & (1 << extract(dow from p_date)::int)) <> 0
    else
      extract(day from p_date) = c.repeat_monthly_day
  end
  from public.chores c
  where c.id = p_chore and c.active;
$$;

-- Rotation pool: when the chore lists rotation_members, only those (still
-- active) members take turns; null keeps everyone in the household.
create or replace function public.rotation_assignment(p_chore uuid, p_date date)
returns uuid
language sql stable security definer set search_path = public as $$
  with c as (
    select household_id, rotation_offset, rotation_members from public.chores where id = p_chore
  ), m as (
    select m.id, row_number() over (order by m.rotation_order, m.joined_at) - 1 as idx
    from public.members m, c
    where m.household_id = c.household_id and m.active
      and (c.rotation_members is null or m.id = any(c.rotation_members))
  )
  select m.id from m, c
  where m.idx = ((extract(epoch from p_date)::bigint / 86400) + c.rotation_offset)
    % nullif((select count(*) from m), 0);
$$;

create or replace function public.create_chore(
  p_title text, p_note text, p_assignee uuid, p_rotate boolean, p_strict boolean,
  p_due_at timestamptz, p_repeat_days int, p_repeat_monthly_day int, p_time_of_day time,
  p_duration_minutes int, p_amount numeric,
  p_rotation_members uuid[] default null, p_repeat_weekdays smallint default null
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
  if (p_due_at is not null)::int + (p_repeat_days is not null)::int
    + (p_repeat_weekdays is not null)::int + (p_repeat_monthly_day is not null)::int <> 1 then
    raise exception 'exactly one of due date / repeat days / weekdays / monthly day';
  end if;
  if p_assignee is null and coalesce(p_rotate, false) = false then raise exception 'chore needs a person or rotating'; end if;
  if p_assignee is not null and coalesce(p_rotate, false) then raise exception 'rotating chores take no person'; end if;
  if p_rotation_members is not null and not coalesce(p_rotate, false) then raise exception 'a rotation pool needs rotate'; end if;
  if p_repeat_weekdays is not null and coalesce(p_due_at is not null, false) then raise exception 'weekdays are a repeat schedule'; end if;

  select m.id, m.household_id into v_member, v_household
  from public.members m where m.auth_uid = v_uid and m.active;
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
end $$;
