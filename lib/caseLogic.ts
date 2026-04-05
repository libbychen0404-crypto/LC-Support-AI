import {
  createMessage,
  createTimelineItem,
  getFieldLabel,
  includesAny,
  makeUuid,
  normalize,
  nowIso
} from './helpers';
import {
  getDefaultAssignedTo,
  getDefaultEta,
  getDefaultPriority,
  getHandoffCustomerLabel,
  getInitialOperationalStatus,
  getSupportExpectation
} from './caseStatus';
import { isValidIsoDateString } from './validation';
import type {
  CaseFieldKey,
  CaseRecord,
  CaseStatus,
  CollectedFields,
  CustomerProfile,
  EscalationState,
  HandoffRequestInput,
  IssueType,
  ReturnSummary,
  SendMessageResult
} from './types';

export function looksLikeGreeting(text: string) {
  const lowerText = normalize(text);
  return ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'].includes(lowerText);
}

export function classifyIssueType(customerInput: string): IssueType | null {
  const lowerInput = normalize(customerInput);

  if (
    includesAny(lowerInput, [
      'activate',
      'activation',
      'activating',
      'not activated',
      'set up',
      'setup',
      'setup not complete',
      'provision',
      'provisioning'
    ])
  ) {
    return 'Router Activation';
  }

  if (
    includesAny(lowerInput, [
      'repair',
      'broken',
      'fault',
      'faulty',
      'red light',
      'internet down',
      'internet is down',
      'not working',
      'still broken',
      'router issue',
      'router problem'
    ])
  ) {
    return 'Router Repair';
  }

  return null;
}

export function getRequiredFields(issueType: IssueType): CaseFieldKey[] {
  if (issueType === 'Router Activation') {
    return ['routerModel', 'serialNumber', 'orderNumber', 'activationDate', 'errorDescription'];
  }

  return ['routerModel', 'serialNumber', 'issueStartDate', 'hasRedLight', 'restartTried', 'errorDescription'];
}

export function getNextMissingField(
  requiredFields: CaseFieldKey[],
  collectedFields: CollectedFields
): CaseFieldKey | null {
  for (const field of requiredFields) {
    const value = collectedFields[field];
    if (!value || value.trim() === '') {
      return field;
    }
  }

  return null;
}

function looksLikeUnknownAnswer(input: string) {
  const lowerInput = normalize(input);

  return includesAny(lowerInput, [
    "don't know",
    'do not know',
    'dont know',
    'not sure',
    'no idea',
    'can you see',
    'you should have it',
    'why do you need',
    'why do i need',
    'cannot find it',
    "can't find it",
    'not with me',
    'do not have it'
  ]);
}

function parseYesNoLikeValue(field: 'hasRedLight' | 'restartTried', input: string) {
  const lowerInput = normalize(input);

  const negativeSignals = ['no', 'nope', 'not yet', "haven't", 'have not', "didn't", 'did not'];
  const positiveSignals =
    field === 'hasRedLight'
      ? ['yes', 'yeah', 'yep', 'there is a red light', 'red light is on', 'red light on', 'has a red light']
      : ['yes', 'yeah', 'yep', 'already restarted', 'restarted it', 'did restart', 'i restarted it', 'power cycled'];

  if (negativeSignals.some((signal) => lowerInput.includes(signal))) {
    return 'No';
  }

  if (positiveSignals.some((signal) => lowerInput.includes(signal))) {
    return 'Yes';
  }

  return null;
}

function parseIdentifierLikeValue(field: 'routerModel' | 'serialNumber' | 'orderNumber', input: string) {
  const trimmed = input.trim();
  if (!trimmed || looksLikeUnknownAnswer(trimmed)) return null;

  if (field === 'routerModel') {
    const hasLetters = /[a-z]/i.test(trimmed);
    const hasMeaningfulLength = trimmed.replace(/[^a-z0-9]/gi, '').length >= 5;
    return hasLetters && hasMeaningfulLength ? trimmed : null;
  }

  const compact = trimmed.replace(/\s+/g, '');
  const hasLetters = /[a-z]/i.test(compact);
  const hasDigits = /\d/.test(compact);
  const hasMeaningfulLength = compact.length >= 6;

  return hasLetters && hasDigits && hasMeaningfulLength ? trimmed : null;
}

