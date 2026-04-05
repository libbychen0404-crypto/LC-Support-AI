import { describe, expect, it } from 'vitest';
import { AppIdentityError, createAppIdentityResolver, mapAppUserRow } from '../lib/appIdentity';
import type { AuthContext, AppUserRecord } from '../lib/types';

function customerAuth(userId = '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5'): AuthContext {
  return {
    isAuthenticated: true,
    role: 'customer',
    sessionId: 'session-customer',
    userId,
    customerId: 'demo-customer-001',
    agentId: null,
    agentName: null
  };
}

function agentAuth(userId = '22e2280c-9f01-49a2-ac50-33fb39937a16'): AuthContext {
  return {
    isAuthenticated: true,
    role: 'agent',
    sessionId: 'session-agent',
    userId,
    customerId: null,
    agentId: 'agent-1',
    agentName: 'Alex Chen'
  };
}

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

describe('app identity mapping helpers', () => {
  it('maps app_users rows into the shared app-user record shape', () => {
    const record = mapAppUserRow({
      auth_user_id: '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5',
      role: 'customer',
      customer_id: '9a3cbc61-b2f9-4f5d-9f52-6da06bcf6f54',
      agent_label: null,
      is_active: true,
      created_at: '2026-04-04T10:00:00.000Z',
      updated_at: '2026-04-04T10:00:00.000Z'
    });

    expect(record.authUserId).toBe('77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5');
    expect(record.customerStorageId).toBe('9a3cbc61-b2f9-4f5d-9f52-6da06bcf6f54');
  });

  it('resolves the correct internal customer owner for a mapped customer auth user', async () => {
    const resolver = createAppIdentityResolver(async () => ({
      authUserId: '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5',
      role: 'customer',
      customerStorageId: '9a3cbc61-b2f9-4f5d-9f52-6da06bcf6f54',
      agentLabel: null,
      isActive: true,
      createdAt: '2026-04-04T10:00:00.000Z',
      updatedAt: '2026-04-04T10:00:00.000Z'
    } satisfies AppUserRecord));

    const identity = await resolver.requireCustomerAppIdentity(customerAuth());

    expect(identity.kind).toBe('customer');
    expect(identity.customerStorageId).toBe('9a3cbc61-b2f9-4f5d-9f52-6da06bcf6f54');
  });

  it('resolves agent mappings correctly', async () => {
    const resolver = createAppIdentityResolver(async () => ({
      authUserId: '22e2280c-9f01-49a2-ac50-33fb39937a16',
      role: 'agent',
      customerStorageId: null,
      agentLabel: 'Alex Chen',
      isActive: true,
      createdAt: '2026-04-04T10:00:00.000Z',
      updatedAt: '2026-04-04T10:00:00.000Z'
    } satisfies AppUserRecord));

    const identity = await resolver.requireAgentAppIdentity(agentAuth());

    expect(identity.kind).toBe('agent');
    expect(identity.appUser.agentLabel).toBe('Alex Chen');
  });

  it('returns a clear error when the mapping is missing', async () => {
    const resolver = createAppIdentityResolver(async () => null);

    await expect(resolver.resolveAppIdentity(customerAuth())).rejects.toMatchObject({
      name: 'AppIdentityError',
      code: 'identity_mapping_missing'
    } satisfies Partial<AppIdentityError>);
  });

  it('returns a clear error when the mapping is inactive', async () => {
    const resolver = createAppIdentityResolver(async () => ({
      authUserId: '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5',
      role: 'customer',
      customerStorageId: '9a3cbc61-b2f9-4f5d-9f52-6da06bcf6f54',
      agentLabel: null,
      isActive: false,
      createdAt: '2026-04-04T10:00:00.000Z',
      updatedAt: '2026-04-04T10:00:00.000Z'
    } satisfies AppUserRecord));

    await expect(resolver.resolveAppIdentity(customerAuth())).rejects.toMatchObject({
      name: 'AppIdentityError',
      code: 'identity_mapping_inactive'
    } satisfies Partial<AppIdentityError>);
  });

  it('returns a clear error when the mapping role does not match the signed-in auth role', async () => {
    const resolver = createAppIdentityResolver(async () => ({
      authUserId: '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5',
      role: 'agent',
      customerStorageId: null,
      agentLabel: 'Alex Chen',
      isActive: true,
      createdAt: '2026-04-04T10:00:00.000Z',
      updatedAt: '2026-04-04T10:00:00.000Z'
    } satisfies AppUserRecord));

    await expect(resolver.resolveAppIdentity(customerAuth())).rejects.toMatchObject({
      name: 'AppIdentityError',
      code: 'identity_mapping_invalid'
    } satisfies Partial<AppIdentityError>);
  });

  it('returns a clear error for anonymous auth contexts', async () => {
    const resolver = createAppIdentityResolver(async () => null);

    await expect(resolver.resolveAppIdentity(anonymousAuth())).rejects.toMatchObject({
      name: 'AuthError',
      code: 'unauthorized'
    });
  });
});
