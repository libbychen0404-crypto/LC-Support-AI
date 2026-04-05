import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { AuthContext, AuthRole, AuthSessionPayload } from './types';

export const AUTH_SESSION_COOKIE_NAME = 'lc_support_session';
const AUTH_SESSION_VERSION = 1;
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12;

function getAnonymousAuthContext(): AuthContext {
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

export class AuthError extends Error {
  status: 401 | 403;
  code: 'unauthorized' | 'forbidden';

  constructor(message: string, status: 401 | 403, code: 'unauthorized' | 'forbidden') {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
  }
}

function getAuthSessionSecret() {
  return process.env.AUTH_SESSION_SECRET ?? '';
}

function signValue(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function encodePayload(payload: AuthSessionPayload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePayload(value: string) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as AuthSessionPayload;
}

function toAuthContext(payload: AuthSessionPayload): AuthContext {
  if (payload.role === 'customer' && payload.customerId) {
    return {
      isAuthenticated: true,
      role: 'customer',
      sessionId: payload.sessionId,
      userId: payload.userId,
      customerId: payload.customerId,
      agentId: null,
      agentName: null
    };
  }

  if (payload.role === 'agent' && payload.agentId) {
    return {
      isAuthenticated: true,
      role: 'agent',
      sessionId: payload.sessionId,
      userId: payload.userId,
      customerId: null,
      agentId: payload.agentId,
      agentName: payload.agentName || 'Human Support Agent'
    };
  }

  return getAnonymousAuthContext();
}

function parseCookieHeader(cookieHeader: string | null) {
  if (!cookieHeader) return new Map<string, string>();

  return new Map(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex === -1) return [part, ''];
        return [part.slice(0, separatorIndex), decodeURIComponent(part.slice(separatorIndex + 1))];
      })
  );
}

export function createAuthSessionToken(input: {
  role: AuthRole;
  userId: string;
  customerId?: string;
  agentId?: string;
  agentName?: string;
  ttlSeconds?: number;
}) {
  const secret = getAuthSessionSecret();
  if (!secret) {
    throw new Error('Missing AUTH_SESSION_SECRET environment variable.');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * (input.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS));
  const payload: AuthSessionPayload = {
    version: AUTH_SESSION_VERSION,
    sessionId: randomUUID(),
    userId: input.userId,
    role: input.role,
    customerId: input.customerId,
    agentId: input.agentId,
    agentName: input.agentName,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };

  const encodedPayload = encodePayload(payload);
  const signature = signValue(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function resolveAuthContextFromSessionToken(token: string | null | undefined): AuthContext {
  if (!token) return getAnonymousAuthContext();

  const secret = getAuthSessionSecret();
  if (!secret) return getAnonymousAuthContext();

  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) return getAnonymousAuthContext();

  const expectedSignature = signValue(encodedPayload, secret);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return getAnonymousAuthContext();
  }

  try {
    const payload = decodePayload(encodedPayload);

    if (payload.version !== AUTH_SESSION_VERSION) {
      return getAnonymousAuthContext();
    }

    if (new Date(payload.expiresAt).getTime() <= Date.now()) {
      return getAnonymousAuthContext();
    }

    return toAuthContext(payload);
  } catch {
    return getAnonymousAuthContext();
  }
}

export function resolveRequestAuthContext(request: Request): AuthContext {
  const cookieStore = parseCookieHeader(request.headers.get('cookie'));
  return resolveAuthContextFromSessionToken(cookieStore.get(AUTH_SESSION_COOKIE_NAME));
}

export async function resolveServerAuthContext(): Promise<AuthContext> {
  const cookieStore = await cookies();
  return resolveAuthContextFromSessionToken(cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value);
}

export function isCustomerAuthContext(authContext: AuthContext): authContext is Extract<AuthContext, { role: 'customer' }> {
  return authContext.isAuthenticated && authContext.role === 'customer';
}

export function isAgentAuthContext(authContext: AuthContext): authContext is Extract<AuthContext, { role: 'agent' }> {
  return authContext.isAuthenticated && authContext.role === 'agent';
}

export function requireAuthenticatedAuthContext(
  authContext: AuthContext
): Extract<AuthContext, { isAuthenticated: true }> {
  if (!authContext.isAuthenticated) {
    throw new AuthError('You must sign in to access this resource.', 401, 'unauthorized');
  }

  return authContext;
}

export function requireCustomerAuthContext(authContext: AuthContext) {
  const authenticated = requireAuthenticatedAuthContext(authContext);

  if (authenticated.role !== 'customer') {
    throw new AuthError('This route is only available to signed-in customers.', 403, 'forbidden');
  }

  return authenticated;
}

export function requireAgentAuthContext(authContext: AuthContext) {
  const authenticated = requireAuthenticatedAuthContext(authContext);

  if (authenticated.role !== 'agent') {
    throw new AuthError('This route is only available to signed-in agents.', 403, 'forbidden');
  }

  return authenticated;
}

export function resolveAuthorizedCustomerId(authContext: AuthContext, requestedCustomerId?: string | null) {
  const customerAuth = requireCustomerAuthContext(authContext);

  if (requestedCustomerId && requestedCustomerId !== customerAuth.customerId) {
    throw new AuthError('You are not allowed to access another customer profile.', 403, 'forbidden');
  }

  return customerAuth.customerId;
}
