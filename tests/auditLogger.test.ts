import { describe, expect, it, vi } from 'vitest';
import { createAuditLogger, AuditLogError, auditValueNormalization, logAuditEvent } from '../lib/auditLogger';
import type { AuditStorageAdapter } from '../lib/auditStorage';

function createFakeAuditStorage() {
  const appendAuditLog = vi.fn(async (input) => ({
    id: 'audit-1',
    caseId: input.caseId,
    customerId: input.customerId,
    actorType: input.actorType,
    actorId: input.actorId,
    actionType: input.actionType,
    actionSubtype: input.actionSubtype ?? null,
    previousValue: input.previousValue ?? null,
    newValue: input.newValue ?? null,
    metadata: input.metadata ?? {},
    source: input.source,
    messageId: input.messageId ?? null,
    timelineItemId: input.timelineItemId ?? null,
    requestId: input.requestId ?? null,
    createdAt: input.createdAt ?? '2026-04-04T10:00:00.000Z'
  }));

  const storage: AuditStorageAdapter = {
    appendAuditLog
  };

  return { storage, appendAuditLog };
}

describe('audit logger', () => {
  it('writes one append-only audit row through the low-level path', async () => {
    const { storage, appendAuditLog } = createFakeAuditStorage();

    const record = await logAuditEvent(storage, {
      caseId: 'case-1',
      customerId: 'cust-1',
      actorType: 'agent',
      actorId: 'agent-1',
      actionType: 'agent_priority_changed',
      actionSubtype: 'priority',
      previousValue: { priority: 'Medium' },
      newValue: { priority: 'High' },
      metadata: { reason: 'Escalated review' },
      source: 'admin_panel'
    });

    expect(appendAuditLog).toHaveBeenCalledTimes(1);
    expect(record.actionType).toBe('agent_priority_changed');
    expect(record.metadata).toEqual({ reason: 'Escalated review' });
  });

  it('validates required fields before writing an audit row', async () => {
    const { storage, appendAuditLog } = createFakeAuditStorage();

    await expect(
      logAuditEvent(storage, {
        caseId: null,
        customerId: null,
        actorType: 'agent',
        actorId: 'agent-1',
        actionType: 'agent_priority_changed',
        source: 'admin_panel'
      })
    ).rejects.toMatchObject({
      code: 'audit_case_context_missing'
    });

    await expect(
      logAuditEvent(storage, {
        caseId: 'case-1',
        customerId: 'cust-1',
        actorType: 'customer',
        actorId: null,
        actionType: 'customer_message_sent',
        source: 'customer_workspace'
      })
    ).rejects.toMatchObject({
      code: 'audit_actor_id_missing'
    });

    expect(appendAuditLog).not.toHaveBeenCalled();
  });

  it('normalizes structured values and metadata before appending rows', async () => {
    const { storage, appendAuditLog } = createFakeAuditStorage();

    await logAuditEvent(storage, {
      caseId: 'case-1',
      customerId: 'cust-1',
      actorType: 'system',
      actorId: null,
      actionType: 'system_summary_updated',
      previousValue: {
        summary: undefined,
        lastUpdatedAt: new Date('2026-04-04T09:00:00.000Z')
      } as never,
      newValue: {
        summary: 'New concise summary',
        hints: [undefined, 'Include replacement timeline']
      } as never,
      metadata: {
        nested: {
          keep: true,
          drop: undefined
        }
      } as never,
      source: 'system'
    });

    expect(appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        previousValue: {
          lastUpdatedAt: '2026-04-04T09:00:00.000Z'
        },
        newValue: {
          summary: 'New concise summary',
          hints: [null, 'Include replacement timeline']
        },
        metadata: {
          nested: {
            keep: true
          }
        }
      })
    );
  });

  it('maps typed helper wrappers onto the expected actor, source, and action shape', async () => {
    const { storage, appendAuditLog } = createFakeAuditStorage();
    const logger = createAuditLogger(storage);

    await logger.logCaseCreated({
      caseId: 'case-1',
      customerId: 'cust-1',
      metadata: { createdBy: 'workflow' }
    });
    await logger.logCustomerCaseConfirmed({
      caseId: 'case-1',
      customerId: 'cust-1',
      actorId: 'customer-auth-1',
      newValue: { confirmed: true }
    });
    await logger.logCustomerCaseCorrectionRequested({
      caseId: 'case-1',
      customerId: 'cust-1',
      actorId: 'customer-auth-1',
      newValue: { stage: 'information_collection' }
    });
    await logger.logCustomerMessage({
      caseId: 'case-1',
      customerId: 'cust-1',
      actorId: 'customer-auth-1',
      messageId: 'msg-1',
      metadata: { channel: 'chat' }
    });
    await logger.logFieldCollection({
      caseId: 'case-1',
      customerId: 'cust-1',
      actorId: 'customer-auth-1',
      fieldKey: 'routerModel',
      newValue: { routerModel: 'LC Router 9000' }
    });
    await logger.logAgentAssignment({
      caseId: 'case-1',
      customerId: 'cust-1',
      actorId: 'agent-auth-1',
      newValue: { assignedTo: 'Alex Chen' }
    });
    await logger.logPriorityChange({
      caseId: 'case-1',
      customerId: 'cust-1',
      actorId: 'agent-auth-1',
      newValue: { priority: 'Urgent' }
    });
    await logger.logInternalNoteAdded({
      caseId: 'case-1',
      customerId: 'cust-1',
      actorId: 'agent-auth-1',
      metadata: { noteLength: 42 }
    });
    await logger.logInternalNoteUpdated({
      caseId: 'case-1',
      customerId: 'cust-1',
      actorId: 'agent-auth-1',
      newValue: { internalNote: 'Updated note' }
    });
    await logger.logResolutionNoteAdded({
      caseId: 'case-1',
      customerId: 'cust-1',
      actorId: 'agent-auth-1',
      newValue: { resolutionNote: 'Resolved.' }
    });
    await logger.logCustomerUpdateChanged({
      caseId: 'case-1',
      customerId: 'cust-1',
      actorId: 'agent-auth-1',
      newValue: { customerUpdate: 'We are reviewing the issue.' }
    });
    await logger.logHandoffStatusChanged({
      caseId: 'case-1',
      customerId: 'cust-1',
      actorId: 'agent-auth-1',
      newValue: { handoffStatus: 'Under Human Review' }
    });
    await logger.logEscalationChanged({
      caseId: 'case-1',
      customerId: 'cust-1',
      actorId: 'agent-auth-1',
      newValue: { escalationState: 'Escalated' }
    });
    await logger.logSystemClassification({
      caseId: 'case-1',
      customerId: 'cust-1',
      newValue: { issueType: 'Router Repair' }
    });
    await logger.logSystemStageTransition({
      caseId: 'case-1',
      customerId: 'cust-1',
      newValue: { stage: 'information_collection' }
    });
    await logger.logSystemNextActionUpdate({
      caseId: 'case-1',
      customerId: 'cust-1',
      newValue: { nextAction: 'Collect router model from the customer.' }
    });
    await logger.logSystemHandoffStateInitialized({
      caseId: 'case-1',
      customerId: 'cust-1',
      newValue: { handoffStatus: 'Awaiting Human Review' }
    });
    await logger.logSystemCaseNoteGenerated({
      caseId: 'case-1',
      customerId: 'cust-1',
      newValue: { caseNote: 'Compressed AI note.' }
    });
    await logger.logSystemSummaryUpdate({
      caseId: 'case-1',
      customerId: 'cust-1',
      newValue: { summary: 'Escalated repair summary' }
    });

    expect(appendAuditLog).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        actionType: 'case_created',
        actorType: 'system',
        source: 'system'
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        actionType: 'customer_case_confirmed',
        actorType: 'customer',
        source: 'customer_workspace'
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        actionType: 'customer_case_correction_requested',
        actorType: 'customer',
        source: 'customer_workspace'
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        actionType: 'customer_message_sent',
        actorType: 'customer',
        source: 'customer_workspace',
        messageId: 'msg-1'
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        actionType: 'customer_field_collected',
        actionSubtype: 'field_collection',
        metadata: { fieldKey: 'routerModel' }
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      6,
      expect.objectContaining({
        actionType: 'agent_case_assigned',
        actorType: 'agent',
        source: 'admin_panel'
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      7,
      expect.objectContaining({
        actionType: 'agent_priority_changed',
        actionSubtype: 'priority'
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      8,
      expect.objectContaining({
        actionType: 'agent_internal_note_added',
        actionSubtype: 'internal_note'
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      9,
      expect.objectContaining({
        actionType: 'agent_internal_note_updated',
        actionSubtype: 'internal_note'
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      10,
      expect.objectContaining({
        actionType: 'agent_resolution_note_added',
        actionSubtype: 'resolution'
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      11,
      expect.objectContaining({
        actionType: 'agent_customer_update_changed',
        actionSubtype: 'customer_update'
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      12,
      expect.objectContaining({
        actionType: 'agent_handoff_status_changed',
        actionSubtype: 'handoff'
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      13,
      expect.objectContaining({
        actionType: 'agent_escalation_changed',
        actionSubtype: 'escalation'
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      14,
      expect.objectContaining({
        actionType: 'system_case_classified',
        actorType: 'system',
        source: 'system'
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      15,
      expect.objectContaining({
        actionType: 'system_stage_transitioned',
        actionSubtype: 'stage'
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      16,
      expect.objectContaining({
        actionType: 'system_next_action_updated',
        actionSubtype: 'next_action'
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      17,
      expect.objectContaining({
        actionType: 'system_handoff_state_initialized',
        actionSubtype: 'handoff'
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      18,
      expect.objectContaining({
        actionType: 'system_ai_case_note_generated',
        source: 'ai'
      })
    );
    expect(appendAuditLog).toHaveBeenNthCalledWith(
      19,
      expect.objectContaining({
        actionType: 'system_summary_updated',
        actorType: 'system',
        source: 'system'
      })
    );
  });

  it('keeps normalization helpers stable for nested structured values', () => {
    expect(
      auditValueNormalization.normalizeStructuredValue({
        createdAt: new Date('2026-04-04T08:00:00.000Z'),
        nested: { drop: undefined, keep: ['a', undefined] }
      } as Record<string, unknown>)
    ).toEqual({
      createdAt: '2026-04-04T08:00:00.000Z',
      nested: {
        keep: ['a', null]
      }
    });

    expect(auditValueNormalization.normalizeMetadata('not-an-object')).toEqual({});
  });
});
