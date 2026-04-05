import { describe, expect, it, vi } from 'vitest';
import { createSupabaseStorageAdapter, mapCaseRow, mapCustomerRow, toCaseRow } from '../lib/storageSupabase';
import { createUserScopedSupportServiceExecutionContext } from '../lib/supportServiceSupabase';

describe('storageSupabase mapping helpers', () => {
  it('maps customer rows into the persisted customer shape', () => {
    const customer = mapCustomerRow({
      id: 'cust-1',
      external_customer_id: 'demo-customer-001',
      name: 'Libby',
      phone: '0400 000 000',
      email: 'libby@example.com',
      last_seen_at: '2026-04-01T10:00:00.000Z'
    });

    expect(customer.profile.customerId).toBe('demo-customer-001');
    expect(customer.profile.name).toBe('Libby');
  });

  it('round-trips rich case operations fields through the row mappers', () => {
    const row = {
      id: '2b8e7c4d-b1d5-41e4-b7ff-ff5e36c9c427',
      customer_id: 'cust-1',
      issue_type: 'Router Repair' as const,
      status: 'Pending Technician' as const,
      stage: 'case_processing' as const,
      escalation_state: 'Escalated' as const,
      handoff_status: 'Awaiting Human Review' as const,
      assigned_human_agent: 'Alex Chen',
      handoff_requested_at: '2026-04-01T10:30:00.000Z',
      handoff_contact_method: 'Phone' as const,
      handoff_callback_window: 'Tomorrow 9am - 12pm',
      handoff_urgency_reason: 'The router is still offline.',
      handoff_additional_details: 'Please call the mobile number on file.',
      priority: 'High' as const,
      assigned_to: 'Tier 2 Queue',
      eta_or_expected_update_time: '2026-04-02T12:00:00.000Z',
      internal_note: 'Investigate the red light fault.',
      resolution_note: '',
      case_note: 'Compressed support note',
      customer_update: 'A technician review has been scheduled.',
      problem_statement: 'Red light on router',
      summary: 'Router repair case in progress.',
      next_action: 'Review technician findings.',
      confirmed: true,
      required_fields: ['routerModel', 'serialNumber', 'issueStartDate'],
      pending_field: null,
      messages: [],
      timeline: [],
      created_at: '2026-04-01T10:00:00.000Z',
      updated_at: '2026-04-01T11:00:00.000Z',
      archived_at: null,
      is_open: true
    };

    const mapped = mapCaseRow(row);
    const roundTrip = toCaseRow(mapped);

    expect(mapped.assignedTo).toBe('Tier 2 Queue');
    expect(mapped.priority).toBe('High');
    expect(mapped.escalationState).toBe('Escalated');
    expect(mapped.handoffStatus).toBe('Awaiting Human Review');
    expect(mapped.assignedHumanAgent).toBe('Alex Chen');
    expect(mapped.customerUpdate).toContain('technician');
    expect(mapped.archivedAt).toBeNull();
    expect(roundTrip.issue_type).toBe('Router Repair');
    expect(roundTrip.escalation_state).toBe('Escalated');
    expect(roundTrip.handoff_status).toBe('Awaiting Human Review');
    expect(roundTrip.assigned_to).toBe('Tier 2 Queue');
    expect(roundTrip.case_note).toBe('Compressed support note');
    expect(roundTrip.archived_at).toBeNull();
  });

  it('uses an injected Supabase client when building the storage adapter', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'cust-1',
        external_customer_id: 'demo-customer-001',
        name: 'Libby',
        phone: '0400 000 000',
        email: 'libby@example.com',
        last_seen_at: '2026-04-01T10:00:00.000Z'
      },
      error: null
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const adapter = createSupabaseStorageAdapter({ from } as never);
    const customer = await adapter.getCustomerByExternalId('demo-customer-001');

    expect(from).toHaveBeenCalledWith('customers');
    expect(select).toHaveBeenCalledWith('id, external_customer_id, name, phone, email, last_seen_at');
    expect(eq).toHaveBeenCalledWith('external_customer_id', 'demo-customer-001');
    expect(customer?.profile.customerId).toBe('demo-customer-001');
  });

  it('updates an existing customer record instead of issuing an upsert', async () => {
    const existingMaybeSingle = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          id: 'cust-1',
          external_customer_id: 'demo-customer-001',
          name: 'Old Name',
          phone: '',
          email: '',
          last_seen_at: '2026-04-01T10:00:00.000Z'
        },
        error: null
      })
      .mockResolvedValueOnce({
        data: {
          id: 'cust-1',
          external_customer_id: 'demo-customer-001',
          name: 'Libby',
          phone: '',
          email: '',
          last_seen_at: '2026-04-01T11:00:00.000Z'
        },
        error: null
      });

    const existingEq = vi.fn().mockReturnValue({ maybeSingle: existingMaybeSingle });
    const existingSelect = vi.fn().mockReturnValue({ eq: existingEq });

    const updateSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'cust-1',
        external_customer_id: 'demo-customer-001',
        name: 'Libby',
        phone: '',
        email: '',
        last_seen_at: '2026-04-01T11:00:00.000Z'
      },
      error: null
    });
    const updateSelect = vi.fn().mockReturnValue({ single: updateSingle });
    const updateEq = vi.fn().mockReturnValue({ select: updateSelect });
    const update = vi.fn().mockReturnValue({ eq: updateEq });

    const from = vi.fn((table: string) => {
      if (table === 'customers') {
        return {
          select: existingSelect,
          update
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const adapter = createSupabaseStorageAdapter({ from } as never);
    const customer = await adapter.createOrUpdateCustomer({
      customerId: 'demo-customer-001',
      name: 'Libby',
      phone: '',
      email: '',
      lastSeenAt: '2026-04-01T11:00:00.000Z'
    });

    expect(update).toHaveBeenCalledOnce();
    expect(customer.profile.name).toBe('Libby');
  });

  it('inserts a new customer record when no existing row matches the external customer id', async () => {
    const existingMaybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null
    });
    const existingEq = vi.fn().mockReturnValue({ maybeSingle: existingMaybeSingle });
    const existingSelect = vi.fn().mockReturnValue({ eq: existingEq });

    const insertSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'cust-2',
        external_customer_id: 'demo-customer-002',
        name: 'Dana',
        phone: '',
        email: '',
        last_seen_at: '2026-04-01T12:00:00.000Z'
      },
      error: null
    });
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });

    const update = vi.fn();
    const from = vi.fn((table: string) => {
      if (table === 'customers') {
        return {
          select: existingSelect,
          update,
          insert
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const adapter = createSupabaseStorageAdapter({ from } as never);
    const customer = await adapter.createOrUpdateCustomer({
      customerId: 'demo-customer-002',
      name: 'Dana',
      phone: '',
      email: '',
      lastSeenAt: '2026-04-01T12:00:00.000Z'
    });

    expect(insert).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(customer.profile.customerId).toBe('demo-customer-002');
  });

  it('can build an explicit user-scoped service execution context without changing service logic', () => {
    const fakeClient = { from: vi.fn() } as never;
    const context = createUserScopedSupportServiceExecutionContext(fakeClient);

    expect(context.privilege).toBe('user-scoped');
    expect(context.storage).toBeTruthy();
    expect(context.service).toBeTruthy();
  });

  it('filters hot customer case queries by archived_at and can still archive a case explicitly', async () => {
    const hotIs = vi.fn().mockResolvedValue({ data: [], error: null });
    const orderForList = vi.fn().mockReturnValue({ is: hotIs });
    const customerEq = vi.fn().mockReturnValue({ order: orderForList });
    const caseMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'case-1',
        customer_id: 'cust-1',
        issue_type: 'Router Repair',
        status: 'Closed',
        stage: 'resolved',
        escalation_state: 'Normal',
        handoff_status: 'Not Requested',
        assigned_human_agent: null,
        handoff_requested_at: null,
        handoff_contact_method: null,
        handoff_callback_window: null,
        handoff_urgency_reason: null,
        handoff_additional_details: null,
        priority: 'Low',
        assigned_to: null,
        eta_or_expected_update_time: null,
        internal_note: null,
        resolution_note: null,
        case_note: null,
        customer_update: null,
        problem_statement: 'Router issue',
        summary: 'Closed case',
        next_action: 'No further action.',
        confirmed: true,
        required_fields: [],
        pending_field: null,
        messages: [],
        timeline: [],
        created_at: '2026-04-01T10:00:00.000Z',
        updated_at: '2026-04-01T11:00:00.000Z',
        archived_at: null,
        is_open: false
      },
      error: null
    });
    const updateMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'case-1',
        customer_id: 'cust-1',
        issue_type: 'Router Repair',
        status: 'Closed',
        stage: 'resolved',
        escalation_state: 'Normal',
        handoff_status: 'Not Requested',
        assigned_human_agent: null,
        handoff_requested_at: null,
        handoff_contact_method: null,
        handoff_callback_window: null,
        handoff_urgency_reason: null,
        handoff_additional_details: null,
        priority: 'Low',
        assigned_to: null,
        eta_or_expected_update_time: null,
        internal_note: null,
        resolution_note: null,
        case_note: null,
        customer_update: null,
        problem_statement: 'Router issue',
        summary: 'Closed case',
        next_action: 'No further action.',
        confirmed: true,
        required_fields: [],
        pending_field: null,
        messages: [],
        timeline: [],
        created_at: '2026-04-01T10:00:00.000Z',
        updated_at: '2026-04-05T09:00:00.000Z',
        archived_at: '2026-04-05T09:00:00.000Z',
        is_open: false
      },
      error: null
    });
    const updateSelect = vi.fn().mockReturnValue({ maybeSingle: updateMaybeSingle });
    const updateEq = vi.fn().mockReturnValue({ select: updateSelect });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    const caseEq = vi.fn().mockReturnValue({ maybeSingle: caseMaybeSingle });

    const from = vi
      .fn()
      .mockImplementationOnce((table: string) => {
        if (table !== 'cases') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: vi.fn().mockReturnValue({ eq: customerEq }),
          update,
          eq: vi.fn().mockReturnValue({ select: updateSelect })
        };
      })
      .mockImplementationOnce((table: string) => {
        if (table !== 'cases') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: vi.fn().mockReturnValue({ eq: caseEq }),
          update,
          eq: vi.fn().mockReturnValue({ select: updateSelect })
        };
      })
      .mockImplementation((table: string) => {
      if (table !== 'cases') {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: vi.fn().mockReturnValue({ eq: caseEq }),
        update,
        eq: vi.fn().mockReturnValue({ select: updateSelect })
      };
      });

    const adapter = createSupabaseStorageAdapter({ from } as never);
    await adapter.listCasesForCustomer('cust-1');
    await adapter.archiveCase('case-1');

    expect(from).toHaveBeenCalledWith('cases');
    expect(customerEq).toHaveBeenCalledWith('customer_id', 'cust-1');
    expect(hotIs).toHaveBeenCalledWith('archived_at', null);
    expect(update).toHaveBeenCalledOnce();
  });
});
