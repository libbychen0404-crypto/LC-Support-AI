import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitStore } from '../lib/rateLimit';

const createDemoSessionMock = vi.hoisted(() => vi.fn());
const getDemoSignInCookieEntriesMock = vi.hoisted(() => vi.fn());
const getDemoSignOutCookieEntriesMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/demoAuth', () => ({
  isDemoEntryRole: (value: string) => value === 'customer' || value === 'agent',
  createDemoSession: createDemoSessionMock,
  getDemoSignInCookieEntries: getDemoSignInCookieEntriesMock,
  getDemoSignInErrorCode: (error: unknown) =>
    error instanceof Error && error.message === 'disabled' ? 'demo_role_disabled' : error instanceof Error ? 'demo_sign_in_failed' : 'demo_unknown_error',
  getDemoSignOutCookieEntries: getDemoSignOutCookieEntriesMock
}));

describe('demo auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'test');
    resetRateLimitStore();
  });

  it('customer demo entry creates cookies and redirects to /chat', async () => {
    createDemoSessionMock.mockResolvedValue({
      role: 'customer',
      redirectTo: '/chat',
      appSessionToken: 'customer-token',
      supabaseAccessToken: 'customer-access-token'
    });
    getDemoSignInCookieEntriesMock.mockReturnValue([
      {
        name: 'lc_support_session',
        value: 'customer-token',
        options: { path: '/', httpOnly: true }
      }
    ]);

    const { POST } = await import('../app/api/demo-sign-in/route');
    const response = await POST(
      new Request('http://localhost:3000/api/demo-sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'customer' })
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/chat');
    expect(response.headers.get('set-cookie')).toContain('lc_support_session=customer-token');
  });

  it('agent demo entry creates cookies and redirects to /admin', async () => {
    vi.stubEnv('AGENT_DEMO_ACCESS_CODE', 'secret-code');
    createDemoSessionMock.mockResolvedValue({
      role: 'agent',
      redirectTo: '/admin',
      appSessionToken: 'agent-token',
      supabaseAccessToken: 'agent-access-token'
    });
    getDemoSignInCookieEntriesMock.mockReturnValue([
      {
        name: 'lc_support_session',
        value: 'agent-token',
        options: { path: '/', httpOnly: true }
      }
    ]);

    const { POST } = await import('../app/api/demo-sign-in/route');
    const response = await POST(
      new Request('http://localhost:3000/api/demo-sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'agent', accessCode: 'secret-code' })
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/admin');
  });

  it('returns a safe 500 JSON payload when customer sign-in fails', async () => {
    createDemoSessionMock.mockRejectedValue(new Error('failed'));

    const { POST } = await import('../app/api/demo-sign-in/route');
    const response = await POST(
      new Request('http://localhost:3000/api/demo-sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'customer' })
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unable to start demo session'
    });
  });

  it('blocks agent demo sign-in when the access code is missing', async () => {
    vi.stubEnv('AGENT_DEMO_ACCESS_CODE', 'secret-code');

    const { POST } = await import('../app/api/demo-sign-in/route');
    const response = await POST(
      new Request('http://localhost:3000/api/demo-sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'agent' })
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid access code'
    });
    expect(createDemoSessionMock).not.toHaveBeenCalled();
  });

  it('blocks agent demo sign-in when the access code is wrong', async () => {
    vi.stubEnv('AGENT_DEMO_ACCESS_CODE', 'secret-code');

    const { POST } = await import('../app/api/demo-sign-in/route');
    const response = await POST(
      new Request('http://localhost:3000/api/demo-sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'agent', accessCode: 'wrong-code' })
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid access code'
    });
    expect(createDemoSessionMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid roles', async () => {
    const { POST } = await import('../app/api/demo-sign-in/route');
    const response = await POST(
      new Request('http://localhost:3000/api/demo-sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid role'
    });
  });

  it('rejects non-JSON sign-in requests with a safe error', async () => {
    const { POST } = await import('../app/api/demo-sign-in/route');
    const response = await POST(
      new Request('http://localhost:3000/api/demo-sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'role=customer'
      })
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      error: 'JSON body required'
    });
  });

  it('sign-out clears cookies and redirects home', async () => {
    getDemoSignOutCookieEntriesMock.mockReturnValue([
      {
        name: 'lc_support_session',
        value: '',
        options: { path: '/', maxAge: 0 }
      }
    ]);

    const { POST } = await import('../app/api/demo-sign-out/route');
    const response = await POST(new Request('http://localhost:3000/api/demo-sign-out', { method: 'POST' }));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/');
    expect(response.headers.get('set-cookie')).toContain('lc_support_session=');
  });

  it('returns 429 after 5 demo sign-in attempts from the same IP within the window', async () => {
    createDemoSessionMock.mockResolvedValue({
      role: 'customer',
      redirectTo: '/chat',
      appSessionToken: 'customer-token',
      supabaseAccessToken: 'customer-access-token'
    });
    getDemoSignInCookieEntriesMock.mockReturnValue([
      {
        name: 'lc_support_session',
        value: 'customer-token',
        options: { path: '/', httpOnly: true }
      }
    ]);

    const { POST } = await import('../app/api/demo-sign-in/route');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await POST(
        new Request('http://localhost:3000/api/demo-sign-in', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': '203.0.113.10'
          },
          body: JSON.stringify({ role: 'customer' })
        })
      );

      expect(response.status).toBe(307);
    }

    const blockedResponse = await POST(
      new Request('http://localhost:3000/api/demo-sign-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.10'
        },
        body: JSON.stringify({ role: 'customer' })
      })
    );

    expect(blockedResponse.status).toBe(429);
    await expect(blockedResponse.json()).resolves.toMatchObject({
      error: 'Too many requests'
    });
  });

  it('tracks demo sign-in attempts separately for different IPs', async () => {
    createDemoSessionMock.mockResolvedValue({
      role: 'customer',
      redirectTo: '/chat',
      appSessionToken: 'customer-token',
      supabaseAccessToken: 'customer-access-token'
    });
    getDemoSignInCookieEntriesMock.mockReturnValue([
      {
        name: 'lc_support_session',
        value: 'customer-token',
        options: { path: '/', httpOnly: true }
      }
    ]);

    const { POST } = await import('../app/api/demo-sign-in/route');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await POST(
        new Request('http://localhost:3000/api/demo-sign-in', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': '203.0.113.11'
          },
          body: JSON.stringify({ role: 'customer' })
        })
      );
    }

    const separateIpResponse = await POST(
      new Request('http://localhost:3000/api/demo-sign-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.12'
        },
        body: JSON.stringify({ role: 'customer' })
      })
    );

    expect(separateIpResponse.status).toBe(307);
  });
});
