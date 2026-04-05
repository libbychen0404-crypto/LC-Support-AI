alter table if exists cases
  add column if not exists escalation_state text not null default 'Normal',
  add column if not exists handoff_status text not null default 'Not Requested',
  add column if not exists assigned_human_agent text,
  add column if not exists handoff_requested_at timestamptz,
  add column if not exists handoff_contact_method text,
  add column if not exists handoff_callback_window text,
  add column if not exists handoff_urgency_reason text,
  add column if not exists handoff_additional_details text;

update cases
set escalation_state = coalesce(nullif(escalation_state, ''), 'Normal')
where escalation_state is null or escalation_state = '';

update cases
set handoff_status = coalesce(nullif(handoff_status, ''), 'Not Requested')
where handoff_status is null or handoff_status = '';

create index if not exists cases_handoff_status_idx on cases(handoff_status);
create index if not exists cases_escalation_state_idx on cases(escalation_state);
