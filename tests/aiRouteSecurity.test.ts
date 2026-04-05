import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../lib/types';

const resolveRequestAuthContextMock = vi.hoisted(() => vi.fn<(request: Request) => AuthContext>());

vi.mock('../lib/auth', async () => {
  const actual = await vi.importActual<typeof import('../lib/auth')>('../lib/auth');
  return {
    ...actual,
    resolveRequestAuthContext: resolveRequestAuthContextMock
  };
});

function anonymousAuth(): AuthContext {
  return {
    isAuthenticated: false,
    role: 'anonymous',
    sessionId: null,
    userId: null,
    customerId: null,
    agentId: null,
    agentName: null
  };
}

describe('AI route security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveRequestAuthContextMock.mockReturnValue(anonymousAuth());
  });

  it('rejects unauthenticated requests to /api/ai-reply', async () => {
    const { POST } = await import('../app/api/ai-reply/route');
    const response = await POST(
      new Request('http://localhost:3000/api/ai-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'unauthorized'
    });
  });

  it('rejects unauthenticated requests to /api/ai-case-insights', async () => {
    const { POST } = await import('../app/api/ai-case-insights/route');
    const response = await POST(
      new Request('http://localhost:3000/api/ai-case-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'unauthorized'
    });
  });
});
