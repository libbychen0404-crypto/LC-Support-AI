import { nowIso } from './helpers';
import type { CasePriority, CaseRecord, CaseStatus, EscalationState, HandoffStatus, IssueType } from './types';

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  New: 'New',
  Investigating: 'Investigating',
  'Waiting on Customer': 'Waiting on Customer',
  'Pending Technician': 'Pending Technician',
  'Provisioning Check': 'Provisioning Check',
  'Replacement Review': 'Replacement Review',
  'Pending Follow-up': 'Pending Follow-up',
  Resolved: 'Resolved',
  Closed: 'Closed'
};

export const HANDOFF_STATUS_LABELS: Record<HandoffStatus, string> = {
  'Not Requested': 'AI-led Support',
  'Awaiting Human Review': 'Awaiting Human Review',
  'Human Assigned': 'Human Agent Assigned',
  'Under Human Review': 'Under Human Review',
  Completed: 'Human Support Completed'
};

export const CASE_PRIORITY_OPTIONS: CasePriority[] = ['Low', 'Medium', 'High', 'Urgent'];

export function getDefaultPriority(issueType: IssueType | null): CasePriority {
  if (issueType === 'Router Repair') return 'High';
  if (issueType === 'Router Activation') return 'Medium';
  return 'Medium';
}

export function getDefaultAssignedTo() {
  return null;
}

export function getDefaultEta(issueType: IssueType | null) {
  if (issueType === 'Router Activation') {
    return new Date(Date.now() + 1000 * 60 * 60 * 4).toISOString();
  }

  if (issueType === 'Router Repair') {
    return new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
  }

  return new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString();
}

export function getInitialOperationalStatus(issueType: IssueType | null): CaseStatus {
  if (issueType === 'Router Activation') return 'Provisioning Check';
  if (issueType === 'Router Repair') return 'Pending Technician';
  return 'Investigating';
}

export function getAllowedStatusTransitions(status: CaseStatus): CaseStatus[] {
  const transitions: Record<CaseStatus, CaseStatus[]> = {
    New: ['Provisioning Check', 'Pending Technician', 'Investigating', 'Closed'],
    Investigating: ['Waiting on Customer', 'Pending Technician', 'Replacement Review', 'Resolved', 'Closed'],
    'Waiting on Customer': ['Investigating', 'Pending Follow-up', 'Closed'],
    'Pending Technician': ['Investigating', 'Replacement Review', 'Resolved', 'Closed'],
    'Provisioning Check': ['Waiting on Customer', 'Investigating', 'Resolved', 'Closed'],
    'Replacement Review': ['Pending Technician', 'Resolved', 'Closed'],
    'Pending Follow-up': ['Investigating', 'Waiting on Customer', 'Resolved', 'Closed'],
    Resolved: ['Closed', 'Investigating'],
    Closed: ['Closed']
  };

  return transitions[status];
}

export function getSelectableStatusesForAdmin(status: CaseStatus) {
  const nextStatuses = getAllowedStatusTransitions(status);
  const combined = [status, ...nextStatuses];
  return combined.filter((candidate, index) => combined.indexOf(candidate) === index);
}

export function isAllowedStatusTransition(from: CaseStatus, to: CaseStatus) {
  return getAllowedStatusTransitions(from).includes(to);
}

export function getCustomerFacingStatusLabel(status: CaseStatus) {
  if (status === 'Pending Technician') return 'Under Technical Review';
  if (status === 'Provisioning Check') return 'Activation Review';
  if (status === 'Replacement Review') return 'Replacement Assessment';
  if (status === 'Pending Follow-up') return 'Awaiting Support Follow-up';
  return CASE_STATUS_LABELS[status];
}

export function getEscalationLabel(escalationState: EscalationState) {
  return escalationState === 'Escalated' ? 'Escalated Case' : 'Normal Priority Handling';
}

export function getHandoffCustomerLabel(handoffStatus: HandoffStatus) {
  if (handoffStatus === 'Awaiting Human Review') return 'Human Review Requested';
  if (handoffStatus === 'Human Assigned') return 'Human Specialist Assigned';
  if (handoffStatus === 'Under Human Review') return 'Under Human Review';
  if (handoffStatus === 'Completed') return 'Human Support Completed';
  return 'AI-led Support';
}

export function getCaseLifecycleState(caseRecord: CaseRecord) {
  return caseRecord.isOpen ? 'Open' : 'Closed';
}

export function getSupportExpectation(caseRecord: CaseRecord) {
  if (caseRecord.handoffStatus === 'Awaiting Human Review') {
    return 'A support specialist will review your case and contact you during your selected callback window.';
  }

  if (caseRecord.handoffStatus === 'Human Assigned' || caseRecord.handoffStatus === 'Under Human Review') {
    return caseRecord.assignedHumanAgent
      ? `${caseRecord.assignedHumanAgent} is reviewing your case now.`
      : 'A human support specialist is now reviewing your case.';
  }

  if (caseRecord.escalationState === 'Escalated') {
    return 'This case has been flagged for additional attention and priority handling.';
  }

  if (caseRecord.etaOrExpectedUpdateTime) {
    return 'We will keep the case moving and post another update by the expected update time shown in your case.';
  }

  return 'Your case remains in progress and the next update will appear in this workspace.';
}

export function applyAgentStatusUpdate(caseRecord: CaseRecord, status: CaseStatus) {
  const resolvedNow = status === 'Resolved' || status === 'Closed';
  const stage: CaseRecord['stage'] = resolvedNow
    ? 'resolved'
    : status === 'Waiting on Customer' || status === 'Pending Follow-up'
      ? 'follow_up'
      : 'case_processing';

  return {
    ...caseRecord,
    status,
    stage,
    isOpen: status !== 'Closed',
    escalationState: resolvedNow ? 'Normal' : caseRecord.escalationState,
    handoffStatus: resolvedNow && caseRecord.handoffStatus !== 'Not Requested' ? 'Completed' : caseRecord.handoffStatus,
    updatedAt: nowIso()
  };
}