export function parseFieldValue(field: CaseFieldKey, input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (field === 'hasRedLight' || field === 'restartTried') {
    return parseYesNoLikeValue(field, trimmed);
  }

  if ((field === 'activationDate' || field === 'issueStartDate') && !isValidIsoDateString(trimmed)) {
    return null;
  }

  if (field === 'routerModel' || field === 'serialNumber' || field === 'orderNumber') {
    return parseIdentifierLikeValue(field, trimmed);
  }

  return trimmed;
}

export function parseConfirmationDecision(input: string) {
  const lowerInput = normalize(input);

  if (['yes', 'y', 'confirm', 'confirmed', 'looks good'].includes(lowerInput)) {
    return 'confirm' as const;
  }

  if (['no', 'n', 'change it', 'needs changes', 'not correct'].includes(lowerInput)) {
    return 'revise' as const;
  }

  return null;
}

function shouldEscalate(customerInput: string) {
  const lowerInput = normalize(customerInput);
  return includesAny(lowerInput, [
    'frustrated',
    'angry',
    'upset',
    'complaint',
    'terrible service',
    'ridiculous',
    'why am i still explaining',
    'sick of repeating',
    'nobody has replied',
    'still waiting'
  ]);
}

function maybeApplyEscalation(caseRecord: CaseRecord, customerInput: string) {
  if (caseRecord.escalationState === 'Escalated' || !shouldEscalate(customerInput)) {
    return;
  }

  caseRecord.escalationState = 'Escalated';
  caseRecord.priority = caseRecord.priority === 'Urgent' ? caseRecord.priority : 'Urgent';
  addTimeline(
    caseRecord,
    'Case escalated',
    'The customer signaled high frustration or urgency, so the case was flagged for priority handling.'
  );
}

export function buildSummary(profile: CustomerProfile, caseRecord: CaseRecord) {
  const detailSummary = Object.entries(caseRecord.collectedFields)
    .filter(([, value]) => value && value.trim() !== '')
    .map(([key, value]) => `${getFieldLabel(key as CaseFieldKey)}: ${value}`)
    .join('; ');

  const customerName = profile.name || 'Unknown customer';
  const issueType = caseRecord.issueType ?? 'Unclassified support';
  const problemStatement = caseRecord.problemStatement || 'Customer issue not fully described yet';
  const assignedTo = caseRecord.assignedTo || 'Unassigned';
  const assignedHumanAgent = caseRecord.assignedHumanAgent || 'Not assigned';
  const escalationSummary =
    caseRecord.escalationState === 'Escalated' ? 'This case is escalated for priority attention.' : 'Normal support priority applies.';
  const handoffSummary =
    caseRecord.handoffStatus === 'Not Requested'
      ? 'Human support status: AI-led support only.'
      : `Human support status: ${getHandoffCustomerLabel(caseRecord.handoffStatus)}. Assigned human agent: ${assignedHumanAgent}.`;

  return `${customerName} has a ${issueType} case. Stage: ${caseRecord.stage}. Workflow status: ${caseRecord.status}. Priority: ${caseRecord.priority}. Assigned to: ${assignedTo}. Problem: ${problemStatement}. ${escalationSummary} ${handoffSummary} Details: ${detailSummary || 'No structured details recorded yet'}.`;
}

export function buildReturnSummary(profile: CustomerProfile, caseRecord: CaseRecord): ReturnSummary {
  const customerName = profile.name || 'there';
  const issueType = caseRecord.issueType || 'support';

  if (caseRecord.handoffStatus !== 'Not Requested') {
    return {
      title: `Welcome back, ${customerName}. Your ${issueType.toLowerCase()} case has already been handed to human support.`,
      detail: `${getSupportExpectation(caseRecord)} You will not need to repeat the case details.`
    };
  }

  if (!caseRecord.confirmed && caseRecord.stage === 'case_confirmation') {
    return {
      title: `Welcome back, ${customerName}. Your draft ${issueType.toLowerCase()} case is ready to review.`,
      detail: 'Please check the confirmation card, then confirm the case or start a new draft.'
    };
  }

  if (caseRecord.stage === 'information_collection' && caseRecord.pendingField) {
    return {
      title: `Welcome back, ${customerName}. Your ${issueType.toLowerCase()} case is still being built.`,
      detail: `The next detail needed is ${getFieldLabel(caseRecord.pendingField).toLowerCase()}.`
    };
  }

  if (caseRecord.confirmed) {
    return {
      title: `Welcome back, ${customerName}. Your ${issueType.toLowerCase()} case is still active.`,
      detail: `${caseRecord.customerUpdate || caseRecord.summary} Next step: ${caseRecord.nextAction}`
    };
  }

  return {
    title: `Welcome back, ${customerName}. Your previous support details are saved.`,
    detail: 'You can continue this case without starting over.'
  };
}

