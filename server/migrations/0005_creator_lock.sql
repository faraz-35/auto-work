-- Creator lock: a chore belongs to whoever created it. Only the creator may
-- edit or stop their chore (occurrences — start/done/skip/swaps — stay open to
-- everyone). The app hides the menu on other people's chores; RLS enforces it.

-- Legacy chores were seeded by ensure_household before any member existed, so
-- their created_by is null and nobody could own them. Hand them to the
-- household's first member (the one who created the household).
update public.chores c
set created_by = (
  select m.id from public.members m
  where m.household_id = c.household_id
  order by m.joined_at, m.rotation_order
  limit 1
)
where c.created_by is null;

-- Going forward, seed the motor chore after the first member exists so it has
-- an owner from day one.
create or replace function public.ensure_household(p_name text)
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
    v_created := true;
  end if;

  insert into public.members (household_id, auth_uid, name, rotation_order)
    values (v_household, v_uid, btrim(p_name),
            coalesce((select max(m2.rotation_order) + 1 from public.members m2 where m2.household_id = v_household), 0))
    returning id into v_member;

  if v_created then
    insert into public.chores (household_id, title, rotate, strict, repeat_days, time_of_day, duration_minutes, rotation_offset, created_by)
      values (v_household, 'Turn on the motor', true, true, 1, '10:00', 10, 0, v_member);
  end if;

  return query select v_household, v_member, v_created;
end $$;

-- The lock itself. The owning member is by construction in the chore's
-- household, and must still be active (a member who left loses the pen).
drop policy chores_update on public.chores;
create policy chores_update on public.chores for update
using (
  created_by in (select m.id from public.members m where m.auth_uid = auth.uid() and m.active)
) with check (
  created_by in (select m.id from public.members m where m.auth_uid = auth.uid() and m.active)
);

-- The 11-arg create_chore predates rotation pools and weekdays; the 13-arg
-- version defaults both, so keeping both makes every short call ambiguous.
drop function public.create_chore(
  text, text, uuid, boolean, boolean, timestamptz, int, int, time, int, numeric
);
