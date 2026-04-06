import { randomUUID } from 'node:crypto';
import { AUTH_SESSION_COOKIE_NAME, createAuthSessionToken } from './auth';
import { getAuthEntryModeSignInCookieEntry, getAuthEntryModeSignOutCookieEntry } from './authEntry';
import { loadAppUserByAuthUserId } from './appIdentity';
import { getSupabaseServiceRoleClient, SUPABASE_USER_ACCESS_TOKEN_COOKIE_NAME } from './supabase';
import type { AppUserRecord, AuthContext, AuthRole } from './types';

type CustomerLookupRow = {
  external_customer_id: string;
};

export type RealAuthSessionResult = {
  role: AuthRole;
  redirectTo: '/chat' | '/admin';
  appSessionToken: string;
  supabaseAccessToken: string;
  sessionSummary: RealAuthSessionSummary;
};

export type RealAuthSessionSummary =
  | {
      authenticated: false;
      role: 'anonymous';
      customerId: null;
      agentLabel: null;
    }
  | {
      authenticated: true;
      role: 'customer';
      customerId: string;
      agentLabel: null;
    }
  | {
      authenticated: true;
      role: 'agent';
      customerId: null;
      agentLabel: string;
    };

export class RealAuthError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'real_auth_invalid_credentials'
      | 'real_auth_account_not_ready'
      | 'real_auth_invalid_signup'
      | 'real_auth_unavailable',
    readonly status: 400 | 401 | 403 | 500
  ) {
    super(message);
    this.name = 'RealAuthError';
  }
}

function logRealAuthDebug(stage: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  console.info('[real-auth debug]', stage, details);
}

function getCookieSecurityOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  };
}

function getSessionCookieOptions() {
  return {
    ...getCookieSecurityOptions(),
    maxAge: 60 * 60 * 12
  };
}

function getSignOutCookieOptions() {
  return {
    ...getCookieSecurityOptions(),
    maxAge: 0
  };
}

function getRoleRedirect(role: AuthRole) {
  return role === 'customer' ? '/chat' : '/admin';
}

function getSafeAccountNotReadyError() {
  return new RealAuthError(
    'This account is not authorized to use LC AI Support yet.',
    'real_auth_account_not_ready',
    403
  );
}

async function loadExternalCustomerId(customerStorageId: string) {
  const serviceRole = getSupabaseServiceRoleClient();
  logRealAuthDebug('load-external-customer-id-start', {
    hasCustomerStorageId: Boolean(customerStorageId)
  });
  const { data, error } = await serviceRole
    .from('customers')
    .select('external_customer_id')
    .eq('id', customerStorageId)
    .maybeSingle<CustomerLookupRow>();

  logRealAuthDebug('load-external-customer-id-result', {
    ok: !error && Boolean(data?.external_customer_id),
    hasExternalCustomerId: Boolean(data?.external_customer_id),
    error: error?.message ?? null
  });

  if (error) {
    throw new RealAuthError(
      'Authentication is not available right now.',
      'real_auth_unavailable',
      500
    );
  }

  if (!data?.external_customer_id) {
    throw getSafeAccountNotReadyError();
  }

  return data.external_customer_id;
}

function buildCustomerSessionResult(appUser: AppUserRecord & { role: 'customer'; customerStorageId: string }, customerId: string, accessToken: string): RealAuthSessionResult {
  logRealAuthDebug('build-customer-session-result', {
    hasAuthSessionSecret: Boolean(process.env.AUTH_SESSION_SECRET),
    hasCustomerId: Boolean(customerId),
    hasAccessToken: Boolean(accessToken)
  });

  return {
    role: 'customer',
    redirectTo: '/chat',
    appSessionToken: createAuthSessionToken({
      role: 'customer',
      userId: appUser.authUserId,
      customerId
    }),
    supabaseAccessToken: accessToken,
    sessionSummary: {
      authenticated: true,
      role: 'customer',
      customerId,
      agentLabel: null
    }
  };
}

