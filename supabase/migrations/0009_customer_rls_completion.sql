drop policy if exists "customers_insert_own_only" on public.customers;
create policy "customers_insert_own_only"
  on public.customers
  for insert
  to authenticated
  with check (
    external_customer_id is not null
    and external_customer_id <> ''
    and external_customer_id = (
      select external_customer_id
      from public.customers
      where id = public.current_customer_storage_id()
      limit 1
    )
  );

drop policy if exists "collected_fields_delete_own_or_agent" on public.collected_fields;
create policy "collected_fields_delete_own_or_agent"
  on public.collected_fields
  for delete
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
