-- almoneda.artwork_meta: searchable metadata mirror over the shared corpus.
-- One row per artwork, base fields copied from mellizo.artworks, tags
-- backfilled from the museums' own bulk data. Powers the full-text leg of
-- hybrid search. The corpus swap (patch16) keeps artwork ids stable, so
-- this table survives it; re-run scripts/backfill-meta.mjs after a swap.

create table if not exists almoneda.artwork_meta (
  artwork_id text primary key,
  source text not null default '',
  title text not null default '',
  artist text not null default '',
  date_text text not null default '',
  medium text not null default '',
  department text not null default '',
  tags text not null default '',
  tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(tags, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(artist, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(medium, '') || ' ' || coalesce(department, '')), 'C')
  ) stored,
  meta_at timestamptz not null default now()
);
create index if not exists artwork_meta_tsv_idx on almoneda.artwork_meta using gin (tsv);

-- The text leg of hybrid retrieval. Service-role only: anonymous callers get
-- the same metadata from mellizo.artworks, but ranked search is the product.
create or replace function almoneda.meta_search(q text, k int default 40)
returns table (artwork_id text, rank real)
language sql stable
security definer
set search_path = almoneda, public
as $$
  select m.artwork_id, ts_rank_cd(m.tsv, qry) as rank
  from almoneda.artwork_meta m,
       websearch_to_tsquery('english', q) qry
  where m.tsv @@ qry
  order by rank desc
  limit least(k, 100);
$$;

grant select on almoneda.artwork_meta to anon, authenticated, service_role;
grant insert, update on almoneda.artwork_meta to service_role;
grant execute on function almoneda.meta_search(text, int) to service_role;
