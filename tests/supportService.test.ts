import { describe, expect, it, vi } from 'vitest';
import { ArchiveEligibilityError, createSupportService, HandoffReadinessError } from '../lib/supportService';
import { createInMemoryStorageAdapter } from '../lib/storageMemory';
import { processCustomerMessage } from '../lib/caseLogic';
import type { AuditActionType, AuditLogRecord, AuthContext, CaseRecord } from '../lib/types';

const customerAuth: AuthContext = {
  isAuthenticated: true,
  role: 'customer',
  sessionId: 'session-customer-1',
  userId: 'user-customer-1',
  customerId: 'demo-customer-001',
  agentId: null,
  agentName: null
};

const agentAuth: AuthContext = {
  isAuthenticated: true,
  role: 'agent',
  sessionId: 'session-agent-1',
  userId: 'user-agent-1',
  customerId: null,
  agentId: 'agent-1',
  agentName: 'Alex Chen'
};

const secondCustomerAuth: AuthContext = {
  isAuthenticated: true,
  role: 'customer',
  sessionId: 'session-customer-2',
  userId: 'user-customer-2',
  customerId: 'demo-customer-002',
  agentId: null,
  agentName: null
};

function createAuditRecord(actionType: AuditActionType): AuditLogRecord {
  const actorType = actionType.startsWith('customer_')
    ? 'customer'
    : actionType.startsWith('agent_')
      ? 'agent'
      : 'system';

  const source =
    actorType === 'customer'
      ? 'customer_workspace'
      : actorType === 'agent'
        ? 'admin_panel'
        : 'system';

  return {
    id: `audit-${actionType}`,
    caseId: 'case-1',
    customerId: 'cust-1',
    actorType,
    actorId: actorType === 'customer' ? 'user-customer-1' : actorType === 'agent' ? 'user-agent-1' : null,
    actionType,
    actionSubtype: null,
    previousValue: null,
    newValue: null,
    metadata: {},
    source,
    messageId: null,
    timelineItemId: null,
    requestId: null,
    createdAt: new Date().toISOString()
  };
}

function createMockAuditLogger() {
  return {
    logAuditEvent: vi.fn().mockResolvedValue(createAuditRecord('case_created')),
    logCaseCreated: vi.fn().mockResolvedValue(createAuditRecord('case_created')),
    logCustomerCaseConfirmed: vi.fn().mockResolvedValue(createAuditRecord('customer_case_confirmed')),
    logCustomerCaseCorrectionRequested: vi
      .fn()
      .mockResolvedValue(createAuditRecord('customer_case_correction_requested')),
    logStatusChange: vi.fn().mockResolvedValue(createAuditRecord('case_status_changed')),
    logCustomerMessage: vi.fn().mockResolvedValue(createAuditRecord('customer_message_sent')),
    logFieldCollection: vi.fn().mockResolvedValue(createAuditRecord('customer_field_collected')),
    logHandoffRequest: vi.fn().mockResolvedValue(createAuditRecord('customer_handoff_requested')),
    logAgentAssignment: vi.fn().mockResolvedValue(createAuditRecord('agent_case_assigned')),
    logAgentTakeover: vi.fn().mockResolvedValue(createAuditRecord('agent_case_taken_over')),
    logPriorityChange: vi.fn().mockResolvedValue(createAuditRecord('agent_priority_changed')),
    logInternalNoteAdded: vi.fn().mockResolvedValue(createAuditRecord('agent_internal_note_added')),
    logInternalNoteUpdated: vi.fn().mockResolvedValue(createAuditRecord('agent_internal_note_updated')),
    logResolutionNoteAdded: vi.fn().mockResolvedValue(createAuditRecord('agent_resolution_note_added')),
    logCustomerUpdateChanged: vi.fn().mockResolvedValue(createAuditRecord('agent_customer_update_changed')),
    logHandoffStatusChanged: vi.fn().mockResolvedValue(createAuditRecord('agent_handoff_status_changed')),
    logEscalationChanged: vi.fn().mockResolvedValue(createAuditRecord('agent_escalation_changed')),
    logSystemClassification: vi.fn().mockResolvedValue(createAuditRecord('system_case_classified')),
    logSystemStageTransition: vi.fn().mockResolvedValue(createAuditRecord('system_stage_transitioned')),
    logSystemNextActionUpdate: vi.fn().mockResolvedValue(createAuditRecord('system_next_action_updated')),
    logSystemHandoffStateInitialized: vi.fn().mockResolvedValue(createAuditRecord('system_handoff_state_initialized')),
    logSystemCaseNoteGenerated: vi.fn().mockResolvedValue(createAuditRecord('system_ai_case_note_generated')),
    logSystemSummaryUpdate: vi.fn().mockResolvedValue(createAuditRecord('system_summary_updated'))
  };
}

function progressRepairCaseToConfirmation(activeCase: CaseRecord) {
  let nextCase = processCustomerMessage(activeCase, 'My router has a red light and is not working').updatedCase;
  nextCase = processCustomerMessage(nextCase, 'LC Router 9000').updatedCase;
  nextCase = processCustomerMessage(nextCase, 'SN-001').updatedCase;
  nextCase = processCustomerMessage(nextCase, '2026-03-30').updatedCase;
  nextCase = processCustomerMessage(nextCase, 'yes').updatedCase;
  nextCase = processCustomerMessage(nextCase, 'yes').updatedCase;
  nextCase = processCustomerMessage(nextCase, 'The internet drops every few minutes').updatedCase;
  return nextCase;
}

