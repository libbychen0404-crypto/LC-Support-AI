import { getSupabaseServiceRoleClient } from './supabase';
import type { CreateAuditLogInput, AuditStorageAdapter } from './auditStorage';
import type { SupportSupabaseClient } from './storageSupabase';
import type { AuditLogRecord, AuditStructuredValue } from './types';

type AuditLogRow = {
  id: string;
  case_id: string | null;
  customer_id: string | null;
  actor_type: AuditLogRecord['actorType'];
  actor_id: string | null;
  action_type: AuditLogRecord['actionType'];
  action_subtype: AuditLogRecord['actionSubtype'];
  previous_value: AuditStructuredValue | null;
  new_value: AuditStructuredValue | null;
  metadata: AuditStructuredValue | null;
  source: AuditLogRecord['source'];
  message_id: string | null;
  timeline_item_id: string | null;
  request_id: string | null;
  created_at: string;
};

const AUDIT_LOG_COLUMNS = `
  id,
  case_id,
  customer_id,
  actor_type,
  actor_id,
  action_type,
  action_subtype,
  previous_value,
  new_value,
  metadata,
  source,
  message_id,
  timeline_item_id,
  request_id,
  created_at
`
  .replace(/\s+/g, ' ')
  .trim();

export function mapAuditLogRow(row: AuditLogRow): AuditLogRecord {
  return {
    id: row.id,
    caseId: row.case_id,
    customerId: row.customer_id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    actionType: row.action_type,
    actionSubtype: row.action_subtype,
    previousValue: row.previous_value ?? null,
    newValue: row.new_value ?? null,
    metadata: row.metadata ?? {},
    source: row.source,
    messageId: row.message_id,
    timelineItemId: row.timeline_item_id,
    requestId: row.request_id,
    createdAt: row.created_at
  };
}

function toAuditLogRow(input: CreateAuditLogInput) {
  return {
    case_id: input.caseId,
    customer_id: input.customerId,
    actor_type: input.actorType,
    actor_id: input.actorId,
    action_type: input.actionType,
    action_subtype: input.actionSubtype ?? null,
    previous_value: input.previousValue ?? null,
    new_value: input.newValue ?? null,
    metadata: input.metadata ?? {},
    source: input.source,
    message_id: input.messageId ?? null,
    timeline_item_id: input.timelineItemId ?? null,
    request_id: input.requestId ?? null,
    created_at: input.createdAt ?? new Date().toISOString()
  };
}

export function createSupabaseAuditStorageAdapter(client: SupportSupabaseClient = getSupabaseServiceRoleClient()): AuditStorageAdapter {
  const supabase = client;

  return {
    async appendAuditLog(input) {
      const { data, error } = await supabase
        .from('audit_logs')
        .insert(toAuditLogRow(input))
        .select(AUDIT_LOG_COLUMNS)
        .single<AuditLogRow>();

      if (error) throw error;
      return mapAuditLogRow(data);
    }
  };
}

export async function listAuditLogsForCase(
  caseId: string,
  client: SupportSupabaseClient = getSupabaseServiceRoleClient()
): Promise<AuditLogRecord[]> {
  const { data, error } = await client
    .from('audit_logs')
    .select(AUDIT_LOG_COLUMNS)
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  const rows = ((data ?? []) as unknown[]) as AuditLogRow[];
  return rows.map((row) => mapAuditLogRow(row));
}
