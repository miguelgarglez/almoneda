-- almoneda.meta_tags: staging table for museum-sourced tags (bulk CSV/API
-- dumps land here via scripts/tags-backfill.mjs), then merge into
-- artwork_meta.tags, where the generated tsv picks them up for FTS.
create table if not exists almoneda.meta_tags (
  artwork_id text primary key,
  tags text not null default ''
);
grant insert, update, select on almoneda.meta_tags to service_role;

-- Merge staged tags into the mirror. Idempotent: only touches rows whose
-- tags differ, so re-running after another source finishes is cheap.
update almoneda.artwork_meta m
set tags = t.tags
from almoneda.meta_tags t
where m.artwork_id = t.artwork_id
  and m.tags is distinct from t.tags;
