alter table if exists public.app_users
  add column if not exists is_demo boolean not null default false;
