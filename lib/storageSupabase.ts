import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleClient } from './supabase';
import type { CaseListScope, CreateCaseInput, PersistedCase, PersistedCustomer, SupportStorageAdapter } from './storage';
import type {
  CaseFieldKey,
  CollectedFields,
  ContactMethod,
  CustomerDirectoryItem,
  CustomerProfile
} from './types';

type CustomerRow = {
  id: string;
  external_customer_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  last_seen_at: string;
};

type CaseRow = {
  id: string;
  customer_id: string;
  issue_type: PersistedCase['issueType'];
  status: PersistedCase['status'];
  stage: PersistedCase['stage'];
  escalation_state: PersistedCase['escalationState'];
  handoff_status: PersistedCase['handoffStatus'];
  assigned_human_agent: string | null;
  handoff_requested_at: string | null;
  handoff_contact_method: ContactMethod | null;
  handoff_callback_window: string | null;
  handoff_urgency_reason: string | null;
  handoff_additional_details: string | null;
  priority: PersistedCase['priority'];
  assigned_to: string | null;
  eta_or_expected_update_time: string | null;
  internal_note: string | null;
  resolution_note: string | null;
  case_note: string | null;
  customer_update: string | null;
  problem_statement: string;
  summary: string;
  next_action: string;
  confirmed: boolean;
  required_fields: string[] | null;
  pending_field: string | null;
  messages: PersistedCase['messages'];
  timeline: PersistedCase['timeline'];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  is_open: boolean;
};

type CollectedFieldRow = {
  field_key: string;
  field_value: string;
};

export type SupportSupabaseClient = Pick<SupabaseClient, 'from'>;

const CASE_COLUMNS = `
  id,
  customer_id,
  issue_type,
  status,
  stage,
  escalation_state,
  handoff_status,
  assigned_human_agent,
  handoff_requested_at,
  handoff_contact_method,
  handoff_callback_window,
  handoff_urgency_reason,
  handoff_additional_details,
  priority,
  assigned_to,
  eta_or_expected_update_time,
  internal_note,
  resolution_note,
  case_note,
  customer_update,
  problem_statement,
  summary,
  next_action,
  confirmed,
  required_fields,
  pending_field,
  messages,
  timeline,
  created_at,
  updated_at,
  archived_at,
  is_open
`
  .replace(/\s+/g, ' ')
  .trim();

export function mapCustomerRow(row: CustomerRow): PersistedCustomer {
  const profile: CustomerProfile = {
    customerId: row.external_customer_id,
    name: row.name ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    lastSeenAt: row.last_seen_at
  };

  return { id: row.id, profile };
}