export function getNextAction(caseRecord: CaseRecord) {
  if (caseRecord.status === 'Closed') {
    return 'No further action is required unless the customer reopens the issue.';
  }

  if (caseRecord.status === 'Resolved') {
    return 'Confirm the service is working again and prepare the case for closure.';
  }

  if (!caseRecord.issueType) {
    return 'Ask the customer to describe the router issue clearly so the case can be classified.';
  }

  if (caseRecord.handoffStatus === 'Awaiting Human Review') {
    return 'A human support specialist will review the request and contact the customer during the selected callback window.';
  }

  if (caseRecord.handoffStatus === 'Human Assigned' || caseRecord.handoffStatus === 'Under Human Review') {
    return caseRecord.assignedHumanAgent
      ? `${caseRecord.assignedHumanAgent} is now handling the case and will provide the next update.`
      : 'A human support specialist is now handling the case and will provide the next update.';
  }

  if (!caseRecord.confirmed && caseRecord.stage === 'information_collection' && caseRecord.pendingField) {
    return `Collect ${getFieldLabel(caseRecord.pendingField).toLowerCase()} so the draft case can be completed.`;
  }

  if (!caseRecord.confirmed && caseRecord.stage === 'case_confirmation') {
    return 'Ask the customer to confirm the draft case or discard it and start a new one.';
  }

  if (caseRecord.status === 'Waiting on Customer') {
    return 'Wait for the customer to provide the requested update so the case can continue.';
  }

  if (caseRecord.status === 'Pending Follow-up') {
    return 'Provide a follow-up update and confirm what action is being taken next.';
  }

  if (caseRecord.status === 'Replacement Review') {
    return 'Review whether the router should be replaced based on the current diagnostics.';
  }

  if (caseRecord.status === 'Pending Technician') {
    return 'Queue the case for technical review and track the next update time.';
  }

  if (caseRecord.status === 'Provisioning Check') {
    return 'Verify the activation order and continue provisioning checks for the router.';
  }

  if (caseRecord.escalationState === 'Escalated') {
    return 'Keep the case in priority handling, update the customer, and offer human support if needed.';
  }

  if (caseRecord.issueType === 'Router Activation') {
    return 'Verify activation details and continue provisioning checks for the router.';
  }

  return 'Continue router troubleshooting and review the recorded fault symptoms.';
}

function hasRealHandoffRequest(caseRecord: CaseRecord) {
  return Boolean(
    caseRecord.handoffRequestedAt ||
      caseRecord.handoffContactMethod ||
      caseRecord.handoffCallbackWindow.trim() ||
      caseRecord.handoffUrgencyReason.trim() ||
      caseRecord.handoffAdditionalDetails.trim()
  );
}

function deriveConsistentHandoffStatus(caseRecord: CaseRecord): CaseRecord['handoffStatus'] {
  const hasRequestedHumanSupport = hasRealHandoffRequest(caseRecord);
  const hasAssignedHumanAgent = Boolean(caseRecord.assignedHumanAgent);
  const resolvedOrClosed = caseRecord.status === 'Resolved' || caseRecord.status === 'Closed';

  if (!hasRequestedHumanSupport && !hasAssignedHumanAgent) {
    return 'Not Requested';
  }

  if (hasAssignedHumanAgent) {
    return resolvedOrClosed ? 'Completed' : 'Under Human Review';
  }

  return 'Awaiting Human Review';
}

function deriveConsistentStage(caseRecord: CaseRecord): CaseRecord['stage'] {
  if (caseRecord.status === 'Resolved' || caseRecord.status === 'Closed') {
    return 'resolved';
  }

  if (!caseRecord.issueType) {
    return caseRecord.problemStatement.trim() ? 'issue_discovery' : 'greeting';
  }

  if (!caseRecord.confirmed) {
    return caseRecord.pendingField ? 'information_collection' : 'case_confirmation';
  }

  if (caseRecord.status === 'Waiting on Customer' || caseRecord.status === 'Pending Follow-up') {
    return 'follow_up';
  }

  return 'case_processing';
}

