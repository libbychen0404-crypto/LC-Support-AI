import { buildSummary } from './caseLogic';
import { getFallbackReply } from './helpers';
import type { AICaseInsights, AICaseInsightsPayload, AIReplyPayload, CustomerProfile } from './types';

export async function getNaturalAiReply(payload: AIReplyPayload) {
  try {
    const response = await fetch('/api/ai-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`AI route failed with status ${response.status}`);
    }

    const data = (await response.json()) as { reply?: string };
    return data.reply?.trim() || getFallbackReply(payload.actionType, payload.pendingFieldLabel);
  } catch {
    return getFallbackReply(payload.actionType, payload.pendingFieldLabel);
  }
}

function getFallbackInsights(payload: AICaseInsightsPayload): AICaseInsights {
  const profile: CustomerProfile = {
    customerId: payload.customerId,
    name: payload.customerName,
    phone: '',
    email: '',
    lastSeenAt: new Date().toISOString()
  };

  return {
    summary: buildSummary(profile, {
      caseId: 'fallback',
      issueType: payload.issueType === 'Router Activation' || payload.issueType === 'Router Repair' ? payload.issueType : null,
      status: payload.status,
      stage: payload.stage,
      escalationState: payload.escalationState,
      handoffStatus: payload.handoffStatus,
      assignedHumanAgent: payload.assignedHumanAgent,
      handoffRequestedAt: null,
      handoffContactMethod: null,
      handoffCallbackWindow: '',
      handoffUrgencyReason: '',
      handoffAdditionalDetails: '',
      priority: payload.priority,
      assignedTo: payload.assignedTo,
      etaOrExpectedUpdateTime: payload.etaOrExpectedUpdateTime,
      internalNote: payload.internalNote,
      resolutionNote: payload.resolutionNote,
      caseNote: '',
      customerUpdate: '',
      problemStatement: payload.problemStatement,
      summary: payload.summary,
      nextAction: payload.nextAction,
      confirmed: true,
      requiredFields: [],
      pendingField: null,
      collectedFields: payload.collectedFields,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      timeline: [],
      isOpen: payload.status !== 'Closed'
    }),
    caseNote: payload.internalNote || payload.problemStatement || payload.summary,
    customerUpdate:
      payload.handoffStatus !== 'Not Requested'
        ? 'Your request for human support has been recorded and a specialist will review it shortly.'
        : payload.status === 'Resolved' || payload.status === 'Closed'
          ? payload.resolutionNote || 'Your case has been completed.'
          : `Current workflow status: ${payload.status}. Next, we will ${payload.nextAction.charAt(0).toLowerCase()}${payload.nextAction.slice(1)}`
  };
}

export async function getCaseInsights(payload: AICaseInsightsPayload) {
  try {
    const response = await fetch('/api/ai-case-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`AI insights route failed with status ${response.status}`);
    }

    const data = (await response.json()) as Partial<AICaseInsights>;
    const fallback = getFallbackInsights(payload);

    return {
      summary: data.summary?.trim() || fallback.summary,
      caseNote: data.caseNote?.trim() || fallback.caseNote,
      customerUpdate: data.customerUpdate?.trim() || fallback.customerUpdate
    };
  } catch {
    return getFallbackInsights(payload);
  }
}
