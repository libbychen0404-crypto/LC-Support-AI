import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppIdentityError } from '../lib/appIdentity';
import { AuthError, createAuthSessionToken } from '../lib/auth';
import { ArchiveEligibilityError } from '../lib/supportService';
import { UserScopedSupabaseClientError } from '../lib/userScopedSupabase';
import type { AgentAuthContext } from '../lib/types';

const routeExecutionMocks = vi.hoisted(() => ({
  resolveRequestAdminRouteExecutionContext: vi.fn()
}));

const serviceMocks = vi.hoisted(() => ({
  loadAdminDashboard: vi.fn(),
  updateCaseOperations: vi.fn(),
  takeOverCase: vi.fn(),
  archiveCase: vi.fn()
}));

vi.mock('@/lib/adminRouteExecution', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/adminRouteExecution')>();

  return {
    ...actual,
    createAdminRouteExecutionResolver: vi.fn(() => routeExecutionMocks)
  };
});

const { GET, POST } = await import('../app/api/admin-support/route');

const AGENT_AUTH: AgentAuthContext = {
  isAuthenticated: true,
  role: 'agent',
  sessionId: 'session-agent-1',
  userId: '5ee8d032-ff8e-44c9-94ab-fbd69c1ef6b7',
  customerId: null,
  agentId: 'agent-1',
  agentName: 'Alex Chen'
};

function makeAgentCookie(overrides: Partial<AgentAuthContext> = {}) {
  process.env.AUTH_SESSION_SECRET = 'test-auth-secret';
  const token = createAuthSessionToken({
    role: 'agent',
    userId: overrides.userId ?? AGENT_AUTH.userId,
    agentId: overrides.agentId ?? AGENT_AUTH.agentId,
    agentName: overrides.agentName ?? AGENT_AUTH.agentName
  });

  return `lc_support_session=${token}`;
}

function makeCustomerCookie() {
  process.env.AUTH_SESSION_SECRET = 'test-auth-secret';
  const token = createAuthSessionToken({
    role: 'customer',
    userId: '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5',
    customerId: 'demo-customer-001'
  });

  return `lc_support_session=${token}`;
}

function makeExecutionContext(overrides: Partial<AgentAuthContext> = {}) {
  const authContext: AgentAuthContext = {
    ...AGENT_AUTH,
    ...overrides
  };

  return {
    privilege: 'user-scoped' as const,
    authContext,
    appIdentity: {
      kind: 'agent' as const,
      authContext,
      appUser: {
        authUserId: authContext.userId,
        role: 'agent' as const,
        customerStorageId: null,
        agentLabel: authContext.agentName,
        isActive: true,
        createdAt: '2026-04-04T10:00:00.000Z',
        updatedAt: '2026-04-04T10:00:00.000Z'
      }
    },
    userScopedContext: {
      privilege: 'user-scoped' as const,
      authContext,
      appIdentity: {
        kind: 'agent' as const,
        authContext,
        appUser: {
          authUserId: authContext.userId,
          role: 'agent' as const,
          customerStorageId: null,
          agentLabel: authContext.agentName,
          isActive: true,
          createdAt: '2026-04-04T10:00:00.000Z',
          updatedAt: '2026-04-04T10:00:00.000Z'
        }
      },
      accessToken: 'header.payload.signature',
      supabase: { from: vi.fn() }
    },
    storage: {},
    service: serviceMocks
  };
}