export function synchronizeDerivedCaseState(profile: CustomerProfile, caseRecord: CaseRecord): CaseRecord {
  const requiredFields = caseRecord.issueType ? getRequiredFields(caseRecord.issueType) : [];
  const nextMissingField =
    caseRecord.issueType && !caseRecord.confirmed
      ? getNextMissingField(requiredFields, caseRecord.collectedFields)
      : null;
  const preservedCorrectionField =
    caseRecord.issueType &&
    !caseRecord.confirmed &&
    caseRecord.stage === 'information_collection' &&
    caseRecord.pendingField
      ? caseRecord.pendingField
      : null;

  const synchronizedCase: CaseRecord = {
    ...caseRecord,
    requiredFields,
    collectedFields: { ...caseRecord.collectedFields },
    messages: [...caseRecord.messages],
    timeline: [...caseRecord.timeline]
  };

  synchronizedCase.pendingField = nextMissingField ?? preservedCorrectionField ?? null;
  synchronizedCase.stage = deriveConsistentStage(synchronizedCase);
  synchronizedCase.handoffStatus = deriveConsistentHandoffStatus(synchronizedCase);
  synchronizedCase.isOpen = synchronizedCase.status !== 'Closed';

  if (synchronizedCase.status === 'Closed') {
    synchronizedCase.escalationState = 'Normal';
  }

  synchronizedCase.nextAction = getNextAction(synchronizedCase);
  synchronizedCase.summary = buildSummary(profile, synchronizedCase);

  return synchronizedCase;
}

export function determineStatusFromUpdate(
  customerInput: string,
  previousStatus: CaseStatus,
  issueType: IssueType | null,
  collectedFields: CollectedFields
): CaseStatus {
  const lowerInput = normalize(customerInput);

  if (
    includesAny(lowerInput, [
      "can't fix",
      'cannot fix',
      'cant fix',
      'not fixed',
      'still not working',
      'still broken',
      'not resolved'
    ])
  ) {
    if (issueType === 'Router Activation') return 'Provisioning Check';
    if (collectedFields.hasRedLight === 'Yes' && collectedFields.restartTried === 'Yes') return 'Replacement Review';
    return 'Pending Technician';
  }

  if (
    includesAny(lowerInput, [
      'fixed now',
      'solved',
      'resolved',
      'working now',
      'it works now',
      'it is working now'
    ])
  ) {
    return 'Resolved';
  }

  if (includesAny(lowerInput, ['still waiting', 'no reply', 'no response', 'no update', 'still waiting on'])) {
    return 'Pending Follow-up';
  }

  if (includesAny(lowerInput, ['i will send', 'i can send', 'here is the update', 'here are the details'])) {
    return 'Waiting on Customer';
  }

  if (previousStatus === 'Resolved' || previousStatus === 'Closed') {
    return previousStatus;
  }

  return issueType === 'Router Activation' ? 'Provisioning Check' : 'Pending Technician';
}

