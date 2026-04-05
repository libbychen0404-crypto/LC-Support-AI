import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppIdentityError } from '../lib/appIdentity';
import { AuthError, createAuthSessionToken } from '../lib/auth';
import { UserScopedSupabaseClientError } from '../lib/userScopedSupabase';
import type { CustomerAuthContext, CustomerFile, CustomerVisibleFile } from '../lib/types';

const routeExecutionMocks = vi.hoisted(() => ({
  resolveRequestCustomerRouteExecutionContext: vi.fn()
}));

const serviceMocks = vi.hoisted(() => ({
  loadCustomerWorkspace: vi.fn(),
  saveCustomerWorkspace: vi.fn(),
  resetCustomerWorkspace: vi.fn(),
  startNewCase: vi.fn(),
  loadCustomerCase: vi.fn()
}));

vi.mock('@/lib/customerRouteExecution', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/customerRouteExecution')>();

  return {
    ...actual,
    createCustomerRouteExecutionResolver: vi.fn(() => routeExecutionMocks)
  };
});

const { POST } = await import('../app/api/support-workspace/route');

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

function makeExecutionContext(overrides: Partial<CustomerAuthContext> = {}) {
  const authContext: CustomerAuthContext = {
    ...CUSTOMER_AUTH,
    ...overrides
  };

  return {
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

function makeFile(): CustomerFile {
  const now = new Date().toISOString();

  return {
    profile: {
      customerId: 'demo-customer-001',
      name: 'Libby',
      phone: '',
      email: '',
      lastSeenAt: now
    },
    activeCase: {
      caseId: 'case-1',
      issueType: null,
      status: 'New',
      stage: 'issue_discovery',
      escalationState: 'Normal',
      handoffStatus: 'Not Requested',
      assignedHumanAgent: null,
      handoffRequestedAt: null,
      handoffContactMethod: null,
      handoffCallbackWindow: '',
      handoffUrgencyReason: '',
      handoffAdditionalDetails: '',
      priority: 'Medium',
      assignedTo: null,
      etaOrExpectedUpdateTime: null,
      internalNote: '',
      resolutionNote: '',
      caseNote: '',
      customerUpdate: '',
      problemStatement: '',
      summary: 'Summary',
      nextAction: 'Ask the customer to describe the issue.',
      confirmed: false,
      requiredFields: [],
      pendingField: null,
      collectedFields: {},
      createdAt: now,
      updatedAt: now,
      messages: [],
      timeline: [],
      isOpen: true
    },
    cases: []
  };
}

describe('support-workspace route', () => {
  beforeEach(() => {
    Object.values(serviceMocks).forEach((mock) => mock.mockReset());
    routeExecutionMocks.resolveRequestCustomerRouteExecutionContext.mockReset();
    process.env.AUTH_SESSION_SECRET = 'test-auth-secret';
    routeExecutionMocks.resolveRequestCustomerRouteExecutionContext.mockResolvedValue(makeExecutionContext());
  });

  it('loads the workspace through the user-scoped execution layer', async () => {
    serviceMocks.loadCustomerWorkspace.mockResolvedValue({
      file: makeFile(),
      existed: true
    });

    const response = await POST(
      new Request('http://localhost/api/support-workspace', {
        method: 'POST',
        body: JSON.stringify({
          action: 'load',
          profileUpdates: { name: 'Libby' }
        }),
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { existed: boolean };
    expect(payload.existed).toBe(true);
    expect(routeExecutionMocks.resolveRequestCustomerRouteExecutionContext).toHaveBeenCalledOnce();
    expect(serviceMocks.loadCustomerWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        isAuthenticated: true,
        role: 'customer',
        customerId: 'demo-customer-001'
      }),
      { name: 'Libby' }
    );
  });

  it('returns a customer-safe workspace payload without internal-only fields', async () => {
    serviceMocks.loadCustomerWorkspace.mockResolvedValue({
      file: makeFile(),
      existed: true
    });

    const response = await POST(
      new Request('http://localhost/api/support-workspace', {
        method: 'POST',
        body: JSON.stringify({
          action: 'load'
        }),
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { file: CustomerVisibleFile };

    expect(payload.file.activeCase).not.toHaveProperty('internalNote');
    expect(payload.file.activeCase).not.toHaveProperty('assignedTo');
    expect(payload.file.activeCase).not.toHaveProperty('caseNote');
  });

  it('loads a selected historical case when load-case is requested', async () => {
    serviceMocks.loadCustomerCase.mockResolvedValue({
      file: makeFile(),
      existed: true
    });

    const response = await POST(
      new Request('http://localhost/api/support-workspace', {
        method: 'POST',
        body: JSON.stringify({
          action: 'load-case',
          caseId: 'case-1'
        }),
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(200);
    expect(serviceMocks.loadCustomerCase).toHaveBeenCalledWith(
      'case-1',
      expect.objectContaining({
        isAuthenticated: true,
        role: 'customer',
        customerId: 'demo-customer-001'
      })
    );
  });

  it('runs reset through the user-scoped customer execution path while preserving customer auth checks', async () => {
    serviceMocks.resetCustomerWorkspace.mockResolvedValue({
      file: makeFile(),
      existed: true
    });

    const response = await POST(
      new Request('http://localhost/api/support-workspace', {
        method: 'POST',
        body: JSON.stringify({
          action: 'reset',
          profileUpdates: { name: 'Libby' }
        }),
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(200);
    expect(routeExecutionMocks.resolveRequestCustomerRouteExecutionContext).toHaveBeenCalledOnce();
    expect(serviceMocks.resetCustomerWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        isAuthenticated: true,
        role: 'customer',
        customerId: 'demo-customer-001'
      }),
      { name: 'Libby' }
    );
  });

  it('runs start-new through the user-scoped customer execution path', async () => {
    serviceMocks.startNewCase.mockResolvedValue(makeFile());

    const response = await POST(
      new Request('http://localhost/api/support-workspace', {
        method: 'POST',
        body: JSON.stringify({
          action: 'start-new',
          profileUpdates: { name: 'Libby' }
        }),
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(200);
    expect(routeExecutionMocks.resolveRequestCustomerRouteExecutionContext).toHaveBeenCalledOnce();
    expect(serviceMocks.startNewCase).toHaveBeenCalledWith(
      expect.objectContaining({
        isAuthenticated: true,
        role: 'customer',
        customerId: 'demo-customer-001'
      }),
      { name: 'Libby' }
    );
  });

  it('returns a schema_mismatch code for Supabase column errors', async () => {
    routeExecutionMocks.resolveRequestCustomerRouteExecutionContext.mockRejectedValue({
      code: '42703',
      message: 'column cases.issue_type does not exist'
    });

    const response = await POST(
      new Request('http://localhost/api/support-workspace', {
        method: 'POST',
        body: JSON.stringify({
          action: 'load'
        }),
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('schema_mismatch');
  });

  it('returns an identity_mapping_missing code when the app user mapping is absent', async () => {
    routeExecutionMocks.resolveRequestCustomerRouteExecutionContext.mockRejectedValue(
      new AppIdentityError('No database identity mapping exists for the current signed-in user.', 'identity_mapping_missing')
    );

    const response = await POST(
      new Request('http://localhost/api/support-workspace', {
        method: 'POST',
        body: JSON.stringify({ action: 'load' }),
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('identity_mapping_missing');
  });

  it('returns a supabase_access_token_missing code when the request lacks a user token', async () => {
    routeExecutionMocks.resolveRequestCustomerRouteExecutionContext.mockRejectedValue(
      new UserScopedSupabaseClientError(
        'No Supabase user access token was found on the current request.',
        'supabase_access_token_missing'
      )
    );

    const response = await POST(
      new Request('http://localhost/api/support-workspace', {
        method: 'POST',
        body: JSON.stringify({ action: 'load' }),
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(401);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('supabase_access_token_missing');
  });

  it('returns 401 when the customer workspace route is called without a session', async () => {
    const response = await POST(
      new Request('http://localhost/api/support-workspace', {
        method: 'POST',
        body: JSON.stringify({
          action: 'load'
        }),
        headers: { 'Content-Type': 'application/json' }
      })
    );

    expect(response.status).toBe(401);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('unauthorized');
    expect(routeExecutionMocks.resolveRequestCustomerRouteExecutionContext).not.toHaveBeenCalled();
  });

  it('returns 403 when a signed-in customer forges another customerId in the payload before user-scoped execution runs', async () => {
    const response = await POST(
      new Request('http://localhost/api/support-workspace', {
        method: 'POST',
        body: JSON.stringify({
          action: 'load',
          customerId: 'demo-customer-999'
        }),
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('forbidden');
    expect(routeExecutionMocks.resolveRequestCustomerRouteExecutionContext).not.toHaveBeenCalled();
  });

  it('returns 403 when a signed-in customer forges another customerId while loading a case', async () => {
    const response = await POST(
      new Request('http://localhost/api/support-workspace', {
        method: 'POST',
        body: JSON.stringify({
          action: 'load-case',
          customerId: 'demo-customer-999',
          caseId: 'case-1'
        }),
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('forbidden');
    expect(routeExecutionMocks.resolveRequestCustomerRouteExecutionContext).not.toHaveBeenCalled();
  });

  it('returns 403 when the case does not belong to the signed-in customer', async () => {
    routeExecutionMocks.resolveRequestCustomerRouteExecutionContext.mockResolvedValue(makeExecutionContext());
    serviceMocks.loadCustomerCase.mockRejectedValue(
      new AuthError('You are not allowed to access this case.', 403, 'forbidden')
    );

    const response = await POST(
      new Request('http://localhost/api/support-workspace', {
        method: 'POST',
        body: JSON.stringify({
          action: 'load-case',
          caseId: 'case-belongs-to-someone-else'
        }),
        headers: { 'Content-Type': 'application/json', cookie: makeCustomerCookie() }
      })
    );

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('forbidden');
  });
});
