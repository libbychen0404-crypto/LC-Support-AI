import { createAuthSessionToken, AUTH_SESSION_COOKIE_NAME } from './auth';
import { loadAppUserByAuthUserId } from './appIdentity';
import { getSupabaseServiceRoleClient, createSupabaseAnonClient, SUPABASE_USER_ACCESS_TOKEN_COOKIE_NAME } from './supabase';

export type DemoEntryRole = 'customer' | 'agent';

export const DEMO_ENTRY_ROLES: readonly DemoEntryRole[] = ['customer', 'agent'];

export type DemoSignInErrorCode =
  | DemoAuthError['code']
  | 'demo_unknown_error';

type DemoCredentialConfig = {
  role: DemoEntryRole;
  emailEnvKey: 'DEMO_CUSTOMER_EMAIL' | 'DEMO_AGENT_EMAIL';
  passwordEnvKey: 'DEMO_CUSTOMER_PASSWORD' | 'DEMO_AGENT_PASSWORD';
  redirectTo: '/chat' | '/admin';
  defaultAgentId?: string;
};

const DEMO_CREDENTIALS: Record<DemoEntryRole, DemoCredentialConfig> = {
  customer: {
    role: 'customer',
    emailEnvKey: 'DEMO_CUSTOMER_EMAIL',
    passwordEnvKey: 'DEMO_CUSTOMER_PASSWORD',
    redirectTo: '/chat'
  },
  agent: {
    role: 'agent',
    emailEnvKey: 'DEMO_AGENT_EMAIL',
    passwordEnvKey: 'DEMO_AGENT_PASSWORD',
    redirectTo: '/admin',
    defaultAgentId: 'demo-agent'
  }
};

export class DemoAuthError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'demo_role_invalid'
      | 'demo_credentials_missing'
      | 'demo_sign_in_failed'
      | 'demo_identity_missing'
      | 'demo_identity_inactive'
      | 'demo_identity_invalid'
      | 'demo_customer_mapping_missing'
  ) {
    super(message);
    this.name = 'DemoAuthError';
  }
}

export type DemoSignInFailureViewModel = {
  code: DemoSignInErrorCode;
  title: string;
  message: string;
  operatorHint?: string;
};

export type DemoSessionResult = {
  role: DemoEntryRole;
  redirectTo: '/chat' | '/admin';
  appSessionToken: string;
  supabaseAccessToken: string;
};

export function isDemoEntryRole(value: string): value is DemoEntryRole {
  return (DEMO_ENTRY_ROLES as readonly string[]).includes(value);
}

function getCookieSecurityOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  };
}

export function getDemoSessionCookieOptions() {
  return {
    ...getCookieSecurityOptions(),
    maxAge: 60 * 60 * 12
  };
}

export function getDemoSignOutCookieOptions() {
  return {
    ...getCookieSecurityOptions(),
    maxAge: 0
  };
}

function getDemoCredentialConfig(role: DemoEntryRole) {
  return DEMO_CREDENTIALS[role];
}

