import { getFieldLabel, getHandoffLabel, getStageLabel, getStatusLabel } from './helpers';
import type { AdminAuditTimelineEvent, AuditLogRecord, AuditStructuredValue, HandoffStatus } from './types';

function readStructuredField(value: AuditStructuredValue | null, key: string) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return null;
  }

  const fieldValue = value[key];
  if (fieldValue === undefined || fieldValue === null) {
    return null;
  }

  if (typeof fieldValue === 'string' || typeof fieldValue === 'number' || typeof fieldValue === 'boolean') {
    return String(fieldValue);
  }

  return null;
}

function formatChange(label: string, previousValue: string | null, nextValue: string | null) {
  const previousLabel = previousValue?.trim() || 'Not set';
  const nextLabel = nextValue?.trim() || 'Not set';
  return `${label}: ${previousLabel} -> ${nextLabel}`;
}

export function getAuditActorLabel(actorType: AuditLogRecord['actorType']) {
  if (actorType === 'customer') return 'Customer';
  if (actorType === 'agent') return 'Support Agent';
  return 'System';
}

export function getAuditActionLabel(actionType: AuditLogRecord['actionType']) {
  const labels: Record<AuditLogRecord['actionType'], string> = {
    case_created: 'Case created',
    case_status_changed: 'Case status changed',
    case_resolved: 'Case resolved',
    case_closed: 'Case closed',
    customer_message_sent: 'Customer message',
    customer_field_collected: 'Field collected',
    customer_case_confirmed: 'Case confirmed',
    customer_case_correction_requested: 'Case correction requested',
    customer_handoff_requested: 'Human handoff requested',
    agent_case_assigned: 'Case assignment',
    agent_case_taken_over: 'Case taken over',
    agent_message_sent: 'Agent message',
    agent_status_changed: 'Status changed',
    agent_priority_changed: 'Priority changed',
    agent_internal_note_added: 'Internal note added',
    agent_internal_note_updated: 'Internal note updated',
    agent_resolution_note_added: 'Resolution note added',
    agent_customer_update_changed: 'Customer update changed',
    agent_handoff_status_changed: 'Handoff status changed',
    agent_escalation_changed: 'Escalation changed',
    system_case_classified: 'Case classified',
    system_stage_transitioned: 'Stage transitioned',
    system_status_transitioned: 'Status transitioned',
    system_summary_updated: 'Summary updated',
    system_next_action_updated: 'Next action updated',
    system_ai_case_note_generated: 'AI case note generated',
    system_handoff_state_initialized: 'Handoff initialized'
  };

  return labels[actionType];
}

export function getAuditEventDescription(record: AuditLogRecord) {
  switch (record.actionType) {
    case 'case_created':
      return 'Created a new support case.';
    case 'customer_message_sent':
      return 'Sent a message in the customer workspace.';
    case 'customer_field_collected': {
      const fieldKey = readStructuredField(record.metadata, 'fieldKey');
      const fieldLabel = fieldKey ? getFieldLabel(fieldKey as never) : 'support field';
      const previousValue = typeof record.previousValue === 'string' ? record.previousValue : null;
      const nextValue = typeof record.newValue === 'string' ? record.newValue : null;
      return formatChange(`Updated ${fieldLabel}`, previousValue, nextValue);
    }
    case 'customer_case_confirmed':
      return 'Confirmed the draft case details.';
    case 'customer_case_correction_requested':
      return 'Requested changes to the draft case details.';
    case 'customer_handoff_requested':
      return 'Requested human support.';
    case 'agent_case_assigned': {
      const nextAssignedAgent = readStructuredField(record.newValue, 'assignedHumanAgent');
      const nextAssignedQueue = readStructuredField(record.newValue, 'assignedTo');
      if (nextAssignedAgent) {
        return `Assigned the case to ${nextAssignedAgent}.`;
      }

      if (nextAssignedQueue) {
        return `Assigned the case to ${nextAssignedQueue}.`;
      }

      return 'Updated the case assignment.';
    }
    case 'agent_case_taken_over':
      return 'Took over the case for human support.';
    case 'agent_status_changed':
    case 'system_status_transitioned':
    case 'case_status_changed':
    case 'case_resolved':
    case 'case_closed': {
      const previousStatus = readStructuredField(record.previousValue, 'status');
      const nextStatus = readStructuredField(record.newValue, 'status');
      return formatChange(
        'Changed status',
        previousStatus ? getStatusLabel(previousStatus as never) : null,
        nextStatus ? getStatusLabel(nextStatus as never) : null
      );
    }
    case 'agent_priority_changed':
      return formatChange(
        'Changed priority',
        readStructuredField(record.previousValue, 'priority'),
        readStructuredField(record.newValue, 'priority')
      );
    case 'agent_internal_note_added':
      return 'Added an internal support note.';
    case 'agent_internal_note_updated':
      return 'Updated the internal support note.';
    case 'agent_resolution_note_added':
      return 'Added a resolution note.';
    case 'agent_customer_update_changed':
      return 'Updated the customer-facing status message.';
    case 'agent_handoff_status_changed':
    case 'system_handoff_state_initialized': {
      const previousStatus = readStructuredField(record.previousValue, 'handoffStatus');
      const nextStatus = readStructuredField(record.newValue, 'handoffStatus');
      const previousLabel = previousStatus ? getHandoffLabel(previousStatus as HandoffStatus) : null;
      const nextLabel = nextStatus ? getHandoffLabel(nextStatus as HandoffStatus) : null;
      return formatChange('Changed human support status', previousLabel, nextLabel);
    }
    case 'agent_escalation_changed':
      return formatChange(
        'Changed escalation',
        readStructuredField(record.previousValue, 'escalationState'),
        readStructuredField(record.newValue, 'escalationState')
      );
    case 'system_case_classified': {
      const issueType = readStructuredField(record.newValue, 'issueType');
      return issueType ? `Classified the case as "${issueType}".` : 'Updated the case classification.';
    }
    case 'system_stage_transitioned': {
      const previousStage = readStructuredField(record.previousValue, 'stage');
      const nextStage = readStructuredField(record.newValue, 'stage');
      return formatChange(
        'Moved workflow stage',
        previousStage ? getStageLabel(previousStage as never) : null,
        nextStage ? getStageLabel(nextStage as never) : null
      );
    }
    case 'system_summary_updated':
      return 'Refreshed the case summary.';
    case 'system_next_action_updated':
      return 'Updated the next recommended action.';
    case 'system_ai_case_note_generated':
      return 'Generated an internal AI case note.';
    case 'agent_message_sent':
      return 'Sent a support-agent message.';
    default:
      return getAuditActionLabel(record.actionType);
  }
}

export function formatAdminAuditTimelineEvent(record: AuditLogRecord): AdminAuditTimelineEvent {
  return {
    id: record.id,
    caseId: record.caseId,
    actorType: record.actorType,
    actorLabel: getAuditActorLabel(record.actorType),
    actionType: record.actionType,
    actionLabel: getAuditActionLabel(record.actionType),
    description: getAuditEventDescription(record),
    createdAt: record.createdAt
  };
}
