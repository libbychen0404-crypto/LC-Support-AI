import type {
  AuditActionSubtype,
  AuditActionType,
  AuditActorType,
  AuditLogSource,
  AuditStructuredValue
} from './types';

export const AUDIT_ACTOR_TYPES = ['customer', 'agent', 'system'] as const satisfies readonly AuditActorType[];

export const AUDIT_LOG_SOURCES = ['customer_workspace', 'admin_panel', 'system', 'ai'] as const satisfies readonly AuditLogSource[];

export const AUDIT_ACTION_TYPES = [
  'case_created',
  'case_status_changed',
  'case_resolved',
  'case_closed',
  'customer_message_sent',
  'customer_field_collected',
  'customer_case_confirmed',
  'customer_case_correction_requested',
  'customer_handoff_requested',
  'agent_case_assigned',
  'agent_case_taken_over',
  'agent_message_sent',
  'agent_status_changed',
  'agent_priority_changed',
  'agent_internal_note_added',
  'agent_internal_note_updated',
  'agent_resolution_note_added',
  'agent_customer_update_changed',
  'agent_handoff_status_changed',
  'agent_escalation_changed',
  'system_case_classified',
  'system_stage_transitioned',
  'system_status_transitioned',
  'system_summary_updated',
  'system_next_action_updated',
  'system_ai_case_note_generated',
  'system_handoff_state_initialized'
] as const satisfies readonly AuditActionType[];

export const AUDIT_ACTION_SUBTYPES = [
  'status',
  'priority',
  'handoff',
  'message',
  'field_collection',
  'classification',
  'summary',
  'next_action',
  'escalation',
  'resolution',
  'assignment',
  'internal_note',
  'customer_update',
  'case_note',
  'stage'
] as const satisfies readonly AuditActionSubtype[];

export type AuditEventDefinition = {
  actionType: AuditActionType;
  actorType: AuditActorType;
  defaultSource: AuditLogSource;
  actionSubtype?: AuditActionSubtype;
  description: string;
};

