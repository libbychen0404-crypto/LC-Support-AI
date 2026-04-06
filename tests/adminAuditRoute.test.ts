import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthSessionToken } from '../lib/auth';

const routeExecutionMocks = vi.hoisted(() => ({
  resolveRequestAdminRouteExecutionContext: vi.fn()
}));

const listAuditLogsForCase = vi.hoisted(() => vi.fn());

vi.mock('@/lib/adminRouteExecution', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/adminRouteExecution')>();

  return {
    ...actual,
    createAdminRouteExecutionResolver: vi.fn(() => routeExecutionMocks)
  };
});

vi.mock('@/lib/auditStorageSupabase', () => ({
  listAuditLogsForCase
}));

const { GET } = await import('../app/api/admin-support/audit/route');

function makeAgentCookie() {
  process.env.AUTH_SESSION_SECRET = 'test-auth-secret';
  const token = createAuthSessionToken({
    role: 'agent',
    userId: 'agent-auth-user-1',
    agentId: 'agent-1',
    agentName: 'Alex Chen'
  });

  return `lc_support_session=${token}`;
}

function makeExecutionContext() {
  return {
    privilege: 'user-scoped' as const,
    authContext: {
      isAuthenticated: true,
      role: 'agent' as const,
      sessionId: 'session-agent-1',
      userId: 'agent-auth-user-1',
      customerId: null,
      agentId: 'agent-1',
      agentName: 'Alex Chen'
    },
    appIdentity: {
      kind: 'agent' as const,
      authContext: {
        isAuthenticated: true,
        role: 'agent' as const,
        sessionId: 'session-agent-1',
        userId: 'agent-auth-user-1',
        customerId: null,
        agentId: 'agent-1',
        agentName: 'Alex Chen'
      },
      appUser: {
        authUserId: 'agent-auth-user-1',
        role: 'agent' as const,
        customerStorageId: null,
        agentLabel: 'Alex Chen',
        isActive: true,
        isDemo: false,
        createdAt: '2026-04-05T10:00:00.000Z',
        updatedAt: '2026-04-05T10:00:00.000Z'
      }
    },
    userScopedContext: {
      privilege: 'user-scoped' as const,
      authContext: {
        isAuthenticated: true,
        role: 'agent' as const,
        sessionId: 'session-agent-1',
        userId: 'agent-auth-user-1',
        customerId: null,
        agentId: 'agent-1',
        agentName: 'Alex Chen'
      },
      appIdentity: {
        kind: 'agent' as const,
        authContext: {
          isAuthenticated: true,
          role: 'agent' as const,
          sessionId: 'session-agent-1',
          userId: 'agent-auth-user-1',
          customerId: null,
          agentId: 'agent-1',
          agentName: 'Alex Chen'
        },
        appUser: {
          authUserId: 'agent-auth-user-1',
          role: 'agent' as const,
          customerStorageId: null,
          agentLabel: 'Alex Chen',
          isActive: true,
          isDemo: false,
          createdAt: '2026-04-05T10:00:00.000Z',
          updatedAt: '2026-04-05T10:00:00.000Z'
        }
      },
      accessToken: 'header.payload.signature',
      supabase: { from: vi.fn() }
    },
    storage: {},
    service: {}
  };
}

describe('admin audit route', () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = 'test-auth-secret';
    routeExecutionMocks.resolveRequestAdminRouteExecutionContext.mockReset();
    listAuditLogsForCase.mockReset();
    routeExecutionMocks.resolveRequestAdminRouteExecutionContext.mockResolvedValue(makeExecutionContext());
  });

  it('queries audit logs by case id and returns them in ascending timeline order', async () => {
    listAuditLogsForCase.mockResolvedValue([
      {
        id: 'audit-1',
        caseId: 'case-1',
        customerId: 'cust-1',
        actorType: 'system',
        actorId: null,
        actionType: 'system_case_classified',
        actionSubtype: 'classification',
        previousValue: { issueType: null },
        newValue: { issueType: 'Router Repair' },
        metadata: {},
        source: 'system',
        messageId: null,
        timelineItemId: null,
        requestId: null,
        createdAt: '2026-04-05T10:32:00.000Z'
      },
      {
        id: 'audit-2',
        caseId: 'case-1',
        customerId: 'cust-1',
        actorType: 'agent',
        actorId: 'agent-auth-user-1',
        actionType: 'agent_status_changed',
        actionSubtype: 'status',
        previousValue: { status: 'New' },
        newValue: { status: 'Investigating' },
        metadata: { agentName: 'Alex Chen' },
        source: 'admin_panel',
        messageId: null,
        timelineItemId: null,
        requestId: null,
        createdAt: '2026-04-05T10:34:00.000Z'
      }
    ]);

    const response = await GET(
      new Request('http://localhost/api/admin-support/audit?caseId=case-1', {
        headers: { cookie: makeAgentCookie() }
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { caseId: string; events: Array<{ actionType: string; actorLabel: string }> };
    expect(payload.caseId).toBe('case-1');
    expect(payload.events).toHaveLength(2);
    expect(payload.events[0]).toMatchObject({
      actionType: 'system_case_classified',
      actorLabel: 'System'
    });
    expect(payload.events[1]).toMatchObject({
      actionType: 'agent_status_changed',
      actorLabel: 'Support Agent'
    });
    expect(listAuditLogsForCase).toHaveBeenCalledWith('case-1', expect.anything());
  });

  it('returns an empty list when a case has no audit rows yet', async () => {
    listAuditLogsForCase.mockResolvedValue([]);

    const response = await GET(
      new Request('http://localhost/api/admin-support/audit?caseId=case-empty', {
        headers: { cookie: makeAgentCookie() }
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { events: unknown[] };
    expect(payload.events).toEqual([]);
  });
});