describe('supportService persistence behavior', () => {
  it('resumes an existing open case instead of creating a duplicate case', async () => {
    const service = createSupportService(createInMemoryStorageAdapter());

    const firstLoad = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');
    const secondLoad = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    expect(firstLoad.existed).toBe(false);
    expect(secondLoad.existed).toBe(true);
    expect(secondLoad.file.activeCase.caseId).toBe(firstLoad.file.activeCase.caseId);
  });

  it('creates a persisted handoff request tied to the active case', async () => {
    const service = createSupportService(createInMemoryStorageAdapter());
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    let activeCase = processCustomerMessage(loaded.file.activeCase, 'My router has a red light and is not working').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'LC Router 9000').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'SN-001').updatedCase;
    activeCase = processCustomerMessage(activeCase, '2026-03-30').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'yes').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'yes').updatedCase;
    activeCase = processCustomerMessage(activeCase, 'The internet drops every few minutes').updatedCase;

    const saved = await service.saveCustomerWorkspace({
      ...loaded.file,
      activeCase
    }, customerAuth);

    const handoffResult = await service.submitHandoffRequest({
      caseId: saved.activeCase.caseId,
      handoff: {
        preferredContactMethod: 'Phone',
        callbackTimeWindow: 'Tomorrow 9am - 12pm',
        urgencyReason: 'The router is still down and I need a human review.',
        additionalDetails: 'Please call before noon.'
      },
      authContext: customerAuth
    });

    expect(handoffResult.file.activeCase.handoffStatus).toBe('Awaiting Human Review');
    expect(handoffResult.file.activeCase.escalationState).toBe('Escalated');
    expect(handoffResult.file.activeCase.timeline.at(-1)?.title).toBe('Human support requested');
  });

  it('blocks handoff for a nearly empty case before enough context is collected', async () => {
    const service = createSupportService(createInMemoryStorageAdapter());
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    await expect(
      service.submitHandoffRequest({
        caseId: loaded.file.activeCase.caseId,
        handoff: {
          preferredContactMethod: 'Phone',
          callbackTimeWindow: 'Tomorrow 9am - 12pm',
          urgencyReason: 'Need a human review.',
          additionalDetails: ''
        },
        authContext: customerAuth
      })
    ).rejects.toMatchObject({
      code: 'handoff_context_required',
      message:
        'We need a little more information about the issue before we can hand this case to a support agent. Please describe what is going wrong so we can capture the case details first.'
    } satisfies Partial<HandoffReadinessError>);
  });

  it('blocks handoff when the case still lacks meaningful issue context at the greeting stage', async () => {
    const service = createSupportService(createInMemoryStorageAdapter());
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    const lowContextFile = {
      ...loaded.file,
      activeCase: {
        ...loaded.file.activeCase,
        stage: 'greeting' as const,
        problemStatement: 'Help',
        issueType: null
      }
    };

    const saved = await service.saveCustomerWorkspace(lowContextFile, customerAuth);

    await expect(
      service.submitHandoffRequest({
        caseId: saved.activeCase.caseId,
        handoff: {
          preferredContactMethod: 'Email',
          callbackTimeWindow: 'Today 4pm - 6pm',
          urgencyReason: 'Need a human review.',
          additionalDetails: ''
        },
        authContext: customerAuth
      })
    ).rejects.toMatchObject({
      code: 'handoff_context_required'
    } satisfies Partial<HandoffReadinessError>);
  });

  it('lets an admin take over a case and records the human assignment', async () => {
    const service = createSupportService(createInMemoryStorageAdapter());
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');
    const classifiedCase = processCustomerMessage(loaded.file.activeCase, 'My router has a red light and is not working').updatedCase;
    const saved = await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: classifiedCase
      },
      customerAuth
    );

    const handoffResult = await service.submitHandoffRequest({
      caseId: saved.activeCase.caseId,
      handoff: {
        preferredContactMethod: 'Email',
        callbackTimeWindow: 'Today 4pm - 6pm',
        urgencyReason: 'I want a specialist to review this.',
        additionalDetails: ''
      },
      authContext: customerAuth
    });

    const takeoverResult = await service.takeOverCase({
      customerId: handoffResult.file.profile.customerId,
      caseId: handoffResult.file.activeCase.caseId,
      agentName: 'Alex Chen',
      authContext: agentAuth
    });

    expect(takeoverResult.file.activeCase.assignedHumanAgent).toBe('Alex Chen');
    expect(takeoverResult.file.activeCase.handoffStatus).toBe('Under Human Review');
    expect(takeoverResult.file.activeCase.messages.at(-1)?.sender).toBe('agent');
  });

  it('emits the expected admin audit events when an agent takes over a case', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');
    const classifiedCase = processCustomerMessage(loaded.file.activeCase, 'My router has a red light and is not working').updatedCase;
    const saved = await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: classifiedCase
      },
      customerAuth
    );

    const handoffResult = await service.submitHandoffRequest({
      caseId: saved.activeCase.caseId,
      handoff: {
        preferredContactMethod: 'Email',
        callbackTimeWindow: 'Today 4pm - 6pm',
        urgencyReason: 'I want a specialist to review this.',
        additionalDetails: ''
      },
      authContext: customerAuth
    });

    vi.mocked(auditLogger.logAgentTakeover).mockClear();
    vi.mocked(auditLogger.logAgentAssignment).mockClear();
    vi.mocked(auditLogger.logHandoffStatusChanged).mockClear();
    vi.mocked(auditLogger.logCustomerUpdateChanged).mockClear();

    await service.takeOverCase({
      customerId: handoffResult.file.profile.customerId,
      caseId: handoffResult.file.activeCase.caseId,
      agentName: 'Alex Chen',
      authContext: agentAuth
    });

    expect(auditLogger.logAgentTakeover).toHaveBeenCalledOnce();
    expect(auditLogger.logAgentAssignment).toHaveBeenCalledOnce();
    expect(auditLogger.logHandoffStatusChanged).toHaveBeenCalledOnce();
    expect(auditLogger.logCustomerUpdateChanged).toHaveBeenCalledOnce();
  });

  it('emits agent_status_changed when an admin changes case status', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    const updated = await service.updateCaseOperations({
      customerId: loaded.file.profile.customerId,
      caseId: loaded.file.activeCase.caseId,
      status: 'Investigating',
      authContext: agentAuth
    });

    expect(updated.file.activeCase.status).toBe('Investigating');
    const statusCalls = vi
      .mocked(auditLogger.logStatusChange)
      .mock.calls.map(([payload]) => payload)
      .filter((payload) => payload.actionType === 'agent_status_changed');
    expect(statusCalls).toHaveLength(1);
    expect(statusCalls[0]).toEqual(
      expect.objectContaining({
        actorId: agentAuth.userId,
        previousValue: expect.objectContaining({ status: 'New' }),
        newValue: expect.objectContaining({ status: 'Investigating' })
      })
    );
  });

  it('emits agent_priority_changed when an admin changes priority', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    await service.updateCaseOperations({
      customerId: loaded.file.profile.customerId,
      caseId: loaded.file.activeCase.caseId,
      priority: 'Urgent',
      authContext: agentAuth
    });

    expect(auditLogger.logPriorityChange).toHaveBeenCalledOnce();
    expect(auditLogger.logPriorityChange).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: agentAuth.userId,
        previousValue: { priority: 'Medium' },
        newValue: { priority: 'Urgent' }
      })
    );
  });

  it('emits agent_internal_note_added when an internal note is added', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    await service.updateCaseOperations({
      customerId: loaded.file.profile.customerId,
      caseId: loaded.file.activeCase.caseId,
      internalNote: 'Initial admin review started.',
      authContext: agentAuth
    });

    expect(auditLogger.logInternalNoteAdded).toHaveBeenCalledOnce();
    expect(auditLogger.logInternalNoteUpdated).not.toHaveBeenCalled();
  });

  it('emits agent_internal_note_updated when an internal note changes', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    await service.updateCaseOperations({
      customerId: loaded.file.profile.customerId,
      caseId: loaded.file.activeCase.caseId,
      internalNote: 'Initial admin review started.',
      authContext: agentAuth
    });

    vi.mocked(auditLogger.logInternalNoteAdded).mockClear();
    vi.mocked(auditLogger.logInternalNoteUpdated).mockClear();

    await service.updateCaseOperations({
      customerId: loaded.file.profile.customerId,
      caseId: loaded.file.activeCase.caseId,
      internalNote: 'Updated admin note after deeper review.',
      authContext: agentAuth
    });

    expect(auditLogger.logInternalNoteAdded).not.toHaveBeenCalled();
    expect(auditLogger.logInternalNoteUpdated).toHaveBeenCalledOnce();
  });

  it('emits agent_resolution_note_added when a resolution note is first added', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    await service.updateCaseOperations({
      customerId: loaded.file.profile.customerId,
      caseId: loaded.file.activeCase.caseId,
      resolutionNote: 'Resolved after manual review.',
      authContext: agentAuth
    });

    expect(auditLogger.logResolutionNoteAdded).toHaveBeenCalledOnce();
  });

  it('emits agent_customer_update_changed and agent_handoff_status_changed when those admin fields change', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');
    const classifiedCase = processCustomerMessage(loaded.file.activeCase, 'My router has a red light and is not working').updatedCase;
    const saved = await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: classifiedCase
      },
      customerAuth
    );
    const handoffRequested = await service.submitHandoffRequest({
      caseId: saved.activeCase.caseId,
      handoff: {
        preferredContactMethod: 'Email',
        callbackTimeWindow: 'Today 4pm - 6pm',
        urgencyReason: 'I want a specialist to review this.',
        additionalDetails: ''
      },
      authContext: customerAuth
    });

    vi.mocked(auditLogger.logCustomerUpdateChanged).mockClear();
    vi.mocked(auditLogger.logHandoffStatusChanged).mockClear();

    await service.updateCaseOperations({
      customerId: handoffRequested.file.profile.customerId,
      caseId: handoffRequested.file.activeCase.caseId,
      customerUpdate: 'A specialist is now reviewing your request.',
      handoffStatus: 'Under Human Review',
      assignedHumanAgent: 'Alex Chen',
      authContext: agentAuth
    });

    expect(auditLogger.logCustomerUpdateChanged).toHaveBeenCalledOnce();
    expect(auditLogger.logHandoffStatusChanged).toHaveBeenCalledOnce();
  });

  it('emits agent_escalation_changed when the admin changes escalation state', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    await service.updateCaseOperations({
      customerId: loaded.file.profile.customerId,
      caseId: loaded.file.activeCase.caseId,
      escalationState: 'Escalated',
      authContext: agentAuth
    });

    expect(auditLogger.logEscalationChanged).toHaveBeenCalledOnce();
  });

  it('does not emit noisy admin audit events for a no-op case update', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    await service.updateCaseOperations({
      customerId: loaded.file.profile.customerId,
      caseId: loaded.file.activeCase.caseId,
      authContext: agentAuth
    });

    expect(auditLogger.logAgentAssignment).not.toHaveBeenCalled();
    expect(auditLogger.logStatusChange).not.toHaveBeenCalled();
    expect(auditLogger.logPriorityChange).not.toHaveBeenCalled();
    expect(auditLogger.logInternalNoteAdded).not.toHaveBeenCalled();
    expect(auditLogger.logInternalNoteUpdated).not.toHaveBeenCalled();
    expect(auditLogger.logResolutionNoteAdded).not.toHaveBeenCalled();
    expect(auditLogger.logCustomerUpdateChanged).not.toHaveBeenCalled();
    expect(auditLogger.logHandoffStatusChanged).not.toHaveBeenCalled();
    expect(auditLogger.logEscalationChanged).not.toHaveBeenCalled();
  });

  it('keeps the admin flow working even if admin audit logging fails', async () => {
    const auditLogger = createMockAuditLogger();
    vi.mocked(auditLogger.logPriorityChange).mockRejectedValue(new Error('audit table unavailable'));

    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    const updated = await service.updateCaseOperations({
      customerId: loaded.file.profile.customerId,
      caseId: loaded.file.activeCase.caseId,
      priority: 'High',
      authContext: agentAuth
    });

    expect(updated.file.activeCase.priority).toBe('High');
  });

  it('emits case_created when the customer flow creates a new case', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });

    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    expect(loaded.file.activeCase.caseId).toBeTruthy();
    expect(auditLogger.logCaseCreated).toHaveBeenCalledOnce();
    expect(auditLogger.logCaseCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: loaded.file.activeCase.caseId,
        source: 'customer_workspace'
      })
    );
  });

  it('emits customer_message_sent when a customer message is saved', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    const updatedCase = processCustomerMessage(loaded.file.activeCase, 'My router has a red light and is not working').updatedCase;

    await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: updatedCase
      },
      customerAuth
    );

    expect(auditLogger.logCustomerMessage).toHaveBeenCalledOnce();
    expect(auditLogger.logCustomerMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: updatedCase.caseId,
        customerId: expect.any(String),
        actorId: customerAuth.userId,
        messageId: updatedCase.messages.at(-1)?.id
      })
    );
  });

  it('emits customer_field_collected when a structured field changes meaningfully', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');
    const classified = processCustomerMessage(loaded.file.activeCase, 'My router has a red light and is not working').updatedCase;

    await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: classified
      },
      customerAuth
    );
    vi.mocked(auditLogger.logCustomerMessage).mockClear();

    const fieldUpdated = processCustomerMessage(classified, 'LC Router 9000').updatedCase;
    await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: fieldUpdated
      },
      customerAuth
    );

    expect(auditLogger.logFieldCollection).toHaveBeenCalledOnce();
    expect(auditLogger.logFieldCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: fieldUpdated.caseId,
        actorId: customerAuth.userId,
        fieldKey: 'routerModel',
        previousValue: null,
        newValue: 'LC Router 9000'
      })
    );
  });

  it('emits customer_case_confirmed when the customer confirms the draft case', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    const caseReadyForConfirmation = progressRepairCaseToConfirmation(loaded.file.activeCase);
    await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: caseReadyForConfirmation
      },
      customerAuth
    );
    vi.mocked(auditLogger.logCustomerCaseConfirmed).mockClear();

    const confirmedCase = processCustomerMessage(caseReadyForConfirmation, 'yes').updatedCase;
    await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: confirmedCase
      },
      customerAuth
    );

    expect(auditLogger.logCustomerCaseConfirmed).toHaveBeenCalledOnce();
    expect(auditLogger.logCustomerCaseConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: confirmedCase.caseId,
        actorId: customerAuth.userId,
        newValue: expect.objectContaining({
          confirmed: true,
          stage: 'case_processing'
        })
      })
    );
  });

  it('emits customer_case_correction_requested when the customer rejects the draft', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    const caseReadyForConfirmation = progressRepairCaseToConfirmation(loaded.file.activeCase);
    await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: caseReadyForConfirmation
      },
      customerAuth
    );
    vi.mocked(auditLogger.logCustomerCaseCorrectionRequested).mockClear();

    const revisedCase = processCustomerMessage(caseReadyForConfirmation, 'no').updatedCase;
    await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: revisedCase
      },
      customerAuth
    );

    expect(auditLogger.logCustomerCaseCorrectionRequested).toHaveBeenCalledOnce();
    expect(auditLogger.logCustomerCaseCorrectionRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: revisedCase.caseId,
        actorId: customerAuth.userId,
        previousValue: expect.objectContaining({
          stage: 'case_confirmation'
        }),
        newValue: expect.objectContaining({
          stage: 'information_collection'
        })
      })
    );
  });

  it('emits customer_handoff_requested when the rightful customer requests human support', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');
    const classifiedCase = processCustomerMessage(loaded.file.activeCase, 'My router has a red light and is not working').updatedCase;
    const saved = await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: classifiedCase
      },
      customerAuth
    );

    const handoffResult = await service.submitHandoffRequest({
      caseId: saved.activeCase.caseId,
      handoff: {
        preferredContactMethod: 'Phone',
        callbackTimeWindow: 'Tomorrow 9am - 12pm',
        urgencyReason: 'Please route this to a human specialist.',
        additionalDetails: 'Keep the current case context.'
      },
      authContext: customerAuth
    });

    expect(handoffResult.file.activeCase.handoffStatus).toBe('Awaiting Human Review');
    expect(auditLogger.logHandoffRequest).toHaveBeenCalledOnce();
    expect(auditLogger.logHandoffRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: loaded.file.activeCase.caseId,
        actorId: customerAuth.userId,
        metadata: expect.objectContaining({
          preferredContactMethod: 'Phone',
          callbackTimeWindow: 'Tomorrow 9am - 12pm'
        })
      })
    );
  });

  it('emits system_case_classified and system_stage_transitioned during customer workflow progression', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    const updatedCase = processCustomerMessage(loaded.file.activeCase, 'My router has a red light and is not working').updatedCase;

    await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: updatedCase
      },
      customerAuth
    );

    expect(auditLogger.logSystemClassification).toHaveBeenCalledOnce();
    expect(auditLogger.logSystemStageTransition).toHaveBeenCalledOnce();
  });

  it('emits system_status_transitioned when the workflow promotes a confirmed case into an operational status', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    const caseReadyForConfirmation = progressRepairCaseToConfirmation(loaded.file.activeCase);
    await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: caseReadyForConfirmation
      },
      customerAuth
    );
    vi.mocked(auditLogger.logStatusChange).mockClear();

    const confirmedCase = processCustomerMessage(caseReadyForConfirmation, 'yes').updatedCase;
    await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: confirmedCase
      },
      customerAuth
    );

    expect(auditLogger.logStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'system_status_transitioned',
        actorType: 'system',
        previousValue: expect.objectContaining({ status: 'New' }),
        newValue: expect.objectContaining({ status: confirmedCase.status })
      })
    );
  });

  it('emits system_handoff_state_initialized when the customer handoff flow initializes the human-support state', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');
    const classifiedCase = processCustomerMessage(loaded.file.activeCase, 'My router has a red light and is not working').updatedCase;
    const saved = await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: classifiedCase
      },
      customerAuth
    );

    await service.submitHandoffRequest({
      caseId: saved.activeCase.caseId,
      handoff: {
        preferredContactMethod: 'Phone',
        callbackTimeWindow: 'Tomorrow 9am - 12pm',
        urgencyReason: 'Please route this to a human specialist.',
        additionalDetails: 'Keep the current case context.'
      },
      authContext: customerAuth
    });

    expect(auditLogger.logSystemHandoffStateInitialized).toHaveBeenCalledOnce();
  });

  it('emits system_summary_updated and system_next_action_updated when the backend recalculates them meaningfully', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    const classifiedCase = processCustomerMessage(loaded.file.activeCase, 'My router has a red light and is not working').updatedCase;
    const saved = await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: classifiedCase
      },
      customerAuth
    );

    vi.mocked(auditLogger.logSystemSummaryUpdate).mockClear();
    vi.mocked(auditLogger.logSystemNextActionUpdate).mockClear();

    await service.submitHandoffRequest({
      caseId: saved.activeCase.caseId,
      handoff: {
        preferredContactMethod: 'Phone',
        callbackTimeWindow: 'Tomorrow 9am - 12pm',
        urgencyReason: 'Please route this to a human specialist.',
        additionalDetails: 'Keep the current case context.'
      },
      authContext: customerAuth
    });

    expect(auditLogger.logSystemSummaryUpdate).toHaveBeenCalledOnce();
    expect(auditLogger.logSystemNextActionUpdate).toHaveBeenCalledOnce();
  });

  it('emits system_ai_case_note_generated when a generated case note changes meaningfully', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: {
          ...loaded.file.activeCase,
          caseNote: 'Compressed AI case note.'
        }
      },
      customerAuth
    );

    expect(auditLogger.logSystemCaseNoteGenerated).toHaveBeenCalledOnce();
  });

  it('does not emit noisy system audit events for a no-op save', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    vi.mocked(auditLogger.logCaseCreated).mockClear();

    await service.saveCustomerWorkspace(loaded.file, customerAuth);

    expect(auditLogger.logSystemClassification).not.toHaveBeenCalled();
    expect(auditLogger.logSystemStageTransition).not.toHaveBeenCalled();
    expect(auditLogger.logStatusChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'system_status_transitioned' })
    );
    expect(auditLogger.logSystemSummaryUpdate).not.toHaveBeenCalled();
    expect(auditLogger.logSystemNextActionUpdate).not.toHaveBeenCalled();
    expect(auditLogger.logSystemCaseNoteGenerated).not.toHaveBeenCalled();
  });

  it('keeps the workflow working even if a system audit write fails after a successful mutation', async () => {
    const auditLogger = createMockAuditLogger();
    vi.mocked(auditLogger.logSystemClassification).mockRejectedValue(new Error('audit table unavailable'));

    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');
    const updatedCase = processCustomerMessage(loaded.file.activeCase, 'My router has a red light and is not working').updatedCase;

    const saved = await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: updatedCase
      },
      customerAuth
    );

    expect(saved.activeCase.issueType).toBe('Router Repair');
    expect(saved.activeCase.stage).toBe('information_collection');
  });

  it('does not emit noisy customer audit events on a no-op save', async () => {
    const auditLogger = createMockAuditLogger();
    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    vi.mocked(auditLogger.logCaseCreated).mockClear();

    const saved = await service.saveCustomerWorkspace(loaded.file, customerAuth);

    expect(saved.activeCase.caseId).toBe(loaded.file.activeCase.caseId);
    expect(auditLogger.logCustomerMessage).not.toHaveBeenCalled();
    expect(auditLogger.logFieldCollection).not.toHaveBeenCalled();
    expect(auditLogger.logCustomerCaseConfirmed).not.toHaveBeenCalled();
    expect(auditLogger.logCustomerCaseCorrectionRequested).not.toHaveBeenCalled();
    expect(auditLogger.logHandoffRequest).not.toHaveBeenCalled();
  });

  it('keeps the customer flow working even if audit logging fails after a successful mutation', async () => {
    const auditLogger = createMockAuditLogger();
    vi.mocked(auditLogger.logCustomerMessage).mockRejectedValue(new Error('audit table unavailable'));

    const service = createSupportService(createInMemoryStorageAdapter(), { auditLogger });
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');
    const updatedCase = processCustomerMessage(loaded.file.activeCase, 'My router has a red light and is not working').updatedCase;

    const saved = await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: updatedCase
      },
      customerAuth
    );

    expect(saved.activeCase.problemStatement).toBe('My router has a red light and is not working');
    expect(saved.activeCase.messages.some((message) => message.sender === 'customer')).toBe(true);
  });

  it('rejects forged customerId input in customer-facing service methods', async () => {
    const service = createSupportService(createInMemoryStorageAdapter());

    await expect(
      service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-002')
    ).rejects.toThrow('You are not allowed to access another customer profile.');
  });

  it('prevents one customer from loading another customer case by caseId', async () => {
    const service = createSupportService(createInMemoryStorageAdapter());
    const firstCustomer = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');
    await service.loadCustomerWorkspace(secondCustomerAuth, { name: 'Dana' }, 'demo-customer-002');

    await expect(
      service.loadCustomerCase(firstCustomer.file.activeCase.caseId, secondCustomerAuth)
    ).rejects.toThrow('You are not allowed to access this case.');
  });

  it('resets the workspace by opening a fresh case under the same customer identity', async () => {
    const service = createSupportService(createInMemoryStorageAdapter());
    const initial = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    const reset = await service.resetCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    expect(reset.file.profile.customerId).toBe('demo-customer-001');
    expect(reset.file.activeCase.caseId).not.toBe(initial.file.activeCase.caseId);
    expect(reset.file.cases.length).toBeGreaterThanOrEqual(2);
    expect(reset.file.activeCase.isOpen).toBe(true);
  });

  it('excludes archived cases from hot customer history and admin hot queues while preserving the stored case record', async () => {
    const service = createSupportService(createInMemoryStorageAdapter());
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    const closed = await service.updateCaseOperations({
      customerId: loaded.file.profile.customerId,
      caseId: loaded.file.activeCase.caseId,
      status: 'Closed',
      authContext: agentAuth
    });

    const storage = createInMemoryStorageAdapter();
    const seededService = createSupportService(storage);
    await seededService.saveCustomerWorkspace(closed.file, customerAuth);
    await storage.archiveCase(closed.file.activeCase.caseId);

    const reloaded = await seededService.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');
    const adminDashboard = await seededService.loadAdminDashboard(agentAuth);
    const archivedCase = await seededService.loadCustomerCase(closed.file.activeCase.caseId, customerAuth);

    expect(reloaded.file.activeCase.caseId).not.toBe(closed.file.activeCase.caseId);
    expect(reloaded.file.cases.some((caseRecord) => caseRecord.caseId === closed.file.activeCase.caseId)).toBe(false);
    expect(adminDashboard.openCases.some((caseRecord) => caseRecord.caseId === closed.file.activeCase.caseId)).toBe(false);
    expect(archivedCase.file.activeCase.caseId).toBe(closed.file.activeCase.caseId);
    expect(archivedCase.file.activeCase.archivedAt).toBeTruthy();
  });

  it('lets an agent manually archive an eligible closed case without deleting its stored history', async () => {
    const storage = createInMemoryStorageAdapter();
    const service = createSupportService(storage);
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    const closed = await service.updateCaseOperations({
      customerId: loaded.file.profile.customerId,
      caseId: loaded.file.activeCase.caseId,
      status: 'Closed',
      authContext: agentAuth
    });

    const archived = await service.archiveCase({
      customerId: closed.file.profile.customerId,
      caseId: closed.file.activeCase.caseId,
      authContext: agentAuth
    });

    const reloaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');
    const archivedLookup = await service.loadCustomerCase(closed.file.activeCase.caseId, customerAuth);

    expect(archived.file.activeCase.archivedAt).toBeTruthy();
    expect(reloaded.file.activeCase.caseId).not.toBe(closed.file.activeCase.caseId);
    expect(reloaded.file.cases.some((caseRecord) => caseRecord.caseId === closed.file.activeCase.caseId)).toBe(false);
    expect(archivedLookup.file.activeCase.caseId).toBe(closed.file.activeCase.caseId);
    expect(archivedLookup.file.activeCase.archivedAt).toBeTruthy();
  });

  it('prevents an agent from archiving an active case', async () => {
    const service = createSupportService(createInMemoryStorageAdapter());
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    await expect(
      service.archiveCase({
        customerId: loaded.file.profile.customerId,
        caseId: loaded.file.activeCase.caseId,
        authContext: agentAuth
      })
    ).rejects.toMatchObject({
      code: 'archive_not_allowed',
      message: 'Only closed cases can be archived. Close the case before moving it out of the active queue.'
    } satisfies Partial<ArchiveEligibilityError>);
  });

  it('keeps the summary and next action aligned when the case stage advances into information collection', async () => {
    const service = createSupportService(createInMemoryStorageAdapter());
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    const updatedCase = processCustomerMessage(loaded.file.activeCase, 'My router has a red light and is not working').updatedCase;
    const saved = await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: updatedCase
      },
      customerAuth
    );

    expect(saved.activeCase.stage).toBe('information_collection');
    expect(saved.activeCase.pendingField).toBe('routerModel');
    expect(saved.activeCase.summary).toContain('Stage: information_collection.');
    expect(saved.activeCase.summary).toContain('Workflow status: New.');
    expect(saved.activeCase.nextAction).toBe('Collect router model so the draft case can be completed.');
  });

  it('keeps the summary, next action, and handoff state aligned when an agent closes a case', async () => {
    const service = createSupportService(createInMemoryStorageAdapter());
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    const updated = await service.updateCaseOperations({
      customerId: loaded.file.profile.customerId,
      caseId: loaded.file.activeCase.caseId,
      status: 'Closed',
      authContext: agentAuth
    });

    expect(updated.file.activeCase.status).toBe('Closed');
    expect(updated.file.activeCase.stage).toBe('resolved');
    expect(updated.file.activeCase.handoffStatus).toBe('Not Requested');
    expect(updated.file.activeCase.nextAction).toBe(
      'No further action is required unless the customer reopens the issue.'
    );
    expect(updated.file.activeCase.summary).toContain('Stage: resolved.');
    expect(updated.file.activeCase.summary).toContain('Workflow status: Closed.');
    expect(updated.file.activeCase.summary).toContain('Human support status: AI-led support only.');
  });

  it('only marks handoff as completed after a real human takeover and completion', async () => {
    const service = createSupportService(createInMemoryStorageAdapter());
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');
    const classifiedCase = processCustomerMessage(loaded.file.activeCase, 'My router has a red light and is not working').updatedCase;
    const saved = await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: classifiedCase
      },
      customerAuth
    );

    const handoffRequested = await service.submitHandoffRequest({
      caseId: saved.activeCase.caseId,
      handoff: {
        preferredContactMethod: 'Phone',
        callbackTimeWindow: 'Tomorrow 9am - 12pm',
        urgencyReason: 'Please route this to a human specialist.',
        additionalDetails: 'Keep the current case context.'
      },
      authContext: customerAuth
    });

    expect(handoffRequested.file.activeCase.handoffStatus).toBe('Awaiting Human Review');
    expect(handoffRequested.file.activeCase.summary).toContain('Human support status: Human Review Requested.');

    const takenOver = await service.takeOverCase({
      customerId: handoffRequested.file.profile.customerId,
      caseId: handoffRequested.file.activeCase.caseId,
      agentName: 'Alex Chen',
      authContext: agentAuth
    });

    expect(takenOver.file.activeCase.handoffStatus).toBe('Under Human Review');
    expect(takenOver.file.activeCase.summary).toContain('Assigned human agent: Alex Chen.');

    const closed = await service.updateCaseOperations({
      customerId: takenOver.file.profile.customerId,
      caseId: takenOver.file.activeCase.caseId,
      status: 'Closed',
      authContext: agentAuth
    });

    expect(closed.file.activeCase.handoffStatus).toBe('Completed');
    expect(closed.file.activeCase.summary).toContain('Human support status: Human Support Completed.');
  });

  it('opens a fresh case without inheriting old summary, next action, or handoff state', async () => {
    const service = createSupportService(createInMemoryStorageAdapter());
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');
    const classifiedCase = processCustomerMessage(loaded.file.activeCase, 'My router has a red light and is not working').updatedCase;
    const saved = await service.saveCustomerWorkspace(
      {
        ...loaded.file,
        activeCase: classifiedCase
      },
      customerAuth
    );

    await service.submitHandoffRequest({
      caseId: saved.activeCase.caseId,
      handoff: {
        preferredContactMethod: 'Phone',
        callbackTimeWindow: 'Tomorrow 9am - 12pm',
        urgencyReason: 'Please route this to a human specialist.',
        additionalDetails: 'Keep the current case context.'
      },
      authContext: customerAuth
    });

    const reset = await service.resetCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    expect(reset.file.activeCase.caseId).not.toBe(saved.activeCase.caseId);
    expect(reset.file.activeCase.status).toBe('New');
    expect(reset.file.activeCase.stage).toBe('greeting');
    expect(reset.file.activeCase.handoffStatus).toBe('Not Requested');
    expect(reset.file.activeCase.summary).toContain('Workflow status: New.');
    expect(reset.file.activeCase.summary).toContain('Human support status: AI-led support only.');
    expect(reset.file.activeCase.nextAction).toBe(
      'Ask the customer to describe the router issue clearly so the case can be classified.'
    );
  });

  it('re-synchronizes stale historical cases when they are loaded back from storage', async () => {
    const now = '2026-04-05T10:00:00.000Z';
    const customer = {
      id: 'cust-1',
      profile: {
        customerId: 'demo-customer-001',
        name: 'Libby',
        phone: '',
        email: '',
        lastSeenAt: now
      }
    };

    const staleCase = {
      caseId: 'case-stale-1',
      customerStorageId: 'cust-1',
      issueType: 'Router Repair' as const,
      status: 'Closed' as const,
      stage: 'greeting' as const,
      escalationState: 'Escalated' as const,
      handoffStatus: 'Completed' as const,
      assignedHumanAgent: null,
      handoffRequestedAt: null,
      handoffContactMethod: null,
      handoffCallbackWindow: '',
      handoffUrgencyReason: '',
      handoffAdditionalDetails: '',
      priority: 'Urgent' as const,
      assignedTo: null,
      etaOrExpectedUpdateTime: null,
      internalNote: '',
      resolutionNote: '',
      caseNote: '',
      customerUpdate: '',
      problemStatement: 'My router stopped working yesterday.',
      summary: 'Workflow status: New. Old stale summary.',
      nextAction: 'Ask the customer to describe the issue.',
      confirmed: true,
      requiredFields: ['routerModel', 'serialNumber'],
      pendingField: 'routerModel' as const,
      createdAt: now,
      updatedAt: now,
      messages: [],
      timeline: [],
      archivedAt: null,
      isOpen: false
    };

    const storage = {
      getCustomerByExternalId: vi.fn().mockResolvedValue(customer),
      getCustomerById: vi.fn().mockResolvedValue(customer),
      createOrUpdateCustomer: vi.fn().mockResolvedValue(customer),
      listCustomers: vi.fn().mockResolvedValue([]),
      getOpenCaseForCustomer: vi.fn().mockResolvedValue(null),
      listCasesForCustomer: vi.fn().mockResolvedValue([staleCase]),
      listOpenCases: vi.fn().mockResolvedValue([]),
      getCaseById: vi.fn().mockResolvedValue(staleCase),
      createCase: vi.fn().mockResolvedValue(staleCase),
      updateCase: vi.fn().mockResolvedValue(staleCase),
      archiveOpenCasesForCustomer: vi.fn().mockResolvedValue(undefined),
      archiveCase: vi.fn().mockResolvedValue(staleCase),
      getCollectedFields: vi.fn().mockResolvedValue({}),
      upsertCollectedField: vi.fn().mockResolvedValue(undefined),
      clearCollectedFields: vi.fn().mockResolvedValue(undefined),
      deleteCustomerByExternalId: vi.fn().mockResolvedValue(undefined)
    };

    const service = createSupportService(storage as never);
    const loaded = await service.loadCustomerCase('case-stale-1', customerAuth);

    expect(loaded.file.activeCase.status).toBe('Closed');
    expect(loaded.file.activeCase.stage).toBe('resolved');
    expect(loaded.file.activeCase.handoffStatus).toBe('Not Requested');
    expect(loaded.file.activeCase.escalationState).toBe('Normal');
    expect(loaded.file.activeCase.summary).toContain('Workflow status: Closed.');
    expect(loaded.file.activeCase.summary).toContain('Stage: resolved.');
    expect(loaded.file.activeCase.nextAction).toBe(
      'No further action is required unless the customer reopens the issue.'
    );
  });

  it('keeps no-op admin updates from corrupting the current summary and next action', async () => {
    const service = createSupportService(createInMemoryStorageAdapter());
    const loaded = await service.loadCustomerWorkspace(customerAuth, { name: 'Libby' }, 'demo-customer-001');

    const originalSummary = loaded.file.activeCase.summary;
    const originalNextAction = loaded.file.activeCase.nextAction;

    const updated = await service.updateCaseOperations({
      customerId: loaded.file.profile.customerId,
      caseId: loaded.file.activeCase.caseId,
      authContext: agentAuth
    });

    expect(updated.file.activeCase.summary).toBe(originalSummary);
    expect(updated.file.activeCase.nextAction).toBe(originalNextAction);
  });

  it('persists collected fields through additive upserts without clearing the full field set first', async () => {
    const now = '2026-04-04T10:00:00.000Z';
    const customer = {
      id: 'cust-1',
      profile: {
        customerId: 'demo-customer-001',
        name: 'Libby',
        phone: '',
        email: '',
        lastSeenAt: now
      }
    };
    const persistedCase = {
      caseId: 'case-1',
      customerStorageId: 'cust-1',
      issueType: null,
      status: 'New' as const,
      stage: 'information_collection' as const,
      escalationState: 'Normal' as const,
      handoffStatus: 'Not Requested' as const,
      assignedHumanAgent: null,
      handoffRequestedAt: null,
      handoffContactMethod: null,
      handoffCallbackWindow: '',
      handoffUrgencyReason: '',
      handoffAdditionalDetails: '',
      priority: 'Medium' as const,
      assignedTo: null,
      etaOrExpectedUpdateTime: null,
      internalNote: '',
      resolutionNote: '',
      caseNote: '',
      customerUpdate: '',
      problemStatement: '',
      summary: 'Summary',
      nextAction: 'Next action',
      confirmed: false,
      requiredFields: [],
      pendingField: null,
      createdAt: now,
      updatedAt: now,
      messages: [],
      timeline: [],
      archivedAt: null,
      isOpen: true
    };

    const storage = {
      getCustomerByExternalId: vi.fn().mockResolvedValue(customer),
      getCustomerById: vi.fn().mockResolvedValue(customer),
      createOrUpdateCustomer: vi.fn().mockResolvedValue(customer),
      listCustomers: vi.fn().mockResolvedValue([]),
      getOpenCaseForCustomer: vi.fn().mockResolvedValue(persistedCase),
      listCasesForCustomer: vi.fn().mockResolvedValue([persistedCase]),
      listOpenCases: vi.fn().mockResolvedValue([persistedCase]),
      getCaseById: vi.fn().mockResolvedValue(persistedCase),
      createCase: vi.fn().mockResolvedValue(persistedCase),
      updateCase: vi.fn().mockResolvedValue(persistedCase),
      archiveOpenCasesForCustomer: vi.fn().mockResolvedValue(undefined),
      archiveCase: vi.fn().mockResolvedValue(persistedCase),
      getCollectedFields: vi.fn().mockResolvedValue({ routerModel: 'LC Router 9000' }),
      upsertCollectedField: vi.fn().mockResolvedValue(undefined),
      clearCollectedFields: vi.fn().mockResolvedValue(undefined),
      deleteCustomerByExternalId: vi.fn().mockResolvedValue(undefined)
    };

    const service = createSupportService(storage as never);

    await service.saveCustomerWorkspace(
      {
        profile: customer.profile,
        activeCase: {
          ...persistedCase,
          collectedFields: {
            routerModel: 'LC Router 9000',
            serialNumber: 'SN-001'
          }
        },
        cases: []
      },
      customerAuth
    );

    expect(storage.clearCollectedFields).not.toHaveBeenCalled();
    expect(storage.upsertCollectedField).toHaveBeenCalledWith('case-1', 'routerModel', 'LC Router 9000');
    expect(storage.upsertCollectedField).toHaveBeenCalledWith('case-1', 'serialNumber', 'SN-001');
  });

  it('lets an agent update a case without attempting to rewrite the customer profile', async () => {
    const now = '2026-04-04T10:00:00.000Z';
    const customer = {
      id: 'cust-1',
      profile: {
        customerId: 'demo-customer-001',
        name: 'Libby',
        phone: '',
        email: '',
        lastSeenAt: now
      }
    };
    const persistedCase = {
      caseId: 'case-1',
      customerStorageId: 'cust-1',
      issueType: 'Router Repair' as const,
      status: 'New' as const,
      stage: 'information_collection' as const,
      escalationState: 'Normal' as const,
      handoffStatus: 'Awaiting Human Review' as const,
      assignedHumanAgent: null,
      handoffRequestedAt: null,
      handoffContactMethod: null,
      handoffCallbackWindow: '',
      handoffUrgencyReason: '',
      handoffAdditionalDetails: '',
      priority: 'Urgent' as const,
      assignedTo: null,
      etaOrExpectedUpdateTime: null,
      internalNote: '',
      resolutionNote: '',
      caseNote: '',
      customerUpdate: '',
      problemStatement: 'Router offline',
      summary: 'Summary',
      nextAction: 'Collect router model.',
      confirmed: false,
      requiredFields: [],
      pendingField: null,
      createdAt: now,
      updatedAt: now,
      messages: [],
      timeline: [],
      archivedAt: null,
      isOpen: true
    };

    const storage = {
      getCustomerByExternalId: vi.fn().mockResolvedValue(customer),
      getCustomerById: vi.fn().mockResolvedValue(customer),
      createOrUpdateCustomer: vi.fn().mockResolvedValue(customer),
      listCustomers: vi.fn().mockResolvedValue([]),
      getOpenCaseForCustomer: vi.fn().mockResolvedValue(persistedCase),
      listCasesForCustomer: vi.fn().mockResolvedValue([persistedCase]),
      listOpenCases: vi.fn().mockResolvedValue([persistedCase]),
      getCaseById: vi.fn().mockResolvedValue(persistedCase),
      createCase: vi.fn().mockResolvedValue(persistedCase),
      updateCase: vi.fn().mockImplementation(async (_caseId, nextCase) => ({
        ...nextCase
      })),
      archiveOpenCasesForCustomer: vi.fn().mockResolvedValue(undefined),
      archiveCase: vi.fn().mockResolvedValue(persistedCase),
      getCollectedFields: vi.fn().mockResolvedValue({}),
      upsertCollectedField: vi.fn().mockResolvedValue(undefined),
      clearCollectedFields: vi.fn().mockResolvedValue(undefined),
      deleteCustomerByExternalId: vi.fn().mockResolvedValue(undefined)
    };

    const service = createSupportService(storage as never);

    await service.updateCaseOperations({
      customerId: 'demo-customer-001',
      caseId: 'case-1',
      status: 'Investigating',
      internalNote: 'Initial admin review started.',
      authContext: agentAuth
    });

    expect(storage.createOrUpdateCustomer).not.toHaveBeenCalled();
    expect(storage.updateCase).toHaveBeenCalledWith(
      'case-1',
      expect.objectContaining({
        status: 'Investigating',
        internalNote: 'Initial admin review started.'
      })
    );
  });
});
