import { describe, expect, it } from 'vitest';
import type { AppUserRecord, AuthContext, CustomerAuthContext } from '../lib/types';
import { createUserScopedSupabaseClient } from '../lib/supabase';
import {
  createUserScopedSupabaseContextResolver,
  decodeSupabaseAccessTokenClaims,
  UserScopedSupabaseClientError
} from '../lib/userScopedSupabase';

function createUnsignedJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

function customerAuth(userId = '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5'): CustomerAuthContext {
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

function mappedCustomerIdentity(authUserId = '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5') {
  return {
    kind: 'customer' as const,
    authContext: customerAuth(authUserId),
    appUser: {
      authUserId,
      role: 'customer' as const,
      customerStorageId: '9a3cbc61-b2f9-4f5d-9f52-6da06bcf6f54',
      agentLabel: null,
      isActive: true,
      createdAt: '2026-04-04T10:00:00.000Z',
      updatedAt: '2026-04-04T10:00:00.000Z'
    } satisfies AppUserRecord & { role: 'customer'; customerStorageId: string },
    customerStorageId: '9a3cbc61-b2f9-4f5d-9f52-6da06bcf6f54'
  };
}

describe('user-scoped Supabase foundation', () => {
  it('decodes Supabase access token claims from the JWT payload', () => {
    const token = createUnsignedJwt({
      sub: '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5',
      role: 'authenticated'
    });

    expect(decodeSupabaseAccessTokenClaims(token).sub).toBe('77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5');
  });

  it('creates a request-scoped user context when auth, mapping, and access token align', async () => {
    const accessToken = createUnsignedJwt({
      sub: '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5',
      role: 'authenticated'
    });

    const fakeClient = { marker: 'user-scoped-client' } as never;
    const resolver = createUserScopedSupabaseContextResolver({
      resolveAuthContext: () => customerAuth(),
      resolveAppIdentity: async () => mappedCustomerIdentity(),
      resolveAccessToken: () => accessToken,
      createClient: () => fakeClient
    });

    const context = await resolver.resolveRequestUserScopedSupabaseContext(new Request('http://localhost'));

    expect(context.privilege).toBe('user-scoped');
    expect(context.accessToken).toBe(accessToken);
    expect(context.appIdentity.kind).toBe('customer');
    expect(context.supabase).toBe(fakeClient);
  });

  it('returns a clear error when the request is missing a Supabase access token', async () => {
    const resolver = createUserScopedSupabaseContextResolver({
      resolveAuthContext: () => customerAuth(),
      resolveAppIdentity: async () => mappedCustomerIdentity(),
      resolveAccessToken: () => {
        throw new UserScopedSupabaseClientError(
          'No Supabase user access token was found on the current request.',
          'supabase_access_token_missing'
        );
      }
    });

    await expect(resolver.resolveRequestUserScopedSupabaseContext(new Request('http://localhost'))).rejects.toMatchObject({
      name: 'UserScopedSupabaseClientError',
      code: 'supabase_access_token_missing'
    });
  });

  it('returns a clear error when the Supabase access token subject does not match the mapped auth user', async () => {
    const accessToken = createUnsignedJwt({
      sub: 'a9788b58-1639-42e8-b126-7c708af90f85',
      role: 'authenticated'
    });

    const resolver = createUserScopedSupabaseContextResolver({
      resolveAuthContext: () => customerAuth(),
      resolveAppIdentity: async () => mappedCustomerIdentity(),
      resolveAccessToken: () => accessToken,
      createClient: () => ({ marker: 'user-scoped-client' } as never)
    });

    await expect(resolver.resolveRequestUserScopedSupabaseContext(new Request('http://localhost'))).rejects.toMatchObject({
      name: 'UserScopedSupabaseClientError',
      code: 'supabase_user_mismatch'
    });
  });

  it('returns a clear error when the Supabase access token cannot be decoded', async () => {
    const resolver = createUserScopedSupabaseContextResolver({
      resolveAuthContext: () => customerAuth(),
      resolveAppIdentity: async () => mappedCustomerIdentity(),
      resolveAccessToken: () => 'not-a-jwt-token',
      createClient: () => ({ marker: 'user-scoped-client' } as never)
    });

    await expect(resolver.resolveRequestUserScopedSupabaseContext(new Request('http://localhost'))).rejects.toMatchObject({
      name: 'UserScopedSupabaseClientError',
      code: 'supabase_access_token_invalid'
    });
  });

  it('returns a clear error when the client factory cannot build a user-scoped client', async () => {
    const accessToken = createUnsignedJwt({
      sub: '77b5a4f8-aaf0-48bc-b93f-04d204ed4ad5',
      role: 'authenticated'
    });

    const resolver = createUserScopedSupabaseContextResolver({
      resolveAuthContext: () => customerAuth(),
      resolveAppIdentity: async () => mappedCustomerIdentity(),
      resolveAccessToken: () => accessToken,
      createClient: () => {
        throw new Error('Missing SUPABASE_ANON_KEY environment variable.');
      }
    });

    await expect(resolver.resolveRequestUserScopedSupabaseContext(new Request('http://localhost'))).rejects.toMatchObject({
      name: 'UserScopedSupabaseClientError',
      code: 'supabase_anon_key_missing'
    });
  });

  it('exposes a separate service-role and user-scoped client foundation without changing existing service-role behavior', () => {
    const originalUrl = process.env.SUPABASE_URL;
    const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const originalAnonKey = process.env.SUPABASE_ANON_KEY;

    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.SUPABASE_ANON_KEY = 'anon-key';

    try {
      expect(() => createUserScopedSupabaseClient('demo-access-token')).not.toThrow();
    } finally {
      process.env.SUPABASE_URL = originalUrl;
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;
      process.env.SUPABASE_ANON_KEY = originalAnonKey;
    }
  });
});