function createBaseCaseRecord(): CaseRecord {
  return {
    caseId: makeUuid(),
    issueType: null,
    status: 'New',
    stage: 'greeting',
    escalationState: 'Normal',
    handoffStatus: 'Not Requested',
    assignedHumanAgent: null,
    handoffRequestedAt: null,
    handoffContactMethod: null,
    handoffCallbackWindow: '',
    handoffUrgencyReason: '',
    handoffAdditionalDetails: '',
    priority: getDefaultPriority(null),
    assignedTo: getDefaultAssignedTo(),
    etaOrExpectedUpdateTime: getDefaultEta(null),
    internalNote: '',
    resolutionNote: '',
    caseNote: '',
    customerUpdate: '',
    problemStatement: '',
    summary: 'No case summary yet.',
    nextAction: 'Greet the customer and ask what router issue they need help with.',
    confirmed: false,
    requiredFields: [],
    pendingField: null,
    collectedFields: {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
    messages: [createMessage('ai', 'Hi, welcome to LC Support. What can I help you with today?')],
    timeline: [
      createTimelineItem(
        'Support session started',
        'A new support session was opened and the customer was greeted.'
      )
    ],
    isOpen: true
  };
}

export function createFreshCase(): CaseRecord {
  return createBaseCaseRecord();
}

function addTimeline(caseRecord: CaseRecord, title: string, detail: string) {
  caseRecord.timeline.push(createTimelineItem(title, detail));
}

export function processCustomerMessage(
  activeCase: CaseRecord,
  customerInput: string
): SendMessageResult {
  const updatedCase: CaseRecord = {
    ...activeCase,
    requiredFields: [...activeCase.requiredFields],
    collectedFields: { ...activeCase.collectedFields },
    messages: [...activeCase.messages, createMessage('customer', customerInput)],
    timeline: [...activeCase.timeline],
    updatedAt: nowIso()
  };

  maybeApplyEscalation(updatedCase, customerInput);

  if (updatedCase.stage === 'greeting' || updatedCase.stage === 'issue_discovery') {
    if (looksLikeGreeting(customerInput)) {
      updatedCase.stage = 'issue_discovery';
      updatedCase.nextAction = 'Ask the customer to describe the router issue.';
      return { updatedCase, actionType: 'ask_issue' };
    }

    const issueType = classifyIssueType(customerInput);

    if (!issueType) {
      updatedCase.stage = 'issue_discovery';
      updatedCase.problemStatement = customerInput;
      updatedCase.nextAction = 'Ask a clarifying question to confirm whether this is an activation issue or a repair issue.';
      addTimeline(
        updatedCase,
        'Issue clarification needed',
        'The customer described a problem, but the case type still needs clarification.'
      );
      return { updatedCase, actionType: 'ask_issue' };
    }

    updatedCase.issueType = issueType;
    updatedCase.problemStatement = customerInput;
    updatedCase.priority =
      updatedCase.escalationState === 'Escalated' ? 'Urgent' : getDefaultPriority(issueType);
    updatedCase.assignedTo = getDefaultAssignedTo();
    updatedCase.etaOrExpectedUpdateTime = getDefaultEta(issueType);
    updatedCase.requiredFields = getRequiredFields(issueType);
    updatedCase.pendingField = getNextMissingField(updatedCase.requiredFields, updatedCase.collectedFields);
    updatedCase.stage = updatedCase.pendingField ? 'information_collection' : 'case_confirmation';
    updatedCase.status = 'New';
    updatedCase.nextAction = updatedCase.pendingField
      ? `Collect ${getFieldLabel(updatedCase.pendingField)} from the customer.`
      : 'Review the case confirmation card with the customer.';

    addTimeline(updatedCase, 'Issue classified', `The case was classified as ${issueType}.`);

    return {
      updatedCase,
      actionType: updatedCase.pendingField ? 'collect_field' : 'review_confirmation'
    };
  }

  if (updatedCase.stage === 'information_collection') {
    const field = updatedCase.pendingField;

    if (!field || !updatedCase.issueType) {
      updatedCase.stage = 'case_confirmation';
      updatedCase.pendingField = null;
      updatedCase.nextAction = 'Review the case confirmation card with the customer.';
      return { updatedCase, actionType: 'review_confirmation' };
    }

    const parsedValue = parseFieldValue(field, customerInput);

    if (!parsedValue) {
      updatedCase.nextAction = `Retry ${getFieldLabel(field)} because the customer response was unclear.`;
      return { updatedCase, actionType: 'retry_field' };
    }

    updatedCase.collectedFields[field] = parsedValue;
    addTimeline(updatedCase, 'Information collected', `${getFieldLabel(field)} was recorded as ${parsedValue}.`);

    const nextMissingField = getNextMissingField(updatedCase.requiredFields, updatedCase.collectedFields);
    updatedCase.pendingField = nextMissingField;

    if (nextMissingField) {
      updatedCase.nextAction = `Collect ${getFieldLabel(nextMissingField)} from the customer.`;
      return { updatedCase, actionType: 'collect_field' };
    }

    updatedCase.stage = 'case_confirmation';
    updatedCase.nextAction = 'Review the case confirmation card with the customer.';
    addTimeline(
      updatedCase,
      'Draft case ready',
      'All required details have been collected and the draft case is ready for confirmation.'
    );

    return { updatedCase, actionType: 'review_confirmation' };
  }

  if (updatedCase.stage === 'case_confirmation') {
    const confirmationDecision = parseConfirmationDecision(customerInput);

    if (confirmationDecision === 'confirm') {
      return {
        updatedCase: confirmCase(updatedCase),
        actionType: 'case_update'
      };
    }

    if (confirmationDecision === 'revise') {
      updatedCase.confirmed = false;
      updatedCase.stage = 'information_collection';
      updatedCase.pendingField = updatedCase.requiredFields[0] ?? null;
      updatedCase.nextAction = updatedCase.pendingField
        ? `Collect ${getFieldLabel(updatedCase.pendingField)} from the customer.`
        : 'Review the case confirmation card with the customer.';

      addTimeline(
        updatedCase,
        'Draft returned for correction',
        'The customer asked to correct the draft case before confirming it.'
      );

      return {
        updatedCase,
        actionType: updatedCase.pendingField ? 'collect_field' : 'review_confirmation'
      };
    }

    updatedCase.nextAction = 'Wait for the customer to confirm the case or start a new case.';
    return { updatedCase, actionType: 'remind_confirmation' };
  }

  updatedCase.status = determineStatusFromUpdate(
    customerInput,
    updatedCase.status,
    updatedCase.issueType,
    updatedCase.collectedFields
  );
  updatedCase.stage =
    updatedCase.status === 'Resolved' || updatedCase.status === 'Closed'
      ? 'resolved'
      : updatedCase.status === 'Waiting on Customer' || updatedCase.status === 'Pending Follow-up'
        ? 'follow_up'
        : 'case_processing';
  updatedCase.nextAction = getNextAction(updatedCase);
  addTimeline(
    updatedCase,
    'Customer update received',
    `A new customer update was recorded. Workflow status: ${updatedCase.status}. Escalation: ${updatedCase.escalationState}.`
  );

  return { updatedCase, actionType: 'case_update' };
}

export function confirmCase(activeCase: CaseRecord) {
  const operationalStatus = getInitialOperationalStatus(activeCase.issueType);
  const updatedCase: CaseRecord = {
    ...activeCase,
    confirmed: true,
    stage: 'case_processing',
    status: activeCase.status === 'New' ? operationalStatus : activeCase.status,
    pendingField: null,
    updatedAt: nowIso(),
    messages: [...activeCase.messages],
    timeline: [...activeCase.timeline],
    priority:
      activeCase.escalationState === 'Escalated'
        ? 'Urgent'
        : activeCase.priority || getDefaultPriority(activeCase.issueType),
    etaOrExpectedUpdateTime: activeCase.etaOrExpectedUpdateTime || getDefaultEta(activeCase.issueType),
    isOpen: true
  };

  updatedCase.nextAction = getNextAction(updatedCase);
  addTimeline(
    updatedCase,
    'Case confirmed',
    'The customer confirmed the draft case and it is now active in the support workflow.'
  );

  return updatedCase;
}

export function requestHumanHandoff(activeCase: CaseRecord, handoff: HandoffRequestInput) {
  const updatedCase: CaseRecord = {
    ...activeCase,
    escalationState: 'Escalated',
    handoffStatus: 'Awaiting Human Review',
    handoffRequestedAt: nowIso(),
    handoffContactMethod: handoff.preferredContactMethod,
    handoffCallbackWindow: handoff.callbackTimeWindow,
    handoffUrgencyReason: handoff.urgencyReason,
    handoffAdditionalDetails: handoff.additionalDetails,
    priority: 'Urgent',
    updatedAt: nowIso(),
    timeline: [...activeCase.timeline],
    messages: [
      ...activeCase.messages,
      createMessage(
        'ai',
        'Your request for human support has been submitted. We have saved your case details so you will not need to repeat everything to the support specialist.'
      )
    ]
  };

  updatedCase.nextAction = getNextAction(updatedCase);
  updatedCase.customerUpdate = getSupportExpectation(updatedCase);
  addTimeline(
    updatedCase,
    'Human support requested',
    `The customer requested human support via ${handoff.preferredContactMethod} during ${handoff.callbackTimeWindow}.`
  );

  return updatedCase;
}

export function assignHumanAgent(activeCase: CaseRecord, agentName: string) {
  const updatedCase: CaseRecord = {
    ...activeCase,
    assignedHumanAgent: agentName,
    handoffStatus: activeCase.handoffStatus === 'Awaiting Human Review' ? 'Under Human Review' : 'Human Assigned',
    updatedAt: nowIso(),
    timeline: [...activeCase.timeline],
    messages: [
      ...activeCase.messages,
      createMessage(
        'agent',
        `${agentName} has taken over this case and will provide the next update.`,
        agentName
      )
    ]
  };

  updatedCase.nextAction = getNextAction(updatedCase);
  updatedCase.customerUpdate = getSupportExpectation(updatedCase);
  addTimeline(
    updatedCase,
    'Human support assigned',
    `${agentName} has taken ownership of the case for human review.`
  );

  return updatedCase;
}
