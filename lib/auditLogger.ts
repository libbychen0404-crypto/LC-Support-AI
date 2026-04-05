import {
  AUDIT_EVENT_DEFINITIONS,
  isAuditActionSubtype,
  isAuditActionType,
  isAuditActorType,
  isAuditLogSource,
  type AuditEventInput
} from './audit';
import type { AuditStorageAdapter, CreateAuditLogInput } from './auditStorage';
import type { AuditActionSubtype, AuditActionType, AuditActorType, AuditLogRecord, AuditLogSource, AuditStructuredValue } from './types';

export class AuditLogError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'audit_case_context_missing'
      | 'audit_actor_type_invalid'
      | 'audit_action_type_invalid'
      | 'audit_action_subtype_invalid'
      | 'audit_source_invalid'
      | 'audit_actor_id_missing'
      | 'audit_event_actor_mismatch'
      | 'audit_event_subtype_mismatch'
  ) {
    super(message);
    this.name = 'AuditLogError';
  }
}

export type AuditLogger = {
  logAuditEvent(input: AuditEventInput): Promise<AuditLogRecord>;
  logCaseCreated(input: CommonAuditWrapperInput): Promise<AuditLogRecord>;
  logCustomerCaseConfirmed(input: CommonAuditWrapperInput & { actorId: string }): Promise<AuditLogRecord>;
  logCustomerCaseCorrectionRequested(input: CommonAuditWrapperInput & { actorId: string }): Promise<AuditLogRecord>;
  logStatusChange(input: StatusChangeAuditInput): Promise<AuditLogRecord>;
  logCustomerMessage(input: CustomerMessageAuditInput): Promise<AuditLogRecord>;
  logFieldCollection(input: FieldCollectionAuditInput): Promise<AuditLogRecord>;
  logHandoffRequest(input: HandoffRequestAuditInput): Promise<AuditLogRecord>;
  logAgentAssignment(input: AgentAssignmentAuditInput): Promise<AuditLogRecord>;
  logAgentTakeover(input: AgentTakeoverAuditInput): Promise<AuditLogRecord>;
  logPriorityChange(input: AgentPriorityAuditInput): Promise<AuditLogRecord>;
  logInternalNoteAdded(input: InternalNoteAuditInput): Promise<AuditLogRecord>;
  logInternalNoteUpdated(input: InternalNoteAuditInput): Promise<AuditLogRecord>;
  logResolutionNoteAdded(input: AgentResolutionAuditInput): Promise<AuditLogRecord>;
  logCustomerUpdateChanged(input: AgentCustomerUpdateAuditInput): Promise<AuditLogRecord>;
  logHandoffStatusChanged(input: AgentHandoffStatusAuditInput): Promise<AuditLogRecord>;
  logEscalationChanged(input: AgentEscalationAuditInput): Promise<AuditLogRecord>;
  logSystemClassification(input: SystemWorkflowAuditInput): Promise<AuditLogRecord>;
  logSystemStageTransition(input: SystemWorkflowAuditInput): Promise<AuditLogRecord>;
  logSystemNextActionUpdate(input: SystemWorkflowAuditInput): Promise<AuditLogRecord>;
  logSystemHandoffStateInitialized(input: SystemWorkflowAuditInput): Promise<AuditLogRecord>;
  logSystemCaseNoteGenerated(input: SystemWorkflowAuditInput): Promise<AuditLogRecord>;
  logSystemSummaryUpdate(input: SystemSummaryAuditInput): Promise<AuditLogRecord>;
};

type CommonAuditWrapperInput = {
  caseId: string;
  customerId: string | null;
  actorId?: string | null;
  previousValue?: AuditStructuredValue | null;
  newValue?: AuditStructuredValue | null;
  metadata?: AuditStructuredValue | null;
  source?: AuditLogSource;
  requestId?: string | null;
  timelineItemId?: string | null;
  messageId?: string | null;
};

type StatusChangeAuditInput = CommonAuditWrapperInput & {
  actorType: 'agent' | 'system';
  actionType?: 'agent_status_changed' | 'case_status_changed' | 'system_status_transitioned';
};

type CustomerMessageAuditInput = CommonAuditWrapperInput & {
  actorId: string;
  messageId: string;
};

type FieldCollectionAuditInput = CommonAuditWrapperInput & {
  actorId: string;
  fieldKey: string;
};

type HandoffRequestAuditInput = CommonAuditWrapperInput & {
  actorId: string;
};

type AgentAssignmentAuditInput = CommonAuditWrapperInput & {
  actorId: string;
};

type AgentTakeoverAuditInput = CommonAuditWrapperInput & {
  actorId: string;
};

type InternalNoteAuditInput = CommonAuditWrapperInput & {
  actorId: string;
};

type AgentPriorityAuditInput = CommonAuditWrapperInput & {
  actorId: string;
};

type AgentResolutionAuditInput = CommonAuditWrapperInput & {
  actorId: string;
};

