create extension if not exists pgcrypto;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  external_customer_id text not null unique,
  name text,
  phone text,
  email text,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists cases (
  id uuid primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  issue_type text,
  status text not null,
  stage text not null,
  escalation_state text not null default 'Normal',
  handoff_status text not null default 'Not Requested',
  assigned_human_agent text,
  handoff_requested_at timestamptz,
  handoff_contact_method text,
  handoff_callback_window text,
  handoff_urgency_reason text,
  handoff_additional_details text,
  priority text not null default 'Medium',
  assigned_to text,
  eta_or_expected_update_time timestamptz,
  internal_note text not null default '',
  resolution_note text not null default '',
  case_note text not null default '',
  customer_update text not null default '',
  problem_statement text not null default '',
  summary text not null default '',
  next_action text not null default '',
  confirmed boolean not null default false,
  required_fields text[] not null default '{}',
  pending_field text,
  messages jsonb not null default '[]'::jsonb,
  timeline jsonb not null default '[]'::jsonb,
  is_open boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists cases_one_open_case_per_customer
  on cases(customer_id)
  where is_open = true;

create index if not exists cases_customer_updated_idx on cases(customer_id, updated_at desc);

create table if not exists collected_fields (
  case_id uuid not null references cases(id) on delete cascade,
  field_key text not null,
  field_value text not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (case_id, field_key)
);

create index if not exists collected_fields_case_id_idx on collected_fields(case_id);
