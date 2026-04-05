import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from '../lib/auth';

const runSetupCheckMock = vi.hoisted(() => vi.fn());
const requireProductionSetupAccessMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/setupCheck', () => ({
  runSetupCheck: runSetupCheckMock
}));

vi.mock('../lib/security', async () => {
  const actual = await vi.importActual<typeof import('../lib/security')>('../lib/security');
  return {
    ...actual,
    requireProductionSetupAccess: requireProductionSetupAccessMock
  };
});

describe('setup-check route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    requireProductionSetupAccessMock.mockReturnValue(undefined);
    runSetupCheckMock.mockResolvedValue({
      env: {
        supabaseUrl: true,
        supabaseServiceRoleKey: true,
        supabaseAnonKey: true,
        openAiKey: false,
        authSessionSecret: true,
        demoCustomerEmail: true,
        demoCustomerPassword: true,
        demoAgentEmail: true,
        demoAgentPassword: true
      },
      schema: {
        customers: true,
        cases: true,
        collectedFields: true,
        appUsers: true,
        auditLogs: true,
        rlsEnabled: true,
        legacyCaseType: false
      },
      identity: {
        ready: true,
        anyActiveMappings: true,
        customerMappings: true,
        agentMappings: true,
        userScopedClientReady: true,
        demoSignInEnvReady: true
      },
      ready: true,
      details: [],
      advisories: []
    });
  });

  it('blocks unauthenticated production access to /api/setup-check without exposing diagnostics', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    requireProductionSetupAccessMock.mockImplementation(() => {
      throw new AuthError('Sign in first.', 401, 'unauthorized');
    });

    const { GET } = await import('../app/api/setup-check/route');
    const response = await GET(new Request('http://localhost/api/setup-check'));

    expect(response.status).toBe(401);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload).toMatchObject({
      errorCode: 'unauthorized'
    });
    expect(payload).not.toHaveProperty('env');
    expect(payload).not.toHaveProperty('schema');
    expect(payload).not.toHaveProperty('identity');
    expect(runSetupCheckMock).not.toHaveBeenCalled();
  });

  it('returns setup diagnostics in non-production for the existing developer workflow', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    const { GET } = await import('../app/api/setup-check/route');
    const response = await GET(new Request('http://localhost/api/setup-check'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ready: true,
      env: expect.objectContaining({
        supabaseUrl: true
      })
    });
  });
});
