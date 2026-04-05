create or replace function public.current_app_user_role()
returns text
language sql
stable
as $$
  select role
  from public.app_users
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1
$$;

create or replace function public.current_customer_storage_id()
returns uuid
language sql
stable
as $$
  select customer_id
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'customer'
    and is_active = true
  limit 1
$$;

create or replace function public.is_active_agent()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.app_users
    where auth_user_id = auth.uid()
      and role = 'agent'
      and is_active = true
  )
$$;

alter table public.app_users enable row level security;
alter table public.customers enable row level security;
alter table public.cases enable row level security;
alter table public.collected_fields enable row level security;

drop policy if exists "app_users_select_own_mapping" on public.app_users;
create policy "app_users_select_own_mapping"
  on public.app_users
  for select
  to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists "customers_select_own_or_agent" on public.customers;
create policy "customers_select_own_or_agent"
  on public.customers
  for select
  to authenticated
  using (
    id = public.current_customer_storage_id()
    or public.is_active_agent()
  );

drop policy if exists "customers_update_own_only" on public.customers;
create policy "customers_update_own_only"
  on public.customers
  for update
  to authenticated
  using (id = public.current_customer_storage_id())
  with check (id = public.current_customer_storage_id());

drop policy if exists "cases_select_own_or_agent" on public.cases;
create policy "cases_select_own_or_agent"
  on public.cases
  for select
  to authenticated
  using (
    customer_id = public.current_customer_storage_id()
    or public.is_active_agent()
  );

drop policy if exists "cases_insert_own_or_agent" on public.cases;
create policy "cases_insert_own_or_agent"
  on public.cases
  for insert
  to authenticated
  with check (
    customer_id = public.current_customer_storage_id()
    or public.is_active_agent()
  );

drop policy if exists "cases_update_own_or_agent" on public.cases;
create policy "cases_update_own_or_agent"
  on public.cases
  for update
  to authenticated
  using (
    customer_id = public.current_customer_storage_id()
    or public.is_active_agent()
  )
  with check (
    customer_id = public.current_customer_storage_id()
    or public.is_active_agent()
  );

drop policy if exists "collected_fields_select_own_or_agent" on public.collected_fields;
create policy "collected_fields_select_own_or_agent"
  on public.collected_fields
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.cases
      where cases.id = collected_fields.case_id
        and (
          cases.customer_id = public.current_customer_storage_id()
          or public.is_active_agent()
        )
    )
  );

drop policy if exists "collected_fields_insert_own_or_agent" on public.collected_fields;
create policy "collected_fields_insert_own_or_agent"
  on public.collected_fields
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.cases
      where cases.id = collected_fields.case_id
        and (
          cases.customer_id = public.current_customer_storage_id()
          or public.is_active_agent()
        )
    )
  );

drop policy if exists "collected_fields_update_own_or_agent" on public.collected_fields;
create policy "collected_fields_update_own_or_agent"
  on public.collected_fields
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.cases
      where cases.id = collected_fields.case_id
        and (
          cases.customer_id = public.current_customer_storage_id()
          or public.is_active_agent()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.cases
      where cases.id = collected_fields.case_id
        and (
          cases.customer_id = public.current_customer_storage_id()
          or public.is_active_agent()
        )
    )
  );
