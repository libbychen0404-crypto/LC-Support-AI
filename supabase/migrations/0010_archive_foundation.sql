alter table if exists public.cases
  add column if not exists archived_at timestamptz;

create index if not exists cases_archived_at_idx
  on public.cases(archived_at);

create index if not exists cases_hot_updated_at_idx
  on public.cases(updated_at desc)
  where archived_at is null;
