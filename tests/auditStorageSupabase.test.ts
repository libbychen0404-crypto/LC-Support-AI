import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAuditStorageAdapter, listAuditLogsForCase } from '../lib/auditStorageSupabase';

describe('auditStorageSupabase', () => {
  it('supports append-only audit row insertion with an injected Supabase client', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'audit-1',
        case_id: 'case-1',
        customer_id: 'cust-1',
        actor_type: 'agent',
        actor_id: 'agent-1',
        action_type: 'agent_priority_changed',
        action_subtype: 'priority',
        previous_value: { priority: 'Medium' },
        new_value: { priority: 'Urgent' },
        metadata: { reason: 'Escalated by agent review' },
        source: 'admin_panel',
        message_id: null,
        timeline_item_id: null,
        request_id: 'req-1',
        created_at: '2026-04-04T10:00:00.000Z'
      },
      error: null
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });

    const adapter = createSupabaseAuditStorageAdapter({ from } as never);
    const inserted = await adapter.appendAuditLog({
      caseId: 'case-1',
      customerId: 'cust-1',
      actorType: 'agent',
      actorId: 'agent-1',
      actionType: 'agent_priority_changed',
      actionSubtype: 'priority',
      previousValue: { priority: 'Medium' },
      newValue: { priority: 'Urgent' },
      metadata: { reason: 'Escalated by agent review' },
      source: 'admin_panel',
      requestId: 'req-1'
    });

    expect(from).toHaveBeenCalledWith('audit_logs');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        case_id: 'case-1',
        customer_id: 'cust-1',
        actor_type: 'agent',
        action_type: 'agent_priority_changed',
        metadata: { reason: 'Escalated by agent review' }
      })
    );
    expect(inserted.actionType).toBe('agent_priority_changed');
    expect(inserted.metadata).toEqual({ reason: 'Escalated by agent review' });
  });

  it('does not expose update or delete behavior on the audit storage adapter', () => {
    const adapter = createSupabaseAuditStorageAdapter({ from: vi.fn() } as never) as unknown as Record<string, unknown>;

    expect(Object.keys(adapter)).toEqual(['appendAuditLog']);
    expect('updateAuditLog' in adapter).toBe(false);
    expect('deleteAuditLog' in adapter).toBe(false);
  });

  it('queries audit rows for a case in chronological order', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'audit-1',
          case_id: 'case-1',
          customer_id: 'cust-1',
          actor_type: 'system',
          actor_id: null,
          action_type: 'system_case_classified',
          action_subtype: 'classification',
          previous_value: { issueType: null },
          new_value: { issueType: 'Router Repair' },
          metadata: {},
          source: 'system',
          message_id: null,
          timeline_item_id: null,
          request_id: null,
          created_at: '2026-04-05T10:32:00.000Z'
        }
      ],
      error: null
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const records = await listAuditLogsForCase('case-1', { from } as never);

    expect(from).toHaveBeenCalledWith('audit_logs');
    expect(eq).toHaveBeenCalledWith('case_id', 'case-1');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(records).toHaveLength(1);
    expect(records[0].actionType).toBe('system_case_classified');
  });
});
