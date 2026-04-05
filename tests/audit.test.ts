import { describe, expect, it } from 'vitest';
import {
  AUDIT_ACTION_SUBTYPES,
  AUDIT_ACTION_TYPES,
  AUDIT_ACTOR_TYPES,
  AUDIT_EVENT_DEFINITIONS,
  AUDIT_LOG_SOURCES,
  isAuditActionSubtype,
  isAuditActionType,
  isAuditActorType,
  isAuditLogSource
} from '../lib/audit';
import type { AuditLogRecord } from '../lib/types';

describe('audit foundation', () => {
  it('defines a stable event catalog for the initial audit event set', () => {
    expect(AUDIT_ACTION_TYPES).toContain('case_created');
    expect(AUDIT_ACTION_TYPES).toContain('customer_handoff_requested');
    expect(AUDIT_ACTION_TYPES).toContain('agent_case_taken_over');
    expect(AUDIT_ACTION_TYPES).toContain('system_ai_case_note_generated');
    expect(Object.keys(AUDIT_EVENT_DEFINITIONS)).toHaveLength(AUDIT_ACTION_TYPES.length);
  });

  it('keeps actor types and sources explicit and narrow', () => {
    expect(AUDIT_ACTOR_TYPES).toEqual(['customer', 'agent', 'system']);
    expect(AUDIT_LOG_SOURCES).toEqual(['customer_workspace', 'admin_panel', 'system', 'ai']);
  });

  it('exposes narrow type guards for action, actor, source, and subtype validation', () => {
    expect(isAuditActorType('customer')).toBe(true);
    expect(isAuditActorType('anonymous')).toBe(false);
    expect(isAuditLogSource('admin_panel')).toBe(true);
    expect(isAuditLogSource('setup')).toBe(false);
    expect(isAuditActionType('agent_status_changed')).toBe(true);
    expect(isAuditActionType('case_updated')).toBe(false);
    expect(isAuditActionSubtype('handoff')).toBe(true);
    expect(isAuditActionSubtype('freeform')).toBe(false);
  });

  it('supports structured JSON-style snapshots without forcing schema expansion', () => {
    const record: AuditLogRecord = {
      id: 'audit-1',
      caseId: 'case-1',
      customerId: 'customer-storage-1',
      actorType: 'agent',
      actorId: 'agent-1',
      actionType: 'agent_priority_changed',
      actionSubtype: 'priority',
      previousValue: {
        priority: 'Medium'
      },
      newValue: {
        priority: 'Urgent'
      },
      metadata: {
        sourceReason: 'Escalated by agent review'
      },
      source: 'admin_panel',
      messageId: null,
      timelineItemId: null,
      requestId: 'req-1',
      createdAt: new Date().toISOString()
    };

    expect(record.previousValue).toEqual({ priority: 'Medium' });
    expect(record.newValue).toEqual({ priority: 'Urgent' });
  });

  it('keeps action subtype coverage explicit for supported audit categories', () => {
    expect(AUDIT_ACTION_SUBTYPES).toContain('status');
    expect(AUDIT_ACTION_SUBTYPES).toContain('priority');
    expect(AUDIT_ACTION_SUBTYPES).toContain('field_collection');
    expect(AUDIT_ACTION_SUBTYPES).toContain('internal_note');
  });
});
