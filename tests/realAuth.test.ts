import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAuthContextFromSessionToken } from '../lib/auth';
import { finalizeRealUserSession, RealAuthError, toSafeAuthSessionSummary } from '../lib/realAuth';
import type { AppUserRecord, AuthContext } from '../lib/types';

const loadAppUserByAuthUserIdMock = vi.hoisted(() => vi.fn());
const getSupabaseServiceRoleClientMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/appIdentity', () => ({
  loadAppUserByAuthUserId: loadAppUserByAuthUserIdMock
}));

vi.mock('../lib/supabase', () => ({
  SUPABASE_USER_ACCESS_TOKEN_COOKIE_NAME: 'lc_support_supabase_access_token',
  getSupabaseServiceRoleClient: getSupabaseServiceRoleClientMock
}));

const originalSecret = process.env.AUTH_SESSION_SECRET;

describe('real auth session finalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = 'test-auth-secret';
  });

  afterEach(() => {
    process.env.AUTH_SESSION_SECRET = originalSecret;
  });

  it('finalizes a customer auth user into the shared app session model', async () => {
    loadAppUserByAuthUserIdMock.mockResolvedValue({
      authUserId: '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5',
      role: 'customer',
      customerStorageId: 'cust-storage-1',
      agentLabel: null,
      isActive: true,
      isDemo: false,
      createdAt: '2026-04-06T12:00:00.000Z',
      updatedAt: '2026-04-06T12:00:00.000Z'
    } satisfies AppUserRecord);
    getSupabaseServiceRoleClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                external_customer_id: 'cust_opaque_001'
              },
              error: null
            })
          })
        })
      })
    });

    const result = await finalizeRealUserSession({
      authUserId: '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5',
      supabaseAccessToken: 'access-token-customer'
    });

    const authContext = resolveAuthContextFromSessionToken(result.appSessionToken);

    expect(result.redirectTo).toBe('/chat');
    expect(result.sessionSummary).toEqual({
      authenticated: true,
      role: 'customer',
      customerId: 'cust_opaque_001',
      agentLabel: null
    });
    expect(authContext).toMatchObject({
      isAuthenticated: true,
      role: 'customer',
      customerId: 'cust_opaque_001'
    });
  });

  it('finalizes an agent auth user into the shared app session model', async () => {
    loadAppUserByAuthUserIdMock.mockResolvedValue({
      authUserId: '22e2280c-9f01-49a2-ac50-33fb39937a16',
      role: 'agent',
      customerStorageId: null,
      agentLabel: 'Alex Chen',
      isActive: true,
      isDemo: false,
      createdAt: '2026-04-06T12:00:00.000Z',
      updatedAt: '2026-04-06T12:00:00.000Z'
    } satisfies AppUserRecord);

    const result = await finalizeRealUserSession({
      authUserId: '22e2280c-9f01-49a2-ac50-33fb39937a16',
      supabaseAccessToken: 'access-token-agent'
    });

    const authContext = resolveAuthContextFromSessionToken(result.appSessionToken);

    expect(result.redirectTo).toBe('/admin');
    expect(result.sessionSummary).toEqual({
      authenticated: true,
      role: 'agent',
      customerId: null,
      agentLabel: 'Alex Chen'
    });
    expect(authContext).toMatchObject({
      isAuthenticated: true,
      role: 'agent',
      agentName: 'Alex Chen'
    });
  });

  it('fails safely when the app_users mapping is missing', async () => {
    loadAppUserByAuthUserIdMock.mockResolvedValue(null);

    await expect(
      finalizeRealUserSession({
        authUserId: '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5',
        supabaseAccessToken: 'access-token'
      })
    ).rejects.toMatchObject({
      name: 'RealAuthError',
      code: 'real_auth_account_not_ready',
      status: 403
    } satisfies Partial<RealAuthError>);
  });

  it('fails safely when the app_users mapping is inactive', async () => {
    loadAppUserByAuthUserIdMock.mockResolvedValue({
      authUserId: '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5',
      role: 'customer',
      customerStorageId: 'cust-storage-1',
      agentLabel: null,
      isActive: false,
      isDemo: false,
      createdAt: '2026-04-06T12:00:00.000Z',
      updatedAt: '2026-04-06T12:00:00.000Z'
    } satisfies AppUserRecord);

    await expect(
      finalizeRealUserSession({
        authUserId: '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5',
        supabaseAccessToken: 'access-token'
      })
    ).rejects.toMatchObject({
      name: 'RealAuthError',
      code: 'real_auth_account_not_ready',
      status: 403
    } satisfies Partial<RealAuthError>);
  });

  it('returns a safe current-session summary without internal-only fields', () => {
    const anonymous: AuthContext = {
      isAuthenticated: false,
      role: 'anonymous',
      sessionId: null,
      userId: null,
      customerId: null,
      agentId: null,
      agentName: null
    };

    expect(toSafeAuthSessionSummary(anonymous)).toEqual({
      authenticated: false,
      role: 'anonymous',
      customerId: null,
      agentLabel: null
    });
  });
});
