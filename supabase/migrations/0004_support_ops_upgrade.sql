alter table if exists cases
  add column if not exists priority text not null default 'Medium',
  add column if not exists assigned_to text,
  add column if not exists eta_or_expected_update_time timestamptz,
  add column if not exists internal_note text not null default '',
  add column if not exists resolution_note text not null default '',
  add column if not exists case_note text not null default '',
  add column if not exists customer_update text not null default '';

create index if not exists cases_customer_updated_idx
  on cases(customer_id, updated_at desc);
