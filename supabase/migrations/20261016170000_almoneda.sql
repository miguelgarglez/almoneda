-- almoneda: the sales ledger and the provenance cache.
create schema if not exists almoneda;

-- Every settled paid call is a lot sold. World-readable (the sales floor is
-- the landing page), inserted only by the server with the service key.
create table if not exists almoneda.sales (
  id bigint generated always as identity primary key,
  payer text not null,
  tx text not null,
  network text not null default 'eip155:84532',
  amount text not null,
  endpoint text not null default 'text',
  query_hint text not null default '',
  artwork_ids text[] not null default '{}',
  latency_ms int,
  created_at timestamptz not null default now()
);
alter table almoneda.sales enable row level security;
create policy "sales are world-readable" on almoneda.sales for select using (true);
create index if not exists sales_created_idx on almoneda.sales (created_at desc);

-- Lazy per-work license verification, filled at serve time from the museums'
-- own APIs and cached forever.
create table if not exists almoneda.provenance (
  artwork_id text primary key,
  source text not null,
  accession text,
  rights text not null default '',
  rights_url text not null default '',
  verified boolean not null default false,
  evidence_url text not null default '',
  fetched_at timestamptz not null default now()
);
alter table almoneda.provenance enable row level security;
create policy "provenance is world-readable" on almoneda.provenance for select using (true);

grant usage on schema almoneda to anon, authenticated, service_role;
grant select on almoneda.sales, almoneda.provenance to anon, authenticated;
grant insert, update, delete on almoneda.sales, almoneda.provenance to service_role;

-- the sales floor streams new lots over realtime
do $$
begin
  execute 'alter publication supabase_realtime add table almoneda.sales';
exception when duplicate_object then null;
end $$;
