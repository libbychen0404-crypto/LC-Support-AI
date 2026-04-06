import { beforeEach, describe, expect, it, vi } from 'vitest';

const createDemoSessionMock = vi.hoisted(() => vi.fn());
const getDemoSignInCookieEntriesMock = vi.hoisted(() => vi.fn());
const getDemoSignOutCookieEntriesMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/demoAuth', () => ({
  isDemoEntryRole: (value: string) => value === 'customer' || value === 'agent',
  isPublicDemoRoleEnabled: (role: string) => role !== 'agent' || process.env.PUBLIC_AGENT_DEMO_ENTRY_ENABLED === 'true',
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
    vi.stubEnv('PUBLIC_AGENT_DEMO_ENTRY_ENABLED', 'true');
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
        body: JSON.stringify({ role: 'agent' })
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

  it('returns the same safe 403 JSON if the agent path somehow fails after the disabled check', async () => {
    vi.stubEnv('PUBLIC_AGENT_DEMO_ENTRY_ENABLED', 'true');
    createDemoSessionMock.mockRejectedValue(new Error('disabled'));

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
      error: 'Agent demo disabled'
    });
  });

  it('blocks the public agent demo entry when the production override is not enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PUBLIC_AGENT_DEMO_ENTRY_ENABLED', '');

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
      error: 'Agent demo disabled'
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
});
