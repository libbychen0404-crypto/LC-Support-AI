import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthSessionToken } from '../lib/auth';
import { resetRateLimitStore } from '../lib/rateLimit';

const signInWithPasswordMock = vi.hoisted(() => vi.fn());
const createUserMock = vi.hoisted(() => vi.fn());
const deleteUserMock = vi.hoisted(() => vi.fn());
const serviceRoleFromMock = vi.hoisted(() => vi.fn());
const finalizeRealUserSessionMock = vi.hoisted(() => vi.fn());
const getRealAuthSignInCookieEntriesMock = vi.hoisted(() => vi.fn());
const getRealAuthSignOutCookieEntriesMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  createSupabaseAnonClient: () => ({
    auth: {
      signInWithPassword: signInWithPasswordMock
    }
  }),
  getSupabaseServiceRoleClient: () => ({
    auth: {
      admin: {
        createUser: createUserMock,
        deleteUser: deleteUserMock
      }
    },
    from: serviceRoleFromMock
  }),
  SUPABASE_USER_ACCESS_TOKEN_COOKIE_NAME: 'lc_support_supabase_access_token'
}));

vi.mock('@/lib/realAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/realAuth')>();

  return {
    ...actual,
    finalizeRealUserSession: finalizeRealUserSessionMock,
    generateOpaqueCustomerId: () => 'cust_opaque_001',
    getRealAuthSignInCookieEntries: getRealAuthSignInCookieEntriesMock,
    getRealAuthSignOutCookieEntries: getRealAuthSignOutCookieEntriesMock
  };
});

