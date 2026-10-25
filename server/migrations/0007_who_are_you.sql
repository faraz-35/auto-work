-- Identity: a phone picks its person from the household roster. The
-- who-are-you screen lists the active members (household_roster) and binds
-- this device to the picked one (claim_member — the device's auth account and
-- the member's old one swap rows, so every member row keeps exactly one).
-- ensure_household becomes a pure lookup kept only for not-yet-updated APKs:
-- it no longer creates members (no more "Me" rows) or reactivates them.

create or replace function public.household_roster()
returns table (out_member uuid, out_name text)
language sql stable security definer set search_path = public as $$
  select m.id, m.name
  from public.members m
  where m.household_id = (select h.id from public.households h order by h.created_at limit 1)
    and m.active
  order by m.rotation_order, m.joined_at
$$;

create or replace function public.claim_member(p_member uuid)
returns table (out_household uuid, out_member uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_target public.members;
  v_mine uuid;
  v_spare uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into v_target from public.members m
  where m.id = p_member and m.active
    and m.household_id = (select h.id from public.households h order by h.created_at limit 1);
  if not found then raise exception 'pick someone from the list'; end if;

  select m.id into v_mine from public.members m where m.auth_uid = v_uid;
  if v_mine = v_target.id then
    return query select v_target.household_id, v_target.id;
    return;
  end if;

  -- swap accounts so both rows keep exactly one: my account moves onto the
  -- picked row, the picked row's old account lands on my old row
  v_spare := v_target.auth_uid;
  update public.members m set auth_uid = v_uid where m.id = v_target.id;
  if v_mine is not null then
    update public.members m set auth_uid = v_spare where m.id = v_mine;
  end if;
  return query select v_target.household_id, v_target.id;
end $$;

-- no anon: these run only from a signed-in device (functions grant EXECUTE to
-- the pseudo-role public by default, so that is the one to take away)
revoke execute on function public.household_roster() from public;
revoke execute on function public.claim_member(uuid) from public;
grant execute on function public.household_roster() to authenticated, service_role;
grant execute on function public.claim_member(uuid) to authenticated, service_role;

create or replace function public.ensure_household(p_name text)
returns table (out_household uuid, out_member uuid, out_created boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_existing public.members;
begin
  select * into v_existing from public.members m where m.auth_uid = auth.uid();
  if not found then raise exception 'not a member yet — update the app'; end if;
  return query select v_existing.household_id, v_existing.id, false;
end $$;

-- Dad and Kas join on reserved pool accounts (idempotent by name).
insert into public.members (household_id, auth_uid, name, rotation_order)
select h.id, u.id, v.name, v.ord
from (values ('Dad', 5, 'devpool-08@devices.motor.app'),
             ('Kas', 6, 'devpool-09@devices.motor.app')) as v(name, ord, email)
join auth.users u on u.email = v.email
cross join public.households h
where h.id = (select id from public.households order by created_at limit 1)
  and not exists (
    select 1 from public.members m
    where m.household_id = h.id and m.name = v.name
  );

-- Reserve their accounts so claim_device_account never hands them to a
-- stranger who would then be Dad.
update public.device_accounts
set claimed = true, claimed_at = coalesce(claimed_at, now())
where email in ('devpool-08@devices.motor.app', 'devpool-09@devices.motor.app');

-- The auto-joined 'Me' placeholders leave the roster; their phones pick a real
-- name once they update. Not deleted — chores and history still point at them.
update public.members set active = false where name = 'Me';

-- Real chores the placeholder rows created pass to Far, or the creator lock
-- would leave them uneditable forever.
update public.chores c
set created_by = (
  select m.id from public.members m
  where m.household_id = c.household_id and m.name = 'Far'
)
where c.active
  and c.created_by in (select id from public.members where name = 'Me');
