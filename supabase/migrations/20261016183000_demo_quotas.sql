-- Atomic daily quotas for the unpaid surfaces (demo search, house-purse bids).
-- Replaces per-instance in-memory counters, which raced under concurrency and
-- reset on cold starts.

create table if not exists almoneda.demo_quotas (
  key text primary key,
  day date not null,
  n integer not null default 0
);

-- Atomically increment today's counter and report whether a slot was
-- available. One round-trip, no read-then-write race.
create or replace function almoneda.quota_take(p_key text, p_limit integer)
returns boolean
language plpgsql
as $$
declare
  new_n integer;
begin
  insert into almoneda.demo_quotas (key, day, n)
  values (p_key, current_date, 1)
  on conflict (key) do update
    set day = case when almoneda.demo_quotas.day < current_date then current_date else almoneda.demo_quotas.day end,
        n   = case when almoneda.demo_quotas.day < current_date then 1 else almoneda.demo_quotas.n + 1 end
  returning n into new_n;
  return new_n <= p_limit;
end;
$$;

-- Release a reserved slot (e.g. a bid that never reached payment).
create or replace function almoneda.quota_give(p_key text)
returns void
language sql
as $$
  update almoneda.demo_quotas set n = greatest(n - 1, 0) where key = p_key;
$$;

grant execute on function almoneda.quota_take(text, integer) to service_role;
grant execute on function almoneda.quota_give(text) to service_role;