function createCustomersTableMock(result: { data: { id: string } | null; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const eq = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockReturnValue({ eq });

  return {
    insert,
    delete: remove,
    single,
    select,
    eq
  };
}

describe('real auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    process.env.AUTH_SESSION_SECRET = 'test-auth-secret';

    getRealAuthSignInCookieEntriesMock.mockReturnValue([
      {
        name: 'lc_support_session',
        value: 'real-app-session-token',
        options: { path: '/', httpOnly: true }
      },
      {
        name: 'lc_support_supabase_access_token',
        value: 'real-supabase-access-token',
        options: { path: '/', httpOnly: true }
      }
    ]);
    getRealAuthSignOutCookieEntriesMock.mockReturnValue([
      {
        name: 'lc_support_session',
        value: '',
        options: { path: '/', maxAge: 0 }
      },
      {
        name: 'lc_support_supabase_access_token',
        value: '',
        options: { path: '/', maxAge: 0 }
      },
      {
        name: 'lc_support_auth_mode',
        value: '',
        options: { path: '/', maxAge: 0 }
      }
    ]);
  });

  it('sign-up creates a real customer mapping and starts a shared app session', async () => {
    const customersTable = createCustomersTableMock({
      data: { id: 'customer-storage-1' },
      error: null
    });
    const appUsersInsert = vi.fn().mockResolvedValue({ error: null });

    serviceRoleFromMock.mockImplementation((table: string) => {
      if (table === 'customers') {
        return customersTable;
      }

      if (table === 'app_users') {
        return {
          insert: appUsersInsert
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    createUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'auth-user-1'
        }
      },
      error: null
    });
    signInWithPasswordMock.mockResolvedValue({
      data: {
        user: { id: 'auth-user-1' },
        session: { access_token: 'real-supabase-access-token' }
      },
      error: null
    });
    finalizeRealUserSessionMock.mockResolvedValue({
      role: 'customer',
      redirectTo: '/chat',
      appSessionToken: 'real-app-session-token',
      supabaseAccessToken: 'real-supabase-access-token',
      sessionSummary: {
        authenticated: true,
        role: 'customer',
        customerId: 'cust_opaque_001',
        agentLabel: null
      }
    });

    const { POST } = await import('../app/api/auth/sign-up/route');
    const response = await POST(
      new Request('http://localhost:3000/api/auth/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'new.customer@example.com',
          password: 'RealUserPass1',
          name: 'New Customer',
          phone: '+61 400 000 000'
        })
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      role: 'customer',
      destination: '/chat'
    });
    expect(createUserMock).toHaveBeenCalledWith({
      email: 'new.customer@example.com',
      password: 'RealUserPass1',
      email_confirm: true,
      user_metadata: {
        name: 'New Customer'
      }
    });
    expect(customersTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        external_customer_id: 'cust_opaque_001',
        name: 'New Customer',
        email: 'new.customer@example.com',
        phone: '+61 400 000 000'
      })
    );
    expect(appUsersInsert).toHaveBeenCalledWith({
      auth_user_id: 'auth-user-1',
      role: 'customer',
      customer_id: 'customer-storage-1',
      is_demo: false,
      is_active: true
    });
    expect(response.headers.get('set-cookie')).toContain('lc_support_session=real-app-session-token');
  });

  it('rate limits sign-up after 3 requests from the same IP', async () => {
    const customersTable = createCustomersTableMock({
      data: { id: 'customer-storage-1' },
      error: null
    });
    const appUsersInsert = vi.fn().mockResolvedValue({ error: null });

    serviceRoleFromMock.mockImplementation((table: string) => {
      if (table === 'customers') {
        return customersTable;
      }

      if (table === 'app_users') {
        return {
          insert: appUsersInsert
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    createUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'auth-user-1'
        }
      },
      error: null
    });
    signInWithPasswordMock.mockResolvedValue({
      data: {
        user: { id: 'auth-user-1' },
        session: { access_token: 'real-supabase-access-token' }
      },
      error: null
    });
    finalizeRealUserSessionMock.mockResolvedValue({
      role: 'customer',
      redirectTo: '/chat',
      appSessionToken: 'real-app-session-token',
      supabaseAccessToken: 'real-supabase-access-token',
      sessionSummary: {
        authenticated: true,
        role: 'customer',
        customerId: 'cust_opaque_001',
        agentLabel: null
      }
    });

    const { POST } = await import('../app/api/auth/sign-up/route');
    const makeRequest = () =>
      POST(
        new Request('http://localhost:3000/api/auth/sign-up', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': '198.51.100.10'
          },
          body: JSON.stringify({
            email: 'rate-limit@example.com',
            password: 'RealUserPass1',
            name: 'Rate Limited Customer'
          })
        })
      );

    expect((await makeRequest()).status).toBe(201);
    expect((await makeRequest()).status).toBe(201);
    expect((await makeRequest()).status).toBe(201);

    const limitedResponse = await makeRequest();

    expect(limitedResponse.status).toBe(429);
    await expect(limitedResponse.json()).resolves.toEqual({
      error: 'Too many requests'
    });
    expect(limitedResponse.headers.get('X-RateLimit-Limit')).toBe('3');
    expect(limitedResponse.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(limitedResponse.headers.get('Retry-After')).toBeTruthy();
  });

  it('sign-in returns the customer destination when the mapped role is customer', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: {
        user: { id: 'auth-user-1' },
        session: { access_token: 'access-token-customer' }
      },
      error: null
    });
    finalizeRealUserSessionMock.mockResolvedValue({
      role: 'customer',
      redirectTo: '/chat',
      appSessionToken: 'customer-app-session',
      supabaseAccessToken: 'access-token-customer',
      sessionSummary: {
        authenticated: true,
        role: 'customer',
        customerId: 'cust_opaque_001',
        agentLabel: null
      }
    });

    const { POST } = await import('../app/api/auth/sign-in/route');
    const response = await POST(
      new Request('http://localhost:3000/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'customer@example.com',
          password: 'RealUserPass1'
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      role: 'customer',
      destination: '/chat'
    });
  });

  it('rate limits sign-in after 8 requests from the same IP', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: {
        user: { id: 'auth-user-1' },
        session: { access_token: 'access-token-customer' }
      },
      error: null
    });
    finalizeRealUserSessionMock.mockResolvedValue({
      role: 'customer',
      redirectTo: '/chat',
      appSessionToken: 'customer-app-session',
      supabaseAccessToken: 'access-token-customer',
      sessionSummary: {
        authenticated: true,
        role: 'customer',
        customerId: 'cust_opaque_001',
        agentLabel: null
      }
    });

    const { POST } = await import('../app/api/auth/sign-in/route');
    const makeRequest = (ip = '198.51.100.20') =>
      POST(
        new Request('http://localhost:3000/api/auth/sign-in', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': ip
          },
          body: JSON.stringify({
            email: 'customer@example.com',
            password: 'RealUserPass1'
          })
        })
      );

    for (let index = 0; index < 8; index += 1) {
      expect((await makeRequest()).status).toBe(200);
    }

    const limitedResponse = await makeRequest();

    expect(limitedResponse.status).toBe(429);
    await expect(limitedResponse.json()).resolves.toEqual({
      error: 'Too many requests'
    });
    expect(limitedResponse.headers.get('X-RateLimit-Limit')).toBe('8');
    expect(limitedResponse.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('tracks sign-in rate limits independently by client IP', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: {
        user: { id: 'auth-user-1' },
        session: { access_token: 'access-token-customer' }
      },
      error: null
    });
    finalizeRealUserSessionMock.mockResolvedValue({
      role: 'customer',
      redirectTo: '/chat',
      appSessionToken: 'customer-app-session',
      supabaseAccessToken: 'access-token-customer',
      sessionSummary: {
        authenticated: true,
        role: 'customer',
        customerId: 'cust_opaque_001',
        agentLabel: null
      }
    });

    const { POST } = await import('../app/api/auth/sign-in/route');
    const makeRequest = (ip: string) =>
      POST(
        new Request('http://localhost:3000/api/auth/sign-in', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': ip
          },
          body: JSON.stringify({
            email: 'customer@example.com',
            password: 'RealUserPass1'
          })
        })
      );

    for (let index = 0; index < 8; index += 1) {
      expect((await makeRequest('203.0.113.1')).status).toBe(200);
    }

    expect((await makeRequest('203.0.113.1')).status).toBe(429);
    expect((await makeRequest('203.0.113.2')).status).toBe(200);
  });

  it('keeps sign-up and sign-in counters separate for the same IP', async () => {
    const customersTable = createCustomersTableMock({
      data: { id: 'customer-storage-1' },
      error: null
    });
    const appUsersInsert = vi.fn().mockResolvedValue({ error: null });

    serviceRoleFromMock.mockImplementation((table: string) => {
      if (table === 'customers') {
        return customersTable;
      }

      if (table === 'app_users') {
        return {
          insert: appUsersInsert
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    createUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'auth-user-1'
        }
      },
      error: null
    });
    signInWithPasswordMock.mockResolvedValue({
      data: {
        user: { id: 'auth-user-1' },
        session: { access_token: 'access-token-customer' }
      },
      error: null
    });
    finalizeRealUserSessionMock.mockResolvedValue({
      role: 'customer',
      redirectTo: '/chat',
      appSessionToken: 'customer-app-session',
      supabaseAccessToken: 'access-token-customer',
      sessionSummary: {
        authenticated: true,
        role: 'customer',
        customerId: 'cust_opaque_001',
        agentLabel: null
      }
    });

    const { POST: signUpPost } = await import('../app/api/auth/sign-up/route');
    const { POST: signInPost } = await import('../app/api/auth/sign-in/route');
    const ip = '192.0.2.25';

    for (let index = 0; index < 3; index += 1) {
      expect(
        (
          await signUpPost(
            new Request('http://localhost:3000/api/auth/sign-up', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-forwarded-for': ip
              },
              body: JSON.stringify({
                email: `signup${index}@example.com`,
                password: 'RealUserPass1',
                name: `Signup ${index}`
              })
            })
          )
        ).status
      ).toBe(201);
    }

    expect(
      (
        await signUpPost(
          new Request('http://localhost:3000/api/auth/sign-up', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-forwarded-for': ip
            },
            body: JSON.stringify({
              email: 'signup-over-limit@example.com',
              password: 'RealUserPass1',
              name: 'Signup Over Limit'
            })
          })
        )
      ).status
    ).toBe(429);

    const signInResponse = await signInPost(
      new Request('http://localhost:3000/api/auth/sign-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': ip
        },
        body: JSON.stringify({
          email: 'customer@example.com',
          password: 'RealUserPass1'
        })
      })
    );

    expect(signInResponse.status).toBe(200);
  });

  it('sign-in returns the agent destination when the mapped role is agent', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: {
        user: { id: 'auth-user-agent-1' },
        session: { access_token: 'access-token-agent' }
      },
      error: null
    });
    finalizeRealUserSessionMock.mockResolvedValue({
      role: 'agent',
      redirectTo: '/admin',
      appSessionToken: 'agent-app-session',
      supabaseAccessToken: 'access-token-agent',
      sessionSummary: {
        authenticated: true,
        role: 'agent',
        customerId: null,
        agentLabel: 'Alex Chen'
      }
    });

    const { POST } = await import('../app/api/auth/sign-in/route');
    const response = await POST(
      new Request('http://localhost:3000/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'agent@example.com',
          password: 'RealUserPass1'
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      role: 'agent',
      destination: '/admin'
    });
  });

  it('fails safely when the credentials are invalid', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: {
        user: null,
        session: null
      },
      error: new Error('invalid login')
    });

    const { POST } = await import('../app/api/auth/sign-in/route');
    const response = await POST(
      new Request('http://localhost:3000/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'customer@example.com',
          password: 'wrong-password'
        })
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid email or password.'
    });
  });

  it('fails safely when the signed-in auth user is not mapped for app access', async () => {
    const { RealAuthError } = await import('../lib/realAuth');

    signInWithPasswordMock.mockResolvedValue({
      data: {
        user: { id: 'auth-user-1' },
        session: { access_token: 'access-token-customer' }
      },
      error: null
    });
    finalizeRealUserSessionMock.mockRejectedValue(
      new RealAuthError('This account is not authorized to use LC AI Support yet.', 'real_auth_account_not_ready', 403)
    );

    const { POST } = await import('../app/api/auth/sign-in/route');
    const response = await POST(
      new Request('http://localhost:3000/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'customer@example.com',
          password: 'RealUserPass1'
        })
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'This account is not authorized to use LC AI Support yet.'
    });
  });

  it('sign-out returns the real landing page for real-user sessions and clears cookies', async () => {
    const { POST } = await import('../app/api/auth/sign-out/route');
    const response = await POST(
      new Request('http://localhost:3000/api/auth/sign-out', {
        method: 'POST',
        headers: {
          cookie: 'lc_support_auth_mode=real'
        }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      redirectTo: '/real'
    });
    expect(response.headers.get('set-cookie')).toContain('lc_support_session=');
  });

  it('sign-out keeps demo visitors on the demo homepage by default', async () => {
    const { POST } = await import('../app/api/auth/sign-out/route');
    const response = await POST(
      new Request('http://localhost:3000/api/auth/sign-out', {
        method: 'POST',
        headers: {
          cookie: 'lc_support_auth_mode=demo'
        }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      redirectTo: '/'
    });
  });
});

describe('/api/auth/me', () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = 'test-auth-secret';
  });

  it('returns the current safe session summary for authenticated users', async () => {
    const token = createAuthSessionToken({
      role: 'customer',
      userId: 'auth-user-1',
      customerId: 'cust_opaque_001'
    });

    const { GET } = await import('../app/api/auth/me/route');
    const response = await GET(
      new Request('http://localhost:3000/api/auth/me', {
        headers: {
          cookie: `lc_support_session=${token}`
        }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      role: 'customer',
      customerId: 'cust_opaque_001',
      agentLabel: null
    });
  });

  it('returns an anonymous summary without sensitive fields when no session exists', async () => {
    const { GET } = await import('../app/api/auth/me/route');
    const response = await GET(new Request('http://localhost:3000/api/auth/me'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      role: 'anonymous',
      customerId: null,
      agentLabel: null
    });
  });
});