export function getDemoSignInErrorMessage(error: unknown) {
  if (error instanceof DemoAuthError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unable to start the demo session right now.';
}

export function getDemoSignInErrorCode(error: unknown): DemoSignInErrorCode {
  if (error instanceof DemoAuthError) {
    return error.code;
  }

  return 'demo_unknown_error';
}

export function getDemoSignInFailureViewModel(
  code: string | null | undefined,
  role?: string | null
): DemoSignInFailureViewModel | null {
  if (!code) return null;

  const roleLabel = role === 'agent' ? 'agent' : 'customer';

  switch (code) {
    case 'demo_credentials_missing':
      return {
        code,
        title: 'Demo sign-in is not ready on this environment',
        message: `We could not open the ${roleLabel} demo because its sign-in details are not configured yet.`,
        operatorHint:
          'Add the demo email/password variables in .env.local and make sure the matching Supabase Auth user exists.'
      };
    case 'demo_sign_in_failed':
      return {
        code,
        title: 'We could not open that demo workspace',
        message: `The ${roleLabel} demo account could not sign in with the current setup.`,
        operatorHint: 'Check the seeded Supabase Auth user and confirm the demo credentials are correct.'
      };
    case 'demo_identity_missing':
      return {
        code,
        title: 'Demo access setup is incomplete',
        message: `The ${roleLabel} demo account is missing its support-platform identity mapping.`,
        operatorHint: 'Create the corresponding app_users mapping before using the demo entry.'
      };
    case 'demo_identity_inactive':
      return {
        code,
        title: 'Demo access is currently inactive',
        message: `The ${roleLabel} demo account exists, but it is not active for support access right now.`,
        operatorHint: 'Reactivate the app_users mapping and try again.'
      };
    case 'demo_identity_invalid':
      return {
        code,
        title: 'Demo role setup needs attention',
        message: `The ${roleLabel} demo account is mapped to the wrong application role for this entry.`,
        operatorHint: 'Check the app_users role and make sure it matches the selected demo entry.'
      };
    case 'demo_customer_mapping_missing':
      return {
        code,
        title: 'Customer demo data is incomplete',
        message: 'The customer demo account is missing its linked customer record in the support data layer.',
        operatorHint: 'Verify the app_users customer mapping and the linked customers row.'
      };
    case 'demo_role_invalid':
      return {
        code,
        title: 'Choose a valid demo entry',
        message: 'The requested demo entry option was not recognized.',
        operatorHint: 'Retry from the homepage buttons.'
      };
    default:
      return {
        code: 'demo_unknown_error',
        title: 'We could not open the demo workspace',
        message: `The ${roleLabel} demo workspace could not be started right now.`,
        operatorHint: 'Check setup, environment variables, and seeded demo users.'
      };
  }
}

export async function createDemoSession(role: DemoEntryRole): Promise<DemoSessionResult> {
  if (!isDemoEntryRole(role)) {
    throw new DemoAuthError('The requested demo entry role is invalid.', 'demo_role_invalid');
  }

  const config = getDemoCredentialConfig(role);
  const email = process.env[config.emailEnvKey];
  const password = process.env[config.passwordEnvKey];

  if (!email || !password) {
    throw new DemoAuthError(
      `Missing demo credentials for ${role}. Add ${config.emailEnvKey} and ${config.passwordEnvKey} to .env.local.`,
      'demo_credentials_missing'
    );
  }

  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error || !data.session || !data.user) {
    throw new DemoAuthError(
      `The ${role} demo account could not sign in. Check the seeded Supabase Auth user and demo credentials.`,
      'demo_sign_in_failed'
    );
  }

  const appUser = await loadAppUserByAuthUserId(data.user.id);
  if (!appUser) {
    throw new DemoAuthError(
      `The signed-in ${role} demo user is not linked to an app_users mapping.`,
      'demo_identity_missing'
    );
  }

  if (!appUser.isActive) {
    throw new DemoAuthError(
      `The ${role} demo user's app_users mapping is inactive.`,
      'demo_identity_inactive'
    );
  }

  if (appUser.role !== role) {
    throw new DemoAuthError(
      `The ${role} demo user is mapped to the wrong role in app_users.`,
      'demo_identity_invalid'
    );
  }

  let appSessionToken: string;

  if (role === 'customer') {
    if (!appUser.customerStorageId) {
      throw new DemoAuthError(
        'The customer demo user is missing its linked internal customer owner mapping.',
        'demo_customer_mapping_missing'
      );
    }

    const serviceRole = getSupabaseServiceRoleClient();
    const { data: customerRow, error: customerError } = await serviceRole
      .from('customers')
      .select('external_customer_id')
      .eq('id', appUser.customerStorageId)
      .maybeSingle<{ external_customer_id: string }>();

    if (customerError || !customerRow?.external_customer_id) {
      throw new DemoAuthError(
        'The customer demo mapping does not resolve to a valid customer record.',
        'demo_customer_mapping_missing'
      );
    }

    appSessionToken = createAuthSessionToken({
      role: 'customer',
      userId: data.user.id,
      customerId: customerRow.external_customer_id
    });
  } else {
    appSessionToken = createAuthSessionToken({
      role: 'agent',
      userId: data.user.id,
      agentId: config.defaultAgentId || appUser.authUserId,
      agentName: appUser.agentLabel || 'Human Support Agent'
    });
  }

  return {
    role,
    redirectTo: config.redirectTo,
    appSessionToken,
    supabaseAccessToken: data.session.access_token
  };
}

export function getDemoSignInCookieEntries(result: DemoSessionResult) {
  const options = getDemoSessionCookieOptions();

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
    }
  ];
}

export function getDemoSignOutCookieEntries() {
  const options = getDemoSignOutCookieOptions();

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
    }
  ];
}
