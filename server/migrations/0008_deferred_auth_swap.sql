-- claim_member swaps the auth accounts of two member rows (the claimer's and
-- the picked one's). A plain unique index checks after every statement, and
-- each half of a swap duplicates the other row's value — so the swap needs the
-- check deferred to commit. (The 0007 update order also violated the unique
-- index before swapping; this body fixes that.)

alter table public.members drop constraint members_auth_uid_key;
alter table public.members add constraint members_auth_uid_key unique (auth_uid) deferrable initially immediate;

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

  -- the unique index is deferred: both rows flip inside this transaction and
  -- the constraint fires at commit, when the trade is complete
  set constraints members_auth_uid_key deferred;
  v_spare := v_target.auth_uid;
  update public.members m set auth_uid = v_spare where m.id = v_mine;
  update public.members m set auth_uid = v_uid where m.id = v_target.id;
  return query select v_target.household_id, v_target.id;
end $$;

-- keep 0007's grants intact through the re-create
revoke execute on function public.claim_member(uuid) from public;
grant execute on function public.claim_member(uuid) to authenticated, service_role;
