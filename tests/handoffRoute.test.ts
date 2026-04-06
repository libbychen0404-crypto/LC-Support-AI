import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppIdentityError } from '../lib/appIdentity';
import { AuthError, createAuthSessionToken } from '../lib/auth';
import { HandoffReadinessError } from '../lib/supportService';
import { UserScopedSupabaseClientError } from '../lib/userScopedSupabase';
import type { CustomerAuthContext } from '../lib/types';

const routeExecutionMocks = vi.hoisted(() => ({
  resolveRequestCustomerRouteExecutionContext: vi.fn()
}));

const serviceMocks = vi.hoisted(() => ({
  submitHandoffRequest: vi.fn()
}));

vi.mock('@/lib/customerRouteExecution', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/customerRouteExecution')>();

  return {
    ...actual,
    createCustomerRouteExecutionResolver: vi.fn(() => routeExecutionMocks)
  };
});

const { POST } = await import('../app/api/handoff/route');

const CUSTOMER_AUTH: CustomerAuthContext = {
  isAuthenticated: true,
  role: 'customer',
  sessionId: 'session-customer-1',
  userId: '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5',
  customerId: 'demo-customer-001',
  agentId: null,
  agentName: null
};

function makeCustomerCookie(overrides: Partial<CustomerAuthContext> = {}) {
  process.env.AUTH_SESSION_SECRET = 'test-auth-secret';
  const token = createAuthSessionToken({
    role: 'customer',
    userId: overrides.userId ?? CUSTOMER_AUTH.userId,
    customerId: overrides.customerId ?? CUSTOMER_AUTH.customerId
  });

  return `lc_support_session=${token}`;
}

function makeAgentCookie() {
  process.env.AUTH_SESSION_SECRET = 'test-auth-secret';
  const token = createAuthSessionToken({
    role: 'agent',
    userId: '5ee8d032-ff8e-44c9-94ab-fbd69c1ef6b7',
    agentId: 'agent-1',
    agentName: 'Alex Chen'
  });

  return `lc_support_session=${token}`;
}

function makeExecutionContext(
  overrides: Partial<CustomerAuthContext> = {},
  options: {
    effectiveCustomerId?: string;
    isDemo?: boolean;
  } = {}
) {
  const authContext: CustomerAuthContext = {
    ...CUSTOMER_AUTH,
    ...overrides
  };
  const effectiveCustomerId = options.effectiveCustomerId ?? authContext.customerId;
  const effectiveAuthContext: CustomerAuthContext = {
    ...authContext,
    customerId: effectiveCustomerId
  };

  return {
    privilege: 'user-scoped' as const,
    authContext,
    effectiveAuthContext,
    effectiveCustomerId,
    appIdentity: {
      kind: 'customer' as const,
      authContext,
      appUser: {
        authUserId: authContext.userId,
        role: 'customer' as const,
        customerStorageId: '9a3cbc61-b2f9-4f5d-9f52-6da06bcf6f54',
        agentLabel: null,
        isActive: true,
        isDemo: options.isDemo ?? false,
        createdAt: '2026-04-04T10:00:00.000Z',
        updatedAt: '2026-04-04T10:00:00.000Z'
      },
      customerStorageId: '9a3cbc61-b2f9-4f5d-9f52-6da06bcf6f54'
    },
    userScopedContext: {
      privilege: 'user-scoped' as const,
      authContext,
      appIdentity: {
        kind: 'customer' as const,
        authContext,
        appUser: {
          authUserId: authContext.userId,
          role: 'customer' as const,
          customerStorageId: '9a3cbc61-b2f9-4f5d-9f52-6da06bcf6f54',
          agentLabel: null,
          isActive: true,
          isDemo: options.isDemo ?? false,
          createdAt: '2026-04-04T10:00:00.000Z',
          updatedAt: '2026-04-04T10:00:00.000Z'
        },
        customerStorageId: '9a3cbc61-b2f9-4f5d-9f52-6da06bcf6f54'
      },
      accessToken: 'header.payload.signature',
      supabase: { from: vi.fn() }
    },
    storage: {},
    service: serviceMocks
  };
}