export function mapCaseRow(row: CaseRow): PersistedCase {
  return {
    caseId: row.id,
    customerStorageId: row.customer_id,
    issueType: row.issue_type ?? null,
    status: row.status,
    stage: row.stage,
    escalationState: row.escalation_state ?? 'Normal',
    handoffStatus: row.handoff_status ?? 'Not Requested',
    assignedHumanAgent: row.assigned_human_agent,
    handoffRequestedAt: row.handoff_requested_at,
    handoffContactMethod: row.handoff_contact_method,
    handoffCallbackWindow: row.handoff_callback_window ?? '',
    handoffUrgencyReason: row.handoff_urgency_reason ?? '',
    handoffAdditionalDetails: row.handoff_additional_details ?? '',
    priority: row.priority,
    assignedTo: row.assigned_to,
    etaOrExpectedUpdateTime: row.eta_or_expected_update_time,
    internalNote: row.internal_note ?? '',
    resolutionNote: row.resolution_note ?? '',
    caseNote: row.case_note ?? '',
    customerUpdate: row.customer_update ?? '',
    problemStatement: row.problem_statement,
    summary: row.summary,
    nextAction: row.next_action,
    confirmed: row.confirmed,
    requiredFields: (row.required_fields ?? []) as PersistedCase['requiredFields'],
    pendingField: row.pending_field as PersistedCase['pendingField'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    messages: row.messages ?? [],
    timeline: row.timeline ?? [],
    isOpen: row.is_open
  };
}

export function toCaseRow(input: CreateCaseInput | PersistedCase) {
  return {
    id: input.caseId,
    customer_id: input.customerStorageId,
    issue_type: input.issueType,
    status: input.status,
    stage: input.stage,
    escalation_state: input.escalationState,
    handoff_status: input.handoffStatus,
    assigned_human_agent: input.assignedHumanAgent,
    handoff_requested_at: input.handoffRequestedAt,
    handoff_contact_method: input.handoffContactMethod,
    handoff_callback_window: input.handoffCallbackWindow,
    handoff_urgency_reason: input.handoffUrgencyReason,
    handoff_additional_details: input.handoffAdditionalDetails,
    priority: input.priority,
    assigned_to: input.assignedTo,
    eta_or_expected_update_time: input.etaOrExpectedUpdateTime,
    internal_note: input.internalNote,
    resolution_note: input.resolutionNote,
    case_note: input.caseNote,
    customer_update: input.customerUpdate,
    problem_statement: input.problemStatement,
    summary: input.summary,
    next_action: input.nextAction,
    confirmed: input.confirmed,
    required_fields: input.requiredFields,
    pending_field: input.pendingField,
    messages: input.messages,
    timeline: input.timeline,
    created_at: input.createdAt,
    updated_at: input.updatedAt,
    archived_at: input.archivedAt ?? null,
    is_open: input.isOpen ?? true
  };
}

function applyCaseArchiveScope<TQuery extends { is(column: string, value: null): TQuery }>(
  query: TQuery,
  scope: CaseListScope = 'hot'
) {
  if (scope === 'all') {
    return query;
  }

  return query.is('archived_at', null);
}

function toCustomerDirectoryItem(customer: PersistedCustomer, customerCases: PersistedCase[]): CustomerDirectoryItem {
  return {
    customerId: customer.profile.customerId,
    name: customer.profile.name,
    email: customer.profile.email,
    phone: customer.profile.phone,
    lastSeenAt: customer.profile.lastSeenAt,
    totalCases: customerCases.length,
    openCaseCount: customerCases.filter((caseRecord) => caseRecord.isOpen).length
  };
}

export function createSupabaseStorageAdapter(client: SupportSupabaseClient = getSupabaseServiceRoleClient()): SupportStorageAdapter {
  const supabase = client;

  return {
    async getCustomerByExternalId(customerId) {
      const { data, error } = await supabase
        .from('customers')
        .select('id, external_customer_id, name, phone, email, last_seen_at')
        .eq('external_customer_id', customerId)
        .maybeSingle<CustomerRow>();

      if (error) throw error;
      return data ? mapCustomerRow(data) : null;
    },

    async getCustomerById(customerStorageId) {
      const { data, error } = await supabase
        .from('customers')
        .select('id, external_customer_id, name, phone, email, last_seen_at')
        .eq('id', customerStorageId)
        .maybeSingle<CustomerRow>();

      if (error) throw error;
      return data ? mapCustomerRow(data) : null;
    },

    async createOrUpdateCustomer(profile) {
      const existingCustomer = await this.getCustomerByExternalId(profile.customerId);

      if (existingCustomer) {
        const { data, error } = await supabase
          .from('customers')
          .update({
            external_customer_id: profile.customerId,
            name: profile.name,
            phone: profile.phone,
            email: profile.email,
            last_seen_at: profile.lastSeenAt
          })
          .eq('id', existingCustomer.id)
          .select('id, external_customer_id, name, phone, email, last_seen_at')
          .single<CustomerRow>();

        if (error) throw error;
        return mapCustomerRow(data);
      }

      const { data, error } = await supabase
        .from('customers')
        .insert({
          external_customer_id: profile.customerId,
          name: profile.name,
          phone: profile.phone,
          email: profile.email,
          last_seen_at: profile.lastSeenAt
        })
        .select('id, external_customer_id, name, phone, email, last_seen_at')
        .single<CustomerRow>();

      if (error) throw error;
      return mapCustomerRow(data);
    },

    async listCustomers() {
      const { data, error } = await supabase
        .from('customers')
        .select('id, external_customer_id, name, phone, email, last_seen_at')
        .order('last_seen_at', { ascending: false });

      if (error) throw error;

      const customerRows = (data ?? []) as CustomerRow[];
      const persistedCustomers = customerRows.map(mapCustomerRow);

      const caseGroups = new Map<string, PersistedCase[]>();
      const allCases = await Promise.all(
        persistedCustomers.map(async (customer) => ({
          customerId: customer.id,
          cases: await this.listCasesForCustomer(customer.id)
        }))
      );

      for (const group of allCases) {
        caseGroups.set(group.customerId, group.cases);
      }

      return persistedCustomers.map((customer) =>
        toCustomerDirectoryItem(customer, caseGroups.get(customer.id) ?? [])
      );
    },

    async getOpenCaseForCustomer(customerStorageId) {
      const { data, error } = await applyCaseArchiveScope(
        supabase
        .from('cases')
        .select(CASE_COLUMNS)
        .eq('customer_id', customerStorageId)
        .eq('is_open', true)
        .order('updated_at', { ascending: false })
        .limit(1),
        'hot'
      ).maybeSingle<CaseRow>();

      if (error) throw error;
      return data ? mapCaseRow(data) : null;
    },

    async listCasesForCustomer(customerStorageId, scope = 'hot') {
      const { data, error } = await applyCaseArchiveScope(
        supabase
        .from('cases')
        .select(CASE_COLUMNS)
        .eq('customer_id', customerStorageId)
        .order('updated_at', { ascending: false }),
        scope
      );

      if (error) throw error;
      return ((data ?? []) as unknown as CaseRow[]).map(mapCaseRow);
    },

    async listOpenCases() {
      const { data, error } = await applyCaseArchiveScope(
        supabase
        .from('cases')
        .select(CASE_COLUMNS)
        .eq('is_open', true)
        .order('updated_at', { ascending: false }),
        'hot'
      );

      if (error) throw error;
      return ((data ?? []) as unknown as CaseRow[]).map(mapCaseRow);
    },

    async getCaseById(caseId) {
      const { data, error } = await supabase.from('cases').select(CASE_COLUMNS).eq('id', caseId).maybeSingle<CaseRow>();

      if (error) throw error;
      return data ? mapCaseRow(data) : null;
    },

    async createCase(input) {
      const { data, error } = await supabase
        .from('cases')
        .insert(toCaseRow(input))
        .select(CASE_COLUMNS)
        .single<CaseRow>();

      if (error) throw error;
      return mapCaseRow(data);
    },

    async updateCase(caseId, caseRecord) {
      const { data, error } = await supabase
        .from('cases')
        .update(toCaseRow(caseRecord))
        .eq('id', caseId)
        .select(CASE_COLUMNS)
        .single<CaseRow>();

      if (error) throw error;
      return mapCaseRow(data);
    },

    async getCollectedFields(caseId) {
      const { data, error } = await supabase
        .from('collected_fields')
        .select('field_key, field_value')
        .eq('case_id', caseId);

      if (error) throw error;

      const fields: CollectedFields = {};
      for (const row of ((data ?? []) as CollectedFieldRow[])) {
        fields[row.field_key as CaseFieldKey] = row.field_value;
      }

      return fields;
    },

    async upsertCollectedField(caseId, field, value) {
      const { error } = await supabase.from('collected_fields').upsert(
        {
          case_id: caseId,
          field_key: field,
          field_value: value
        },
        {
          onConflict: 'case_id,field_key'
        }
      );

      if (error) throw error;
    },

    async clearCollectedFields(caseId) {
      const { error } = await supabase.from('collected_fields').delete().eq('case_id', caseId);
      if (error) throw error;
    },

    async archiveOpenCasesForCustomer(customerStorageId) {
      const { error } = await supabase
        .from('cases')
        .update({
          is_open: false,
          status: 'Closed',
          updated_at: new Date().toISOString()
        })
        .eq('customer_id', customerStorageId)
        .is('archived_at', null)
        .eq('is_open', true);

      if (error) throw error;
    },

    async archiveCase(caseId) {
      const existingCase = await this.getCaseById(caseId);
      if (!existingCase) return null;

      const { data, error } = await supabase
        .from('cases')
        .update({
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', caseId)
        .select(CASE_COLUMNS)
        .maybeSingle<CaseRow>();

      if (error) throw error;
      return data ? mapCaseRow(data) : null;
    },

    async deleteCustomerByExternalId(customerId) {
      const existingCustomer = await this.getCustomerByExternalId(customerId);
      if (!existingCustomer) return;

      const { error } = await supabase.from('customers').delete().eq('id', existingCustomer.id);
      if (error) throw error;
    }
  };
}
