import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAuthContextFromSessionToken } from '../lib/auth';
import { createDemoSession } from '../lib/demoAuth';

const signInWithPasswordMock = vi.hoisted(() => vi.fn());
const loadAppUserByAuthUserIdMock = vi.hoisted(() => vi.fn());
const getSupabaseServiceRoleClientMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase', () => ({
  SUPABASE_USER_ACCESS_TOKEN_COOKIE_NAME: 'lc_support_supabase_access_token',
  createSupabaseAnonClient: () => ({
    auth: {
      signInWithPassword: signInWithPasswordMock
    }
  }),
  getSupabaseServiceRoleClient: getSupabaseServiceRoleClientMock
}));

vi.mock('../lib/appIdentity', () => ({
  loadAppUserByAuthUserId: loadAppUserByAuthUserIdMock
}));

const originalEnv = {
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  DEMO_CUSTOMER_EMAIL: process.env.DEMO_CUSTOMER_EMAIL,
  DEMO_CUSTOMER_PASSWORD: process.env.DEMO_CUSTOMER_PASSWORD,
  DEMO_AGENT_EMAIL: process.env.DEMO_AGENT_EMAIL,
  DEMO_AGENT_PASSWORD: process.env.DEMO_AGENT_PASSWORD
};

describe('demo auth foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = 'test-auth-secret';
    process.env.DEMO_CUSTOMER_EMAIL = 'customer@example.com';
    process.env.DEMO_CUSTOMER_PASSWORD = 'customer-password';
    process.env.DEMO_AGENT_EMAIL = 'agent@example.com';
    process.env.DEMO_AGENT_PASSWORD = 'agent-password';
  });

  afterEach(() => {
    process.env.AUTH_SESSION_SECRET = originalEnv.AUTH_SESSION_SECRET;
    process.env.DEMO_CUSTOMER_EMAIL = originalEnv.DEMO_CUSTOMER_EMAIL;
    process.env.DEMO_CUSTOMER_PASSWORD = originalEnv.DEMO_CUSTOMER_PASSWORD;
    process.env.DEMO_AGENT_EMAIL = originalEnv.DEMO_AGENT_EMAIL;
    process.env.DEMO_AGENT_PASSWORD = originalEnv.DEMO_AGENT_PASSWORD;
  });

  it('creates a valid customer demo session and redirect target', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: {
        user: { id: '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5' },
        session: { access_token: 'header.eyJzdWIiOiI3N2I1YTRmOC1hYWYwLTQ4YmMtYjkzZi0wNGQyMDRlZDRhZDUifQ.signature' }
      },
      error: null
    });
    loadAppUserByAuthUserIdMock.mockResolvedValue({
      authUserId: '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5',
      role: 'customer',
      customerStorageId: 'cust-storage-1',
      agentLabel: null,
      isActive: true,
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z'
    });
    getSupabaseServiceRoleClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                external_customer_id: 'demo-customer-001'
              },
              error: null
            })
          })
        })
      })
    });

    const result = await createDemoSession('customer');
    const authContext = resolveAuthContextFromSessionToken(result.appSessionToken);

    expect(result.redirectTo).toBe('/chat');
    expect(result.supabaseAccessToken).toContain('eyJzdWIi');
    expect(authContext.isAuthenticated).toBe(true);
    expect(authContext.role).toBe('customer');
    expect(authContext.customerId).toBe('demo-customer-001');
  });

  it('creates a valid agent demo session and redirect target', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: {
        user: { id: '41f0a7bb-93fe-4cf0-b014-f0bcbf9cf111' },
        session: { access_token: 'header.eyJzdWIiOiI0MWYwYTdiYi05M2ZlLTRjZjAtYjAxNC1mMGJjYmY5Y2YxMTEifQ.signature' }
      },
      error: null
    });
    loadAppUserByAuthUserIdMock.mockResolvedValue({
      authUserId: '41f0a7bb-93fe-4cf0-b014-f0bcbf9cf111',
      role: 'agent',
      customerStorageId: null,
      agentLabel: 'Alex Chen',
      isActive: true,
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-04T00:00:00.000Z'
    });

    const result = await createDemoSession('agent');
    const authContext = resolveAuthContextFromSessionToken(result.appSessionToken);

    expect(result.redirectTo).toBe('/admin');
    expect(authContext.isAuthenticated).toBe(true);
    expect(authContext.role).toBe('agent');
    expect(authContext.agentName).toBe('Alex Chen');
  });
});
