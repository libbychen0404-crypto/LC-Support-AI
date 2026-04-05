import { CASE_STATUS_LABELS, HANDOFF_STATUS_LABELS } from './caseStatus';
import type {
  CaseFieldKey,
  CasePriority,
  CaseRecord,
  CaseStatus,
  ConversationStage,
  HandoffStatus,
  IssueType,
  Message,
  Sender,
  TimelineItem
} from './types';

export const DEFAULT_CUSTOMER_ID = 'demo-customer-001';

export function makeId(prefix = '') {
  const suffix = Math.random().toString(36).slice(2, 10);
  return prefix ? `${prefix}-${suffix}` : suffix;
}

export function makeUuid() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

export function formatTime(iso: string | null) {
  if (!iso) return 'Not set';
  return new Date(iso).toLocaleString();
}

export function normalize(text: string) {
  return text.toLowerCase().trim();
}

export function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function createMessage(sender: Sender, text: string, agentLabel?: string | null): Message {
  return {
    id: makeId('msg'),
    sender,
    text,
    createdAt: nowIso(),
    agentLabel: sender === 'agent' ? agentLabel || 'Human Support Agent' : null
  };
}

export function createTimelineItem(title: string, detail: string): TimelineItem {
  return {
    id: makeId('timeline'),
    title,
    detail,
    createdAt: nowIso()
  };
}

export function getFieldLabel(field: CaseFieldKey) {
  const labels: Record<CaseFieldKey, string> = {
    routerModel: 'Router model',
    serialNumber: 'Serial number',
    orderNumber: 'Order number',
    activationDate: 'Activation date',
    issueStartDate: 'Issue start date',
    hasRedLight: 'Red light showing',
    restartTried: 'Router restart tried',
    errorDescription: 'Error description'
  };

  return labels[field];
}

export function getFieldPrompt(field: CaseFieldKey, issueType: IssueType) {
  if (field === 'routerModel') return 'Could you share the router model shown on the device or box?';
  if (field === 'serialNumber') return 'Please provide the router serial number from the label on the device.';
  if (field === 'orderNumber') return 'What is the order number linked to this router?';
  if (field === 'activationDate') return 'What date were you trying to activate the router? Please use YYYY-MM-DD.';
  if (field === 'issueStartDate') return 'When did the router issue first start? Please use YYYY-MM-DD.';
  if (field === 'hasRedLight') return 'Is a red light showing on the router right now? Please answer yes or no.';
  if (field === 'restartTried') return 'Have you already tried restarting the router? Please answer yes or no.';

  if (issueType === 'Router Activation') {
    return 'What error or message do you see when you try to activate it?';
  }

  return 'Please describe what the router is doing right now and any error you can see.';
}

export function getIssueTypeLabel(issueType: IssueType | null) {
  return issueType ?? 'Not yet classified';
}

export function getStageLabel(stage: ConversationStage) {
  const labels: Record<ConversationStage, string> = {
    greeting: 'Greeting',
    issue_discovery: 'Issue Discovery',
    information_collection: 'Information Collection',
    case_confirmation: 'Case Confirmation',
    case_processing: 'Case Processing',
    follow_up: 'Follow-up',
    resolved: 'Resolved'
  };

  return labels[stage];
}

export function getStatusTone(status: CaseStatus) {
  if (status === 'Pending Follow-up' || status === 'Waiting on Customer') return 'status-pending';
  if (status === 'Resolved' || status === 'Closed') return 'status-resolved';
  if (status === 'Investigating' || status === 'Pending Technician' || status === 'Provisioning Check') return 'status-investigating';
  if (status === 'Replacement Review') return 'status-review';
  return 'status-new';
}

export function getEscalationTone(escalated: boolean) {
  return escalated ? 'status-escalated' : 'status-neutral';
}

export function getHandoffTone(handoffStatus: HandoffStatus) {
  if (handoffStatus === 'Awaiting Human Review') return 'status-pending';
  if (handoffStatus === 'Human Assigned' || handoffStatus === 'Under Human Review') return 'status-investigating';
  if (handoffStatus === 'Completed') return 'status-resolved';
  return 'status-neutral';
}

export function getStatusLabel(status: CaseStatus) {
  return CASE_STATUS_LABELS[status];
}

export function getHandoffLabel(handoffStatus: HandoffStatus) {
  return HANDOFF_STATUS_LABELS[handoffStatus];
}

export function getPriorityTone(priority: CasePriority) {
  if (priority === 'Urgent') return 'priority-urgent';
  if (priority === 'High') return 'priority-high';
  if (priority === 'Medium') return 'priority-medium';
  return 'priority-low';
}

export function getCaseHeadline(caseRecord: CaseRecord) {
  if (caseRecord.handoffStatus === 'Awaiting Human Review') return 'Human support requested';
  if (caseRecord.handoffStatus === 'Human Assigned' || caseRecord.handoffStatus === 'Under Human Review') {
    return 'Human support is in progress';
  }
  if (caseRecord.escalationState === 'Escalated') return 'Priority support case';
  return 'Current support case';
}

export function getFallbackReply(actionType: string, pendingFieldLabel?: string | null) {
  if (actionType === 'ask_issue') {
    return 'I can help with that. Please tell me what is happening with your router so I can start the right support case.';
  }

  if (actionType === 'collect_field' && pendingFieldLabel) {
    return `Thanks. I’ve saved that. Next, please provide the ${pendingFieldLabel.toLowerCase()}.`;
  }

  if (actionType === 'retry_field' && pendingFieldLabel) {
    return `I want to make sure I record this correctly. Could you please confirm the ${pendingFieldLabel.toLowerCase()} again?`;
  }

  if (actionType === 'review_confirmation') {
    return 'I have everything needed for the draft case. Please review the confirmation card and confirm the case when it looks correct.';
  }

  if (actionType === 'remind_confirmation') {
    return 'Your case draft is ready to be confirmed. Please use the confirmation card to confirm this case or start a new one.';
  }

  if (actionType === 'progress_update') {
    return 'Here is the latest progress update on your case. We have saved the current status and the next step is already assigned.';
  }

  if (actionType === 'case_summary') {
    return 'This case summary is not available right now, so the system is showing the saved structured summary instead.';
  }

  if (actionType === 'compress_note') {
    return 'A short case note is not available right now, so the system is keeping the structured timeline instead.';
  }

  return 'Thanks for the update. I’ve saved it to your case and kept the current support workflow moving.';
}