export const AUDIT_EVENT_DEFINITIONS: Record<AuditActionType, AuditEventDefinition> = {
  case_created: {
    actionType: 'case_created',
    actorType: 'system',
    defaultSource: 'system',
    description: 'A new support case was created.'
  },
  case_status_changed: {
    actionType: 'case_status_changed',
    actorType: 'system',
    defaultSource: 'system',
    actionSubtype: 'status',
    description: 'The case status changed.'
  },
  case_resolved: {
    actionType: 'case_resolved',
    actorType: 'agent',
    defaultSource: 'admin_panel',
    actionSubtype: 'resolution',
    description: 'The case was marked as resolved.'
  },
  case_closed: {
    actionType: 'case_closed',
    actorType: 'agent',
    defaultSource: 'admin_panel',
    actionSubtype: 'resolution',
    description: 'The case was closed.'
  },
  customer_message_sent: {
    actionType: 'customer_message_sent',
    actorType: 'customer',
    defaultSource: 'customer_workspace',
    actionSubtype: 'message',
    description: 'The customer sent a message into the case thread.'
  },
  customer_field_collected: {
    actionType: 'customer_field_collected',
    actorType: 'customer',
    defaultSource: 'customer_workspace',
    actionSubtype: 'field_collection',
    description: 'The customer provided a structured support field value.'
  },
  customer_case_confirmed: {
    actionType: 'customer_case_confirmed',
    actorType: 'customer',
    defaultSource: 'customer_workspace',
    description: 'The customer confirmed the draft case details.'
  },
  customer_case_correction_requested: {
    actionType: 'customer_case_correction_requested',
    actorType: 'customer',
    defaultSource: 'customer_workspace',
    description: 'The customer requested corrections to the draft case.'
  },
  customer_handoff_requested: {
    actionType: 'customer_handoff_requested',
    actorType: 'customer',
    defaultSource: 'customer_workspace',
    actionSubtype: 'handoff',
    description: 'The customer requested human support.'
  },
  agent_case_assigned: {
    actionType: 'agent_case_assigned',
    actorType: 'agent',
    defaultSource: 'admin_panel',
    actionSubtype: 'assignment',
    description: 'An agent assignment was recorded on the case.'
  },
  agent_case_taken_over: {
    actionType: 'agent_case_taken_over',
    actorType: 'agent',
    defaultSource: 'admin_panel',
    actionSubtype: 'assignment',
    description: 'A human support agent took over the case.'
  },
  agent_message_sent: {
    actionType: 'agent_message_sent',
    actorType: 'agent',
    defaultSource: 'admin_panel',
    actionSubtype: 'message',
    description: 'An agent sent a message into the case thread.'
  },
  agent_status_changed: {
    actionType: 'agent_status_changed',
    actorType: 'agent',
    defaultSource: 'admin_panel',
    actionSubtype: 'status',
    description: 'An agent changed the case status.'
  },
  agent_priority_changed: {
    actionType: 'agent_priority_changed',
    actorType: 'agent',
    defaultSource: 'admin_panel',
    actionSubtype: 'priority',
    description: 'An agent changed the case priority.'
  },
  agent_internal_note_added: {
    actionType: 'agent_internal_note_added',
    actorType: 'agent',
    defaultSource: 'admin_panel',
    actionSubtype: 'internal_note',
    description: 'An internal note was added to the case.'
  },
  agent_internal_note_updated: {
    actionType: 'agent_internal_note_updated',
    actorType: 'agent',
    defaultSource: 'admin_panel',
    actionSubtype: 'internal_note',
    description: 'An internal note on the case was updated.'
  },
  agent_resolution_note_added: {
    actionType: 'agent_resolution_note_added',
    actorType: 'agent',
    defaultSource: 'admin_panel',
    actionSubtype: 'resolution',
    description: 'A resolution note was added to the case.'
  },
  agent_customer_update_changed: {
    actionType: 'agent_customer_update_changed',
    actorType: 'agent',
    defaultSource: 'admin_panel',
    actionSubtype: 'customer_update',
    description: 'An agent changed the customer-facing update.'
  },
  agent_handoff_status_changed: {
    actionType: 'agent_handoff_status_changed',
    actorType: 'agent',
    defaultSource: 'admin_panel',
    actionSubtype: 'handoff',
    description: 'An agent changed the handoff status.'
  },
  agent_escalation_changed: {
    actionType: 'agent_escalation_changed',
    actorType: 'agent',
    defaultSource: 'admin_panel',
    actionSubtype: 'escalation',
    description: 'An agent changed the escalation state.'
  },
  system_case_classified: {
    actionType: 'system_case_classified',
    actorType: 'system',
    defaultSource: 'system',
    actionSubtype: 'classification',
    description: 'The deterministic workflow classified the case issue type.'
  },
  system_stage_transitioned: {
    actionType: 'system_stage_transitioned',
    actorType: 'system',
    defaultSource: 'system',
    actionSubtype: 'stage',
    description: 'The deterministic workflow transitioned the case stage.'
  },
  system_status_transitioned: {
    actionType: 'system_status_transitioned',
    actorType: 'system',
    defaultSource: 'system',
    actionSubtype: 'status',
    description: 'The system changed the case status.'
  },
  system_summary_updated: {
    actionType: 'system_summary_updated',
    actorType: 'system',
    defaultSource: 'system',
    actionSubtype: 'summary',
    description: 'The system recalculated the case summary.'
  },
  system_next_action_updated: {
    actionType: 'system_next_action_updated',
    actorType: 'system',
    defaultSource: 'system',
    actionSubtype: 'next_action',
    description: 'The system recalculated the next action.'
  },
  system_ai_case_note_generated: {
    actionType: 'system_ai_case_note_generated',
    actorType: 'system',
    defaultSource: 'ai',
    actionSubtype: 'case_note',
    description: 'The AI note-compression layer generated or refreshed a case note.'
  },
  system_handoff_state_initialized: {
    actionType: 'system_handoff_state_initialized',
    actorType: 'system',
    defaultSource: 'system',
    actionSubtype: 'handoff',
    description: 'The system initialized or advanced the handoff state.'
  }
};

export type AuditEventInput = {
  caseId: string | null;
  customerId: string | null;
  actorType: AuditActorType;
  actorId: string | null;
  actionType: AuditActionType;
  actionSubtype?: AuditActionSubtype | null;
  previousValue?: AuditStructuredValue | null;
  newValue?: AuditStructuredValue | null;
  metadata?: AuditStructuredValue | null;
  source: AuditLogSource;
  messageId?: string | null;
  timelineItemId?: string | null;
  requestId?: string | null;
};

export function isAuditActorType(value: string): value is AuditActorType {
  return (AUDIT_ACTOR_TYPES as readonly string[]).includes(value);
}

export function isAuditLogSource(value: string): value is AuditLogSource {
  return (AUDIT_LOG_SOURCES as readonly string[]).includes(value);
}

export function isAuditActionType(value: string): value is AuditActionType {
  return (AUDIT_ACTION_TYPES as readonly string[]).includes(value);
}

export function isAuditActionSubtype(value: string): value is AuditActionSubtype {
  return (AUDIT_ACTION_SUBTYPES as readonly string[]).includes(value);
}
