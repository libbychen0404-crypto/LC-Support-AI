create table if not exists app_users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('customer', 'agent')),
  customer_id uuid references customers(id) on delete set null,
  agent_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint app_users_customer_mapping_check
    check ((role = 'customer' and customer_id is not null) or role = 'agent')
);

create index if not exists app_users_customer_id_idx on app_users(customer_id);
create index if not exists app_users_role_active_idx on app_users(role, is_active);

create unique index if not exists app_users_unique_customer_mapping_idx
  on app_users(customer_id)
  where customer_id is not null;
