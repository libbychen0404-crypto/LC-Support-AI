import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitStore } from '../lib/rateLimit';
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

function authenticatedCustomerAuth(): AuthContext {
  return {
    isAuthenticated: true,
    role: 'customer',
    sessionId: 'session-customer-1',
    userId: 'user-customer-1',
    customerId: 'demo-customer-001',
    agentId: null,
    agentName: null
  };
}

function makeAiReplyPayload() {
  return {
    actionType: 'case_update',
    customerName: 'Libby',
    customerId: 'demo-customer-001',
    issueType: 'Router Repair',
    stage: 'case_processing',
    status: 'Investigating',
    escalationState: 'Normal',
    handoffStatus: 'Not Requested',
    priority: 'Medium',
    assignedTo: null,
    assignedHumanAgent: null,
    etaOrExpectedUpdateTime: null,
    internalNote: '',
    resolutionNote: '',
    problemStatement: 'Router is offline',
    summary: 'Router repair case',
    nextAction: 'Continue investigation.',
    pendingFieldLabel: null,
    collectedFields: {},
    latestCustomerMessage: 'The router is still down.',
    recentMessages: []
  };
}

function makeAiCaseInsightsPayload() {
  return {
    customerName: 'Libby',
    customerId: 'demo-customer-001',
    issueType: 'Router Repair',
    stage: 'case_processing',
    status: 'Investigating',
    escalationState: 'Normal',
    handoffStatus: 'Not Requested',
    priority: 'Medium',
    assignedTo: null,
    assignedHumanAgent: null,
    etaOrExpectedUpdateTime: null,
    problemStatement: 'Router is offline',
    summary: 'Router repair case',
    nextAction: 'Continue investigation.',
    resolutionNote: '',
    internalNote: '',
    collectedFields: {},
    recentMessages: []
  };
}

describe('AI route security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveRequestAuthContextMock.mockReturnValue(anonymousAuth());
    resetRateLimitStore();
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

  it('allows an authenticated request through /api/ai-reply under the rate limit', async () => {
    resolveRequestAuthContextMock.mockReturnValue(authenticatedCustomerAuth());

    const { POST } = await import('../app/api/ai-reply/route');
    const response = await POST(
      new Request('http://localhost:3000/api/ai-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-real-ip': '198.51.100.20' },
        body: JSON.stringify(makeAiReplyPayload())
      })
    );

    expect(response.status).toBe(200);
  });

  it('returns 429 for /api/ai-reply after 10 requests from the same IP', async () => {
    resolveRequestAuthContextMock.mockReturnValue(authenticatedCustomerAuth());

    const { POST } = await import('../app/api/ai-reply/route');

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await POST(
        new Request('http://localhost:3000/api/ai-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-real-ip': '198.51.100.21' },
          body: JSON.stringify(makeAiReplyPayload())
        })
      );

      expect(response.status).toBe(200);
    }

    const blockedResponse = await POST(
      new Request('http://localhost:3000/api/ai-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-real-ip': '198.51.100.21' },
        body: JSON.stringify(makeAiReplyPayload())
      })
    );

    expect(blockedResponse.status).toBe(429);
    await expect(blockedResponse.json()).resolves.toMatchObject({
      error: 'Too many requests'
    });
  });

  it('returns 429 for /api/ai-case-insights after 5 requests from the same IP', async () => {
    resolveRequestAuthContextMock.mockReturnValue(authenticatedCustomerAuth());

    const { POST } = await import('../app/api/ai-case-insights/route');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await POST(
        new Request('http://localhost:3000/api/ai-case-insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.22, 10.0.0.1' },
          body: JSON.stringify(makeAiCaseInsightsPayload())
        })
      );

      expect(response.status).toBe(200);
    }

    const blockedResponse = await POST(
      new Request('http://localhost:3000/api/ai-case-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.22, 10.0.0.1' },
        body: JSON.stringify(makeAiCaseInsightsPayload())
      })
    );

    expect(blockedResponse.status).toBe(429);
    await expect(blockedResponse.json()).resolves.toMatchObject({
      error: 'Too many requests'
    });
  });

  it('tracks AI route limits separately by IP', async () => {
    resolveRequestAuthContextMock.mockReturnValue(authenticatedCustomerAuth());

    const { POST } = await import('../app/api/ai-reply/route');

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await POST(
        new Request('http://localhost:3000/api/ai-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-real-ip': '198.51.100.23' },
          body: JSON.stringify(makeAiReplyPayload())
        })
      );
    }

    const separateIpResponse = await POST(
      new Request('http://localhost:3000/api/ai-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-real-ip': '198.51.100.24' },
        body: JSON.stringify(makeAiReplyPayload())
      })
    );

    expect(separateIpResponse.status).toBe(200);
  });

  it('tracks rate limits separately by route key for the same IP', async () => {
    resolveRequestAuthContextMock.mockReturnValue(authenticatedCustomerAuth());

    const { POST: postReply } = await import('../app/api/ai-reply/route');
    const { POST: postInsights } = await import('../app/api/ai-case-insights/route');

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await postReply(
        new Request('http://localhost:3000/api/ai-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-real-ip': '198.51.100.25' },
          body: JSON.stringify(makeAiReplyPayload())
        })
      );
    }

    const separateRouteResponse = await postInsights(
      new Request('http://localhost:3000/api/ai-case-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-real-ip': '198.51.100.25' },
        body: JSON.stringify(makeAiCaseInsightsPayload())
      })
    );

    expect(separateRouteResponse.status).toBe(200);
  });
});