function buildAgentSessionResult(appUser: AppUserRecord & { role: 'agent' }, accessToken: string): RealAuthSessionResult {
  logRealAuthDebug('build-agent-session-result', {
    hasAuthSessionSecret: Boolean(process.env.AUTH_SESSION_SECRET),
    hasAccessToken: Boolean(accessToken),
    hasAgentLabel: Boolean(appUser.agentLabel)
  });

  return {
    role: 'agent',
    redirectTo: '/admin',
    appSessionToken: createAuthSessionToken({
      role: 'agent',
      userId: appUser.authUserId,
      agentId: appUser.authUserId,
      agentName: appUser.agentLabel || 'Human Support Agent'
    }),
    supabaseAccessToken: accessToken,
    sessionSummary: {
      authenticated: true,
      role: 'agent',
      customerId: null,
      agentLabel: appUser.agentLabel || 'Human Support Agent'
    }
  };
}

export async function finalizeRealUserSession(input: {
  authUserId: string;
  supabaseAccessToken: string;
}): Promise<RealAuthSessionResult> {
  const appUser = await loadAppUserByAuthUserId(input.authUserId);

  logRealAuthDebug('load-app-user-by-auth-user-id', {
    found: Boolean(appUser),
    isActive: appUser?.isActive ?? null,
    role: appUser?.role ?? null,
    hasCustomerStorageId: Boolean(appUser?.customerStorageId),
    hasAgentLabel: Boolean(appUser?.agentLabel),
    isDemo: appUser?.isDemo ?? null
  });

  if (!appUser || !appUser.isActive) {
    logRealAuthDebug('account-not-ready', {
      reason: !appUser ? 'missing_app_user' : 'inactive_app_user'
    });
    throw getSafeAccountNotReadyError();
  }

  if (appUser.role === 'customer') {
    if (!appUser.customerStorageId) {
      logRealAuthDebug('account-not-ready', {
        reason: 'missing_customer_mapping'
      });
      throw getSafeAccountNotReadyError();
    }

    const customerId = await loadExternalCustomerId(appUser.customerStorageId);
    return buildCustomerSessionResult(
      {
        ...appUser,
        role: 'customer',
        customerStorageId: appUser.customerStorageId
      },
      customerId,
      input.supabaseAccessToken
    );
  }

  if (appUser.role === 'agent') {
    return buildAgentSessionResult(
      {
        ...appUser,
        role: 'agent'
      },
      input.supabaseAccessToken
    );
  }

  logRealAuthDebug('account-not-ready', {
    reason: 'invalid_role',
    role: appUser.role
  });
  throw getSafeAccountNotReadyError();
}

export function getRealAuthSignInCookieEntries(result: RealAuthSessionResult) {
  const options = getSessionCookieOptions();

  return [
    {
      name: AUTH_SESSION_COOKIE_NAME,
      value: result.appSessionToken,
      options
    },
    {
      name: SUPABASE_USER_ACCESS_TOKEN_COOKIE_NAME,
      value: result.supabaseAccessToken,
      options
    },
    getAuthEntryModeSignInCookieEntry('real')
  ];
}

export function getRealAuthSignOutCookieEntries() {
  const options = getSignOutCookieOptions();

  return [
    {
      name: AUTH_SESSION_COOKIE_NAME,
      value: '',
      options
    },
    {
      name: SUPABASE_USER_ACCESS_TOKEN_COOKIE_NAME,
      value: '',
      options
    },
    getAuthEntryModeSignOutCookieEntry()
  ];
}

export function generateOpaqueCustomerId() {
  return `cust_${randomUUID().replace(/-/g, '')}`;
}

export function toSafeAuthSessionSummary(authContext: AuthContext): RealAuthSessionSummary {
  if (!authContext.isAuthenticated) {
    return {
      authenticated: false,
      role: 'anonymous',
      customerId: null,
      agentLabel: null
    };
  }

  if (authContext.role === 'customer') {
    return {
      authenticated: true,
      role: 'customer',
      customerId: authContext.customerId,
      agentLabel: null
    };
  }

  return {
    authenticated: true,
    role: 'agent',
    customerId: null,
    agentLabel: authContext.agentName
  };
}
