import { requireAuthenticatedAuthContext } from './auth';
import { getSupabaseServerClient } from './supabase';
import type { AppUserRecord, AuthContext, ResolvedAgentAppIdentity, ResolvedAppIdentity, ResolvedCustomerAppIdentity } from './types';

type AppUserRow = {
  auth_user_id: string;
  role: AppUserRecord['role'];
  customer_id: string | null;
  agent_label: string | null;
  is_active: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};

type LoadAppUserByAuthUserId = (authUserId: string) => Promise<AppUserRecord | null>;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export class AppIdentityError extends Error {
  code: 'identity_mapping_missing' | 'identity_mapping_inactive' | 'identity_mapping_invalid';

  constructor(message: string, code: 'identity_mapping_missing' | 'identity_mapping_inactive' | 'identity_mapping_invalid') {
    super(message);
    this.name = 'AppIdentityError';
    this.code = code;
  }
}

export function mapAppUserRow(row: AppUserRow): AppUserRecord {
  return {
    authUserId: row.auth_user_id,
    role: row.role,
    customerStorageId: row.customer_id,
    agentLabel: row.agent_label,
    isActive: row.is_active,
    isDemo: row.is_demo,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function loadAppUserByAuthUserId(authUserId: string): Promise<AppUserRecord | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('app_users')
    .select('auth_user_id, role, customer_id, agent_label, is_active, is_demo, created_at, updated_at')
    .eq('auth_user_id', authUserId)
    .maybeSingle<AppUserRow>();

  if (error) throw error;
  return data ? mapAppUserRow(data) : null;
}

export function createAppIdentityResolver(loadByAuthUserId: LoadAppUserByAuthUserId = loadAppUserByAuthUserId) {
  async function getAppUserRecord(authContext: AuthContext) {
    const authenticated = requireAuthenticatedAuthContext(authContext);

    if (!isUuid(authenticated.userId)) {
      throw new AppIdentityError(
        'The current signed-in session is not linked to a Supabase auth user yet.',
        'identity_mapping_missing'
      );
    }

    const appUser = await loadByAuthUserId(authenticated.userId);

    if (!appUser) {
      throw new AppIdentityError(
        'No database identity mapping exists for the current signed-in user.',
        'identity_mapping_missing'
      );
    }

    if (!appUser.isActive) {
      throw new AppIdentityError(
        'The database identity mapping for the current user is inactive.',
        'identity_mapping_inactive'
      );
    }

    if (appUser.role !== authenticated.role) {
      throw new AppIdentityError(
        'The signed-in role does not match the mapped database identity role.',
        'identity_mapping_invalid'
      );
    }

    return {
      authContext: authenticated,
      appUser
    };
  }

  async function resolveAppIdentity(authContext: AuthContext): Promise<ResolvedAppIdentity> {
    const { authContext: authenticated, appUser } = await getAppUserRecord(authContext);

    if (authenticated.role === 'customer') {
      if (!appUser.customerStorageId) {
        throw new AppIdentityError(
          'The signed-in customer mapping is missing its internal customer owner.',
          'identity_mapping_invalid'
        );
      }

      return {
        kind: 'customer',
        authContext: authenticated,
        appUser: {
          ...appUser,
          role: 'customer',
          customerStorageId: appUser.customerStorageId
        },
        customerStorageId: appUser.customerStorageId
      } satisfies ResolvedCustomerAppIdentity;
    }

    return {
      kind: 'agent',
      authContext: authenticated,
      appUser: {
        ...appUser,
        role: 'agent'
      }
    } satisfies ResolvedAgentAppIdentity;
  }

  async function requireCustomerAppIdentity(authContext: AuthContext) {
    const identity = await resolveAppIdentity(authContext);

    if (identity.kind !== 'customer') {
      throw new AppIdentityError(
        'The mapped database identity is not a customer.',
        'identity_mapping_invalid'
      );
    }

    return identity;
  }

  async function requireAgentAppIdentity(authContext: AuthContext) {
    const identity = await resolveAppIdentity(authContext);

    if (identity.kind !== 'agent') {
      throw new AppIdentityError(
        'The mapped database identity is not an agent.',
        'identity_mapping_invalid'
      );
    }

    return identity;
  }

  return {
    getAppUserRecord,
    resolveAppIdentity,
    requireCustomerAppIdentity,
    requireAgentAppIdentity
  };
}