describe('admin-support route guards', () => {
  beforeEach(() => {
    Object.values(serviceMocks).forEach((mock) => mock.mockReset());
    routeExecutionMocks.resolveRequestAdminRouteExecutionContext.mockReset();
    process.env.AUTH_SESSION_SECRET = 'test-auth-secret';
    routeExecutionMocks.resolveRequestAdminRouteExecutionContext.mockResolvedValue(makeExecutionContext());
  });

  it('returns 401 for anonymous requests', async () => {
    const response = await GET(new Request('http://localhost/api/admin-support'));

    expect(response.status).toBe(401);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('unauthorized');
    expect(serviceMocks.loadAdminDashboard).not.toHaveBeenCalled();
  });

  it('returns 403 for customer requests', async () => {
    const response = await GET(
      new Request('http://localhost/api/admin-support', {
        headers: { cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('forbidden');
    expect(serviceMocks.loadAdminDashboard).not.toHaveBeenCalled();
  });

  it('allows valid agent requests through the user-scoped admin execution path', async () => {
    serviceMocks.loadAdminDashboard.mockResolvedValue({
      customers: [],
      openCases: [
        {
          caseId: 'case-1',
          customerId: 'demo-customer-001',
          customerName: 'Libby',
          issueType: 'Router Repair',
          status: 'Pending Technician',
          stage: 'case_processing',
          escalationState: 'Escalated',
          handoffStatus: 'Awaiting Human Review',
          assignedHumanAgent: null,
          handoffRequestedAt: null,
          handoffContactMethod: null,
          handoffCallbackWindow: '',
          handoffUrgencyReason: '',
          handoffAdditionalDetails: '',
          priority: 'Urgent',
          assignedTo: 'Tier 2 Queue',
          etaOrExpectedUpdateTime: null,
          internalNote: 'Agent-only internal note',
          resolutionNote: '',
          caseNote: 'Internal case note',
          customerUpdate: 'A specialist will review your case.',
          problemStatement: 'Router is down',
          summary: 'Repair summary',
          nextAction: 'Review technician findings.',
          confirmed: true,
          requiredFields: [],
          pendingField: null,
          collectedFields: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
          timeline: [],
          isOpen: true
        }
      ]
    });

    const response = await GET(
      new Request('http://localhost/api/admin-support', {
        headers: { cookie: makeAgentCookie() }
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { openCases: Array<Record<string, unknown>> };
    expect(payload.openCases[0]).toHaveProperty('internalNote');
    expect(payload.openCases[0]).toHaveProperty('assignedTo');
    expect(routeExecutionMocks.resolveRequestAdminRouteExecutionContext).toHaveBeenCalledOnce();
    expect(serviceMocks.loadAdminDashboard).toHaveBeenCalledWith(
      expect.objectContaining({
        isAuthenticated: true,
        role: 'agent',
        agentId: 'agent-1'
      })
    );
  });

  it('returns a clear identity-mapping error when the agent mapping is missing', async () => {
    routeExecutionMocks.resolveRequestAdminRouteExecutionContext.mockRejectedValue(
      new AppIdentityError('No database identity mapping exists for the current signed-in user.', 'identity_mapping_missing')
    );

    const response = await GET(
      new Request('http://localhost/api/admin-support', {
        headers: { cookie: makeAgentCookie() }
      })
    );

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('identity_mapping_missing');
  });

  it('returns a clear inactive-mapping error when the agent mapping is inactive', async () => {
    routeExecutionMocks.resolveRequestAdminRouteExecutionContext.mockRejectedValue(
      new AppIdentityError('The database identity mapping for the current user is inactive.', 'identity_mapping_inactive')
    );

    const response = await GET(
      new Request('http://localhost/api/admin-support', {
        headers: { cookie: makeAgentCookie() }
      })
    );

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('identity_mapping_inactive');
  });

  it('returns a clear invalid-mapping error when the mapped role is wrong', async () => {
    routeExecutionMocks.resolveRequestAdminRouteExecutionContext.mockRejectedValue(
      new AppIdentityError('The signed-in role does not match the mapped database identity role.', 'identity_mapping_invalid')
    );

    const response = await GET(
      new Request('http://localhost/api/admin-support', {
        headers: { cookie: makeAgentCookie() }
      })
    );

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('identity_mapping_invalid');
  });

  it('returns a clear missing-token error when no Supabase agent token is present', async () => {
    routeExecutionMocks.resolveRequestAdminRouteExecutionContext.mockRejectedValue(
      new UserScopedSupabaseClientError(
        'No Supabase user access token was found on the current request.',
        'supabase_access_token_missing'
      )
    );

    const response = await GET(
      new Request('http://localhost/api/admin-support', {
        headers: { cookie: makeAgentCookie() }
      })
    );

    expect(response.status).toBe(401);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('supabase_access_token_missing');
  });

  it('returns a clear invalid-token error when the Supabase agent token is malformed', async () => {
    routeExecutionMocks.resolveRequestAdminRouteExecutionContext.mockRejectedValue(
      new UserScopedSupabaseClientError(
        'The Supabase user access token could not be decoded.',
        'supabase_access_token_invalid'
      )
    );

    const response = await GET(
      new Request('http://localhost/api/admin-support', {
        headers: { cookie: makeAgentCookie() }
      })
    );

    expect(response.status).toBe(401);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('supabase_access_token_invalid');
  });

  it('returns a clear mismatch error when the app auth and Supabase user token do not align', async () => {
    routeExecutionMocks.resolveRequestAdminRouteExecutionContext.mockRejectedValue(
      new UserScopedSupabaseClientError(
        'The Supabase user access token does not match the mapped auth user.',
        'supabase_user_mismatch'
      )
    );

    const response = await GET(
      new Request('http://localhost/api/admin-support', {
        headers: { cookie: makeAgentCookie() }
      })
    );

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('supabase_user_mismatch');
  });

  it('lets an agent perform supported admin updates through the user-scoped execution path', async () => {
    serviceMocks.updateCaseOperations.mockResolvedValue({
      file: {
        profile: {
          customerId: 'demo-customer-001',
          name: 'Libby',
          phone: '',
          email: '',
          lastSeenAt: new Date().toISOString()
        },
        activeCase: {
          caseId: 'case-1'
        },
        cases: []
      },
      existed: true
    });

    const response = await POST(
      new Request('http://localhost/api/admin-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: makeAgentCookie() },
        body: JSON.stringify({
          customerId: 'demo-customer-001',
          caseId: 'case-1',
          status: 'Pending Technician'
        })
      })
    );

    expect(response.status).toBe(200);
    expect(routeExecutionMocks.resolveRequestAdminRouteExecutionContext).toHaveBeenCalledOnce();
    expect(serviceMocks.updateCaseOperations).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'demo-customer-001',
        caseId: 'case-1',
        status: 'Pending Technician',
        authContext: expect.objectContaining({
          role: 'agent',
          agentId: 'agent-1'
        })
      })
    );
  });

  it('returns an action-specific message when saving an admin case update fails', async () => {
    routeExecutionMocks.resolveRequestAdminRouteExecutionContext.mockResolvedValue(makeExecutionContext());
    serviceMocks.updateCaseOperations.mockRejectedValue(new Error('Cannot coerce the result to a single JSON object'));

    const response = await POST(
      new Request('http://localhost/api/admin-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: makeAgentCookie() },
        body: JSON.stringify({
          customerId: 'demo-customer-001',
          caseId: 'case-1',
          status: 'Investigating'
        })
      })
    );

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { error: string; detail: string };
    expect(payload.error).toBe('We could not save this case update right now. Refresh the dashboard and try again.');
    expect(payload.detail).toBe('Cannot coerce the result to a single JSON object');
  });

  it('lets an agent take over a case through the user-scoped execution path', async () => {
    serviceMocks.takeOverCase.mockResolvedValue({
      file: {
        profile: {
          customerId: 'demo-customer-001',
          name: 'Libby',
          phone: '',
          email: '',
          lastSeenAt: new Date().toISOString()
        },
        activeCase: {
          caseId: 'case-1'
        },
        cases: []
      },
      existed: true
    });

    const response = await POST(
      new Request('http://localhost/api/admin-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: makeAgentCookie() },
        body: JSON.stringify({
          customerId: 'demo-customer-001',
          caseId: 'case-1',
          action: 'take-over',
          agentName: 'Alex Chen'
        })
      })
    );

    expect(response.status).toBe(200);
    expect(serviceMocks.takeOverCase).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'demo-customer-001',
        caseId: 'case-1',
        agentName: 'Alex Chen',
        authContext: expect.objectContaining({
          role: 'agent',
          agentId: 'agent-1'
        })
      })
    );
  });

  it('returns an action-specific message when taking over a case fails', async () => {
    routeExecutionMocks.resolveRequestAdminRouteExecutionContext.mockResolvedValue(makeExecutionContext());
    serviceMocks.takeOverCase.mockRejectedValue(new Error('Cannot coerce the result to a single JSON object'));

    const response = await POST(
      new Request('http://localhost/api/admin-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: makeAgentCookie() },
        body: JSON.stringify({
          customerId: 'demo-customer-001',
          caseId: 'case-1',
          action: 'take-over',
          agentName: 'Alex Chen'
        })
      })
    );

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { error: string; detail: string };
    expect(payload.error).toBe('We could not assign this case to you right now. Refresh the dashboard and try again.');
    expect(payload.detail).toBe('Cannot coerce the result to a single JSON object');
  });

  it('lets an agent archive a closed case through the user-scoped execution path', async () => {
    serviceMocks.archiveCase.mockResolvedValue({
      file: {
        profile: {
          customerId: 'demo-customer-001',
          name: 'Libby',
          phone: '',
          email: '',
          lastSeenAt: new Date().toISOString()
        },
        activeCase: {
          caseId: 'case-1'
        },
        cases: []
      },
      existed: true
    });

    const response = await POST(
      new Request('http://localhost/api/admin-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: makeAgentCookie() },
        body: JSON.stringify({
          customerId: 'demo-customer-001',
          caseId: 'case-1',
          action: 'archive'
        })
      })
    );

    expect(response.status).toBe(200);
    expect(serviceMocks.archiveCase).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'demo-customer-001',
        caseId: 'case-1',
        authContext: expect.objectContaining({
          role: 'agent',
          agentId: 'agent-1'
        })
      })
    );
  });

  it('returns a clear archive eligibility error when the case is still active', async () => {
    serviceMocks.archiveCase.mockRejectedValue(
      new ArchiveEligibilityError('Only closed cases can be archived. Close the case before moving it out of the active queue.')
    );

    const response = await POST(
      new Request('http://localhost/api/admin-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: makeAgentCookie() },
        body: JSON.stringify({
          customerId: 'demo-customer-001',
          caseId: 'case-1',
          action: 'archive'
        })
      })
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string; errorCode: string };
    expect(payload.error).toBe('Only closed cases can be archived. Close the case before moving it out of the active queue.');
    expect(payload.errorCode).toBe('archive_not_allowed');
  });

  it('still blocks customer requests from using the admin archive action', async () => {
    const response = await POST(
      new Request('http://localhost/api/admin-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() },
        body: JSON.stringify({
          customerId: 'demo-customer-001',
          caseId: 'case-1',
          action: 'archive'
        })
      })
    );

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('forbidden');
    expect(serviceMocks.archiveCase).not.toHaveBeenCalled();
  });
});