describe('handoff route guards', () => {
  beforeEach(() => {
    serviceMocks.submitHandoffRequest.mockReset();
    routeExecutionMocks.resolveRequestCustomerRouteExecutionContext.mockReset();
    process.env.AUTH_SESSION_SECRET = 'test-auth-secret';
    routeExecutionMocks.resolveRequestCustomerRouteExecutionContext.mockResolvedValue(makeExecutionContext());
  });

  it('returns 401 when called without a session', async () => {
    const response = await POST(
      new Request('http://localhost/api/handoff', {
        method: 'POST',
        body: JSON.stringify({
          caseId: 'case-1',
          preferredContactMethod: 'Phone',
          callbackTimeWindow: 'Tomorrow 9am - 12pm',
          urgencyReason: 'Need help'
        }),
        headers: { 'Content-Type': 'application/json' }
      })
    );

    expect(response.status).toBe(401);
    expect(serviceMocks.submitHandoffRequest).not.toHaveBeenCalled();
  });

  it('returns 403 for agent sessions because the route is customer-facing', async () => {
    const response = await POST(
      new Request('http://localhost/api/handoff', {
        method: 'POST',
        body: JSON.stringify({
          caseId: 'case-1',
          preferredContactMethod: 'Phone',
          callbackTimeWindow: 'Tomorrow 9am - 12pm',
          urgencyReason: 'Need help'
        }),
        headers: { 'Content-Type': 'application/json', cookie: makeAgentCookie() }
      })
    );

    expect(response.status).toBe(403);
    expect(serviceMocks.submitHandoffRequest).not.toHaveBeenCalled();
  });

  it('allows customer sessions through to the handoff service with user-scoped execution', async () => {
    serviceMocks.submitHandoffRequest.mockResolvedValue({
      file: {
        profile: {
          customerId: 'demo-customer-001',
          name: 'Libby',
          phone: '',
          email: '',
          lastSeenAt: new Date().toISOString()
        },
        activeCase: {
          caseId: 'case-1',
          issueType: 'Router Repair',
          status: 'Pending Technician',
          stage: 'case_processing',
          escalationState: 'Escalated',
          handoffStatus: 'Awaiting Human Review',
          assignedHumanAgent: null,
          handoffRequestedAt: new Date().toISOString(),
          handoffContactMethod: 'Phone',
          handoffCallbackWindow: 'Tomorrow 9am - 12pm',
          handoffUrgencyReason: 'Need help',
          handoffAdditionalDetails: '',
          priority: 'Urgent',
          assignedTo: 'Tier 2 Queue',
          etaOrExpectedUpdateTime: null,
          internalNote: 'Internal only',
          resolutionNote: '',
          caseNote: 'Internal compressed note',
          customerUpdate: 'A specialist will review your case.',
          problemStatement: 'Router is still down',
          summary: 'Repair case summary',
          nextAction: 'Awaiting human review.',
          confirmed: true,
          requiredFields: [],
          pendingField: null,
          collectedFields: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
          timeline: [],
          isOpen: true
        },
        cases: []
      },
      existed: true
    });

    const response = await POST(
      new Request('http://localhost/api/handoff', {
        method: 'POST',
        body: JSON.stringify({
          caseId: 'case-1',
          preferredContactMethod: 'Phone',
          callbackTimeWindow: 'Tomorrow 9am - 12pm',
          urgencyReason: 'Need help'
        }),
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { file: { activeCase: Record<string, unknown> } };
    expect(payload.file.activeCase).not.toHaveProperty('internalNote');
    expect(payload.file.activeCase).not.toHaveProperty('assignedTo');
    expect(payload.file.activeCase).not.toHaveProperty('caseNote');
    expect(routeExecutionMocks.resolveRequestCustomerRouteExecutionContext).toHaveBeenCalledOnce();
    expect(serviceMocks.submitHandoffRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        authContext: expect.objectContaining({
          isAuthenticated: true,
          role: 'customer',
          customerId: 'demo-customer-001'
        }),
        requestedCustomerId: 'demo-customer-001'
      })
    );
  });

  it('returns a clear identity-mapping error when the customer mapping is missing', async () => {
    routeExecutionMocks.resolveRequestCustomerRouteExecutionContext.mockRejectedValue(
      new AppIdentityError('No database identity mapping exists for the current signed-in user.', 'identity_mapping_missing')
    );

    const response = await POST(
      new Request('http://localhost/api/handoff', {
        method: 'POST',
        body: JSON.stringify({
          caseId: 'case-1',
          preferredContactMethod: 'Phone',
          callbackTimeWindow: 'Tomorrow 9am - 12pm',
          urgencyReason: 'Need help'
        }),
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('identity_mapping_missing');
  });

  it('returns a clear token error when the request is missing the Supabase user token', async () => {
    routeExecutionMocks.resolveRequestCustomerRouteExecutionContext.mockRejectedValue(
      new UserScopedSupabaseClientError(
        'No Supabase user access token was found on the current request.',
        'supabase_access_token_missing'
      )
    );

    const response = await POST(
      new Request('http://localhost/api/handoff', {
        method: 'POST',
        body: JSON.stringify({
          caseId: 'case-1',
          preferredContactMethod: 'Phone',
          callbackTimeWindow: 'Tomorrow 9am - 12pm',
          urgencyReason: 'Need help'
        }),
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(401);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('supabase_access_token_missing');
  });

  it('ignores a forged customerId in the handoff payload for a real customer', async () => {
    routeExecutionMocks.resolveRequestCustomerRouteExecutionContext.mockResolvedValue(
      makeExecutionContext(
        {
          customerId: 'stale-session-customer'
        },
        {
          effectiveCustomerId: 'cust_real_001',
          isDemo: false
        }
      )
    );
    serviceMocks.submitHandoffRequest.mockResolvedValue({
      file: {
        profile: {
          customerId: 'cust_real_001',
          name: 'Libby',
          phone: '',
          email: '',
          lastSeenAt: new Date().toISOString()
        },
        activeCase: {
          caseId: 'case-1',
          issueType: 'Router Repair',
          status: 'Pending Technician',
          stage: 'case_processing',
          escalationState: 'Escalated',
          handoffStatus: 'Awaiting Human Review',
          assignedHumanAgent: null,
          handoffRequestedAt: new Date().toISOString(),
          handoffContactMethod: 'Phone',
          handoffCallbackWindow: 'Tomorrow 9am - 12pm',
          handoffUrgencyReason: 'Need help',
          handoffAdditionalDetails: '',
          priority: 'Urgent',
          assignedTo: 'Tier 2 Queue',
          etaOrExpectedUpdateTime: null,
          internalNote: 'Internal only',
          resolutionNote: '',
          caseNote: 'Internal compressed note',
          customerUpdate: 'A specialist will review your case.',
          problemStatement: 'Router is still down',
          summary: 'Repair case summary',
          nextAction: 'Awaiting human review.',
          confirmed: true,
          requiredFields: [],
          pendingField: null,
          collectedFields: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
          timeline: [],
          isOpen: true
        },
        cases: []
      },
      existed: true
    });

    const response = await POST(
      new Request('http://localhost/api/handoff', {
        method: 'POST',
        body: JSON.stringify({
          customerId: 'demo-customer-999',
          caseId: 'case-1',
          preferredContactMethod: 'Phone',
          callbackTimeWindow: 'Tomorrow 9am - 12pm',
          urgencyReason: 'Need help'
        }),
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(200);
    expect(routeExecutionMocks.resolveRequestCustomerRouteExecutionContext).toHaveBeenCalledOnce();
    expect(serviceMocks.submitHandoffRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        authContext: expect.objectContaining({
          customerId: 'cust_real_001'
        }),
        requestedCustomerId: 'cust_real_001'
      })
    );
  });

  it('returns 403 when the case ownership check fails during handoff submission', async () => {
    serviceMocks.submitHandoffRequest.mockRejectedValue(
      new AuthError('You are not allowed to access this case.', 403, 'forbidden')
    );

    const response = await POST(
      new Request('http://localhost/api/handoff', {
        method: 'POST',
        body: JSON.stringify({
          caseId: 'case-belongs-to-someone-else',
          preferredContactMethod: 'Phone',
          callbackTimeWindow: 'Tomorrow 9am - 12pm',
          urgencyReason: 'Need help'
        }),
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('forbidden');
  });

  it('returns a clear structured error when handoff is blocked for a low-context case', async () => {
    serviceMocks.submitHandoffRequest.mockRejectedValue(
      new HandoffReadinessError(
        'We need a little more information about the issue before we can hand this case to a support agent. Please describe what is going wrong so we can capture the case details first.'
      )
    );

    const response = await POST(
      new Request('http://localhost/api/handoff', {
        method: 'POST',
        body: JSON.stringify({
          caseId: 'case-1',
          preferredContactMethod: 'Phone',
          callbackTimeWindow: 'Tomorrow 9am - 12pm',
          urgencyReason: 'Need help'
        }),
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string; errorCode: string };
    expect(payload.errorCode).toBe('handoff_context_required');
    expect(payload.error).toBe(
      'We need a little more information about the issue before we can hand this case to a support agent. Please describe what is going wrong so we can capture the case details first.'
    );
  });
});
