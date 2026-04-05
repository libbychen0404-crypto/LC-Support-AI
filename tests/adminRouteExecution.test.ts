import { describe, expect, it, vi } from 'vitest';
import { AppIdentityError } from '../lib/appIdentity';
import { createAdminRouteExecutionResolver } from '../lib/adminRouteExecution';
import type { AgentAuthContext } from '../lib/types';

const AGENT_AUTH: AgentAuthContext = {
  isAuthenticated: true,
  role: 'agent',
  sessionId: 'session-agent-1',
  userId: '5ee8d032-ff8e-44c9-94ab-fbd69c1ef6b7',
  customerId: null,
  agentId: 'agent-1',
  agentName: 'Alex Chen'
};

describe('admin route execution resolver', () => {
  it('builds a user-scoped service execution context from a mapped agent identity', async () => {
    const fakeSupabase = { from: vi.fn() };
    const resolver = createAdminRouteExecutionResolver({
      resolveUserScopedContext: async () => ({
        privilege: 'user-scoped',
        authContext: AGENT_AUTH,
        appIdentity: {
          kind: 'agent',
          authContext: AGENT_AUTH,
          appUser: {
            authUserId: AGENT_AUTH.userId,
            role: 'agent',
            customerStorageId: null,
            agentLabel: 'Alex Chen',
            isActive: true,
            createdAt: '2026-04-04T10:00:00.000Z',
            updatedAt: '2026-04-04T10:00:00.000Z'
          }
        },
        accessToken: 'header.payload.signature',
        supabase: fakeSupabase as never
      })
    });

    const context = await resolver.resolveRequestAdminRouteExecutionContext(
      new Request('http://localhost'),
      AGENT_AUTH
    );

    expect(context.privilege).toBe('user-scoped');
    expect(context.authContext.agentId).toBe('agent-1');
    expect(context.appIdentity.appUser.agentLabel).toBe('Alex Chen');
    expect(typeof context.service.loadAdminDashboard).toBe('function');
  });

  it('fails clearly if the resolved database identity is not an agent mapping', async () => {
    const resolver = createAdminRouteExecutionResolver({
      resolveUserScopedContext: async () => ({
        privilege: 'user-scoped',
        authContext: AGENT_AUTH,
        appIdentity: {
          kind: 'customer',
          authContext: {
            ...AGENT_AUTH,
            role: 'customer',
            customerId: 'demo-customer-001',
            agentId: null,
            agentName: null
          },
          appUser: {
            authUserId: AGENT_AUTH.userId,
            role: 'customer',
            customerStorageId: '9a3cbc61-b2f9-4f5d-9f52-6da06bcf6f54',
            agentLabel: null,
            isActive: true,
            createdAt: '2026-04-04T10:00:00.000Z',
            updatedAt: '2026-04-04T10:00:00.000Z'
          },
          customerStorageId: '9a3cbc61-b2f9-4f5d-9f52-6da06bcf6f54'
        },
        accessToken: 'header.payload.signature',
        supabase: { from: vi.fn() } as never
      })
    });

    await expect(
      resolver.resolveRequestAdminRouteExecutionContext(new Request('http://localhost'), AGENT_AUTH)
    ).rejects.toMatchObject({
      name: 'AppIdentityError',
      code: 'identity_mapping_invalid'
    } satisfies Partial<AppIdentityError>);
  });
});
