do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cases'
      and column_name = 'case_type'
  ) then
    execute '
      update cases
      set issue_type = case_type
      where issue_type is null
        and case_type is not null
    ';

    execute '
      alter table cases
      drop column case_type
    ';
  end if;
end $$;

alter table if exists customers
  alter column external_customer_id set not null;

create unique index if not exists customers_external_customer_id_key
  on customers(external_customer_id);

create unique index if not exists cases_one_open_case_per_customer
  on cases(customer_id)
  where is_open = true;

create index if not exists collected_fields_case_id_idx
  on collected_fields(case_id);
