-- Chores lose money and duration: the app no longer sends p_amount or
-- p_duration_minutes, so both become optional. Signature and body are
-- unchanged otherwise; old clients that still send the fields are unaffected.
CREATE OR REPLACE FUNCTION public.create_chore(p_title text, p_note text, p_assignee uuid, p_rotate boolean, p_strict boolean, p_due_at timestamp with time zone, p_repeat_days integer, p_repeat_monthly_day integer, p_time_of_day time without time zone, p_duration_minutes integer DEFAULT NULL, p_amount numeric DEFAULT NULL, p_rotation_members uuid[] DEFAULT NULL::uuid[], p_repeat_weekdays smallint DEFAULT NULL::smallint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;