type AgentCustomerUpdateAuditInput = CommonAuditWrapperInput & {
  actorId: string;
};

type AgentHandoffStatusAuditInput = CommonAuditWrapperInput & {
  actorId: string;
};

type AgentEscalationAuditInput = CommonAuditWrapperInput & {
  actorId: string;
};

type SystemWorkflowAuditInput = CommonAuditWrapperInput;

type SystemSummaryAuditInput = CommonAuditWrapperInput;

function normalizeStructuredValue(value: unknown): AuditStructuredValue | null {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeStructuredValue(item)) as AuditStructuredValue[];
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, nestedValue]) => {
        const normalized = normalizeStructuredValue(nestedValue);
        return normalized === null && nestedValue === undefined ? null : [key, normalized];
      })
      .filter((entry): entry is [string, AuditStructuredValue | null] => entry !== null);

    return Object.fromEntries(entries) as AuditStructuredValue;
  }

  return String(value);
}

function normalizeMetadata(value: unknown): AuditStructuredValue {
  const normalized = normalizeStructuredValue(value);
  if (normalized === null || Array.isArray(normalized) || typeof normalized !== 'object') {
    return {};
  }

  return normalized;
}

function ensureNonEmptyString(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function buildAuditInsert(definitionActionType: AuditActionType, input: AuditEventInput): CreateAuditLogInput {
  const definition = AUDIT_EVENT_DEFINITIONS[definitionActionType];
  const actionSubtype = input.actionSubtype ?? definition.actionSubtype ?? null;

  if (!isAuditActorType(input.actorType)) {
    throw new AuditLogError(`Unsupported audit actor type: ${input.actorType}`, 'audit_actor_type_invalid');
  }

  if (!isAuditActionType(input.actionType)) {
    throw new AuditLogError(`Unsupported audit action type: ${input.actionType}`, 'audit_action_type_invalid');
  }

  if (!isAuditLogSource(input.source)) {
    throw new AuditLogError(`Unsupported audit source: ${input.source}`, 'audit_source_invalid');
  }

  if (input.actorType !== definition.actorType) {
    throw new AuditLogError(
      `Audit action ${definitionActionType} expects actor ${definition.actorType}, received ${input.actorType}.`,
      'audit_event_actor_mismatch'
    );
  }

  if (actionSubtype !== null && actionSubtype !== undefined && !isAuditActionSubtype(actionSubtype)) {
    throw new AuditLogError(`Unsupported audit action subtype: ${actionSubtype}`, 'audit_action_subtype_invalid');
  }

  if (definition.actionSubtype && actionSubtype !== definition.actionSubtype) {
    throw new AuditLogError(
      `Audit action ${definitionActionType} expects subtype ${definition.actionSubtype}, received ${actionSubtype}.`,
      'audit_event_subtype_mismatch'
    );
  }

  const caseId = ensureNonEmptyString(input.caseId);
  const customerId = ensureNonEmptyString(input.customerId);

  if (!caseId && !customerId) {
    throw new AuditLogError('Audit events must reference at least a case or customer context.', 'audit_case_context_missing');
  }

  const actorId = ensureNonEmptyString(input.actorId);
  if (input.actorType !== 'system' && !actorId) {
    throw new AuditLogError('Customer and agent audit events require an actor id.', 'audit_actor_id_missing');
  }

  return {
    caseId,
    customerId,
    actorType: input.actorType,
    actorId,
    actionType: input.actionType,
    actionSubtype,
    previousValue: normalizeStructuredValue(input.previousValue),
    newValue: normalizeStructuredValue(input.newValue),
    metadata: normalizeMetadata(input.metadata),
    source: input.source,
    messageId: ensureNonEmptyString(input.messageId),
    timelineItemId: ensureNonEmptyString(input.timelineItemId),
    requestId: ensureNonEmptyString(input.requestId)
  };
}

async function logWithDefinition(
  storage: AuditStorageAdapter,
  actionType: AuditActionType,
  input: Omit<AuditEventInput, 'actionType'>
) {
  return storage.appendAuditLog(buildAuditInsert(actionType, { ...input, actionType }));
}

export async function logAuditEvent(storage: AuditStorageAdapter, input: AuditEventInput): Promise<AuditLogRecord> {
  return storage.appendAuditLog(buildAuditInsert(input.actionType, input));
}

export function createAuditLogger(storage: AuditStorageAdapter): AuditLogger {
  return {
    async logAuditEvent(input) {
      return logAuditEvent(storage, input);
    },

    async logCaseCreated(input) {
      return logWithDefinition(storage, 'case_created', {
        ...input,
        actorType: 'system',
        actorId: null,
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.case_created.defaultSource
      });
    },

    async logCustomerCaseConfirmed(input) {
      return logWithDefinition(storage, 'customer_case_confirmed', {
        ...input,
        actorType: 'customer',
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.customer_case_confirmed.defaultSource
      });
    },

    async logCustomerCaseCorrectionRequested(input) {
      return logWithDefinition(storage, 'customer_case_correction_requested', {
        ...input,
        actorType: 'customer',
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.customer_case_correction_requested.defaultSource
      });
    },

    async logStatusChange(input) {
      const actionType = input.actionType ?? (input.actorType === 'agent' ? 'agent_status_changed' : 'system_status_transitioned');

      const definition = AUDIT_EVENT_DEFINITIONS[actionType];
      return logWithDefinition(storage, actionType, {
        ...input,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        source: input.source ?? definition.defaultSource
      });
    },

    async logCustomerMessage(input) {
      return logWithDefinition(storage, 'customer_message_sent', {
        ...input,
        actorType: 'customer',
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.customer_message_sent.defaultSource
      });
    },

    async logFieldCollection(input) {
      return logWithDefinition(storage, 'customer_field_collected', {
        ...input,
        actorType: 'customer',
        metadata: {
          ...(typeof input.metadata === 'object' && input.metadata && !Array.isArray(input.metadata) ? input.metadata : {}),
          fieldKey: input.fieldKey
        },
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.customer_field_collected.defaultSource
      });
    },

    async logHandoffRequest(input) {
      return logWithDefinition(storage, 'customer_handoff_requested', {
        ...input,
        actorType: 'customer',
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.customer_handoff_requested.defaultSource
      });
    },

    async logAgentAssignment(input) {
      return logWithDefinition(storage, 'agent_case_assigned', {
        ...input,
        actorType: 'agent',
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.agent_case_assigned.defaultSource
      });
    },

    async logAgentTakeover(input) {
      return logWithDefinition(storage, 'agent_case_taken_over', {
        ...input,
        actorType: 'agent',
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.agent_case_taken_over.defaultSource
      });
    },

    async logPriorityChange(input) {
      return logWithDefinition(storage, 'agent_priority_changed', {
        ...input,
        actorType: 'agent',
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.agent_priority_changed.defaultSource
      });
    },

    async logInternalNoteAdded(input) {
      return logWithDefinition(storage, 'agent_internal_note_added', {
        ...input,
        actorType: 'agent',
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.agent_internal_note_added.defaultSource
      });
    },

    async logInternalNoteUpdated(input) {
      return logWithDefinition(storage, 'agent_internal_note_updated', {
        ...input,
        actorType: 'agent',
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.agent_internal_note_updated.defaultSource
      });
    },

    async logResolutionNoteAdded(input) {
      return logWithDefinition(storage, 'agent_resolution_note_added', {
        ...input,
        actorType: 'agent',
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.agent_resolution_note_added.defaultSource
      });
    },

    async logCustomerUpdateChanged(input) {
      return logWithDefinition(storage, 'agent_customer_update_changed', {
        ...input,
        actorType: 'agent',
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.agent_customer_update_changed.defaultSource
      });
    },

    async logHandoffStatusChanged(input) {
      return logWithDefinition(storage, 'agent_handoff_status_changed', {
        ...input,
        actorType: 'agent',
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.agent_handoff_status_changed.defaultSource
      });
    },

    async logEscalationChanged(input) {
      return logWithDefinition(storage, 'agent_escalation_changed', {
        ...input,
        actorType: 'agent',
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.agent_escalation_changed.defaultSource
      });
    },

    async logSystemClassification(input) {
      return logWithDefinition(storage, 'system_case_classified', {
        ...input,
        actorType: 'system',
        actorId: null,
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.system_case_classified.defaultSource
      });
    },

    async logSystemStageTransition(input) {
      return logWithDefinition(storage, 'system_stage_transitioned', {
        ...input,
        actorType: 'system',
        actorId: null,
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.system_stage_transitioned.defaultSource
      });
    },

    async logSystemNextActionUpdate(input) {
      return logWithDefinition(storage, 'system_next_action_updated', {
        ...input,
        actorType: 'system',
        actorId: null,
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.system_next_action_updated.defaultSource
      });
    },

    async logSystemHandoffStateInitialized(input) {
      return logWithDefinition(storage, 'system_handoff_state_initialized', {
        ...input,
        actorType: 'system',
        actorId: null,
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.system_handoff_state_initialized.defaultSource
      });
    },

    async logSystemCaseNoteGenerated(input) {
      return logWithDefinition(storage, 'system_ai_case_note_generated', {
        ...input,
        actorType: 'system',
        actorId: null,
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.system_ai_case_note_generated.defaultSource
      });
    },

    async logSystemSummaryUpdate(input) {
      return logWithDefinition(storage, 'system_summary_updated', {
        ...input,
        actorType: 'system',
        actorId: null,
        source: input.source ?? AUDIT_EVENT_DEFINITIONS.system_summary_updated.defaultSource
      });
    }
  };
}

export const auditValueNormalization = {
  normalizeStructuredValue,
  normalizeMetadata
};
