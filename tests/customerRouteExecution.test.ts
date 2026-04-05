import { describe, expect, it, vi } from 'vitest';
import { AppIdentityError } from '../lib/appIdentity';
import { createCustomerRouteExecutionResolver } from '../lib/customerRouteExecution';
import type { CustomerAuthContext } from '../lib/types';

const CUSTOMER_AUTH: CustomerAuthContext = {
  isAuthenticated: true,
  role: 'customer',
  sessionId: 'session-customer-1',
  userId: '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5',
  customerId: 'demo-customer-001',
  agentId: null,
  agentName: null
};

describe('customer route execution resolver', () => {
  it('builds a user-scoped service execution context from a mapped customer identity', async () => {
    const fakeSupabase = { from: vi.fn() };
    const resolver = createCustomerRouteExecutionResolver({
      resolveUserScopedContext: async () => ({
        privilege: 'user-scoped',
        authContext: CUSTOMER_AUTH,
        appIdentity: {
          kind: 'customer',
          authContext: CUSTOMER_AUTH,
          appUser: {
            authUserId: CUSTOMER_AUTH.userId,
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
        supabase: fakeSupabase as never
      })
    });

    const context = await resolver.resolveRequestCustomerRouteExecutionContext(
      new Request('http://localhost'),
      CUSTOMER_AUTH
    );

    expect(context.privilege).toBe('user-scoped');
    expect(context.authContext.customerId).toBe('demo-customer-001');
    expect(context.appIdentity.customerStorageId).toBe('9a3cbc61-b2f9-4f5d-9f52-6da06bcf6f54');
    expect(typeof context.service.loadCustomerWorkspace).toBe('function');
  });

  it('fails clearly if the resolved database identity is not a customer mapping', async () => {
    const resolver = createCustomerRouteExecutionResolver({
      resolveUserScopedContext: async () => ({
        privilege: 'user-scoped',
        authContext: CUSTOMER_AUTH,
        appIdentity: {
          kind: 'agent',
          authContext: {
            ...CUSTOMER_AUTH,
            role: 'agent',
            customerId: null,
            agentId: 'agent-1',
            agentName: 'Alex Chen'
          },
          appUser: {
            authUserId: CUSTOMER_AUTH.userId,
            role: 'agent',
            customerStorageId: null,
            agentLabel: 'Alex Chen',
            isActive: true,
            createdAt: '2026-04-04T10:00:00.000Z',
            updatedAt: '2026-04-04T10:00:00.000Z'
          }
        },
        accessToken: 'header.payload.signature',
        supabase: { from: vi.fn() } as never
      })
    });

    await expect(
      resolver.resolveRequestCustomerRouteExecutionContext(new Request('http://localhost'), CUSTOMER_AUTH)
    ).rejects.toMatchObject({
      name: 'AppIdentityError',
      code: 'identity_mapping_invalid'
    });
  });
});
