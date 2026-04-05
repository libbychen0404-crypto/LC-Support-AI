create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  actor_type text not null check (actor_type in ('customer', 'agent', 'system')),
  actor_id text,
  action_type text not null,
  action_subtype text,
  previous_value jsonb,
  new_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  source text not null check (source in ('customer_workspace', 'admin_panel', 'system', 'ai')),
  message_id text,
  timeline_item_id text,
  request_id text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_logs_case_id_idx
  on public.audit_logs(case_id);

create index if not exists audit_logs_customer_id_idx
  on public.audit_logs(customer_id);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs(created_at desc);

create index if not exists audit_logs_actor_idx
  on public.audit_logs(actor_type, actor_id);

create index if not exists audit_logs_action_type_idx
  on public.audit_logs(action_type);
