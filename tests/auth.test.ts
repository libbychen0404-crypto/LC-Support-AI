import { afterEach, describe, expect, it } from 'vitest';
import { createAuthSessionToken, resolveAuthContextFromSessionToken } from '../lib/auth';

const originalSecret = process.env.AUTH_SESSION_SECRET;

afterEach(() => {
  process.env.AUTH_SESSION_SECRET = originalSecret;
});

describe('auth session foundation', () => {
  it('round-trips a customer session token into a customer auth context', () => {
    process.env.AUTH_SESSION_SECRET = 'test-auth-secret';

    const token = createAuthSessionToken({
      role: 'customer',
      userId: 'user-1',
      customerId: 'demo-customer-001'
    });

    const authContext = resolveAuthContextFromSessionToken(token);

    expect(authContext.isAuthenticated).toBe(true);
    expect(authContext.role).toBe('customer');
    expect(authContext.customerId).toBe('demo-customer-001');
  });

  it('returns anonymous when the token signature is invalid', () => {
    process.env.AUTH_SESSION_SECRET = 'test-auth-secret';

    const token = createAuthSessionToken({
      role: 'agent',
      userId: 'agent-user-1',
      agentId: 'agent-1',
      agentName: 'Alex Chen'
    });

    const authContext = resolveAuthContextFromSessionToken(`${token}tampered`);

    expect(authContext.isAuthenticated).toBe(false);
    expect(authContext.role).toBe('anonymous');
  });
});
