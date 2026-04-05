import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCaseInsights, getNaturalAiReply } from '../lib/ai';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('AI reply fallback behavior', () => {
  it('returns a safe fallback reply when AI wording is unavailable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as typeof fetch;

    const reply = await getNaturalAiReply({
      actionType: 'collect_field',
      customerName: 'Libby',
      customerId: 'demo-customer-001',
      issueType: 'Router Repair',
      stage: 'information_collection',
      status: 'New',
      escalationState: 'Normal',
      handoffStatus: 'Not Requested',
      priority: 'High',
      assignedTo: null,
      assignedHumanAgent: null,
      etaOrExpectedUpdateTime: null,
      internalNote: '',
      resolutionNote: '',
      problemStatement: 'Router has a red light',
      summary: 'Summary',
      nextAction: 'Collect Serial Number from the customer.',
      pendingFieldLabel: 'Serial Number',
      collectedFields: {},
      latestCustomerMessage: 'It is broken',
      recentMessages: []
    });

    expect(reply).toContain('serial number');
  });

  it('returns safe fallback case insights when the AI summary route is unavailable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as typeof fetch;

    const insights = await getCaseInsights({
      customerName: 'Libby',
      customerId: 'demo-customer-001',
      issueType: 'Router Activation',
      stage: 'case_processing',
      status: 'Provisioning Check',
      escalationState: 'Normal',
      handoffStatus: 'Not Requested',
      priority: 'Medium',
      assignedTo: null,
      assignedHumanAgent: null,
      etaOrExpectedUpdateTime: null,
      problemStatement: 'Activation still fails.',
      summary: 'Activation case in progress.',
      nextAction: 'Review provisioning state.',
      resolutionNote: '',
      internalNote: '',
      collectedFields: {
        routerModel: 'LC Router 100'
      },
      recentMessages: []
    });

    expect(insights.summary).toContain('Router Activation');
    expect(insights.customerUpdate).toContain('Current workflow status');
  });
});
