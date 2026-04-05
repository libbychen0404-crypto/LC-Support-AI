alter table if exists customers
  add column if not exists external_customer_id text,
  add column if not exists name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists last_seen_at timestamptz default timezone('utc', now()),
  add column if not exists created_at timestamptz default timezone('utc', now()),
  add column if not exists updated_at timestamptz default timezone('utc', now());

update customers
set external_customer_id = id::text
where external_customer_id is null;

alter table if exists customers
  alter column external_customer_id set not null;

create unique index if not exists customers_external_customer_id_key
  on customers(external_customer_id);

alter table if exists cases
  add column if not exists issue_type text,
  add column if not exists problem_statement text default '',
  add column if not exists summary text default '',
  add column if not exists next_action text default '',
  add column if not exists confirmed boolean default false,
  add column if not exists required_fields text[] default '{}',
  add column if not exists pending_field text,
  add column if not exists messages jsonb default '[]'::jsonb,
  add column if not exists timeline jsonb default '[]'::jsonb,
  add column if not exists is_open boolean default true,
  add column if not exists created_at timestamptz default timezone('utc', now()),
  add column if not exists updated_at timestamptz default timezone('utc', now());

update cases
set
  problem_statement = coalesce(problem_statement, ''),
  summary = coalesce(summary, ''),
  next_action = coalesce(next_action, ''),
  confirmed = coalesce(confirmed, false),
  required_fields = coalesce(required_fields, '{}'),
  messages = coalesce(messages, '[]'::jsonb),
  timeline = coalesce(timeline, '[]'::jsonb),
  is_open = coalesce(is_open, true),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, timezone('utc', now()));

create unique index if not exists cases_one_open_case_per_customer
  on cases(customer_id)
  where is_open = true;

alter table if exists collected_fields
  add column if not exists updated_at timestamptz default timezone('utc', now());

create index if not exists collected_fields_case_id_idx on collected_fields(case_id);
