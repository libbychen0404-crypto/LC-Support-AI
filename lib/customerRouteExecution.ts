import { AppIdentityError } from './appIdentity';
import { AuthError, requireCustomerAuthContext, resolveRequestAuthContext } from './auth';
import { HandoffReadinessError } from './supportService';
import {
  createUserScopedSupportServiceExecutionContext,
  type SupportServiceExecutionContext
} from './supportServiceSupabase';
import {
  createUserScopedSupabaseContextResolver,
  type UserScopedSupabaseContext,
  UserScopedSupabaseClientError
} from './userScopedSupabase';
import type { CustomerAuthContext, ResolvedCustomerAppIdentity, WorkspaceErrorCode } from './types';

export type CustomerRouteExecutionContext = SupportServiceExecutionContext & {
  privilege: 'user-scoped';
  authContext: CustomerAuthContext;
  effectiveAuthContext: CustomerAuthContext;
  effectiveCustomerId: string;
  appIdentity: ResolvedCustomerAppIdentity;
  userScopedContext: UserScopedSupabaseContext & {
    authContext: CustomerAuthContext;
    appIdentity: ResolvedCustomerAppIdentity;
  };
};

type CustomerExternalIdRow = {
  external_customer_id: string | null;
};

type ResolveUserScopedContext = (
  request: Request,
  authContext: CustomerAuthContext
) => Promise<UserScopedSupabaseContext>;

type CustomerRouteExecutionResolverDependencies = {
  resolveUserScopedContext?: ResolveUserScopedContext;
};

type ClassifiedCustomerRouteError = {
  status: number;
  error: string;
  errorCode: WorkspaceErrorCode;
  detail?: string;
};

function resolveDetail(error: unknown) {
  const details = error as { details?: string; hint?: string };
  return [details?.details, details?.hint].filter(Boolean).join(' ').trim() || undefined;
}

function mapIdentityError(error: AppIdentityError): ClassifiedCustomerRouteError {
  if (error.code === 'identity_mapping_missing') {
    return {
      status: 500,
      error:
        'This signed-in customer account is not fully connected to the support platform yet. Finish the customer identity mapping and try again.',
      errorCode: error.code
    };
  }

  if (error.code === 'identity_mapping_inactive') {
    return {
      status: 403,
      error:
        'This customer account is currently inactive for support access. Reactivate it and try again.',
      errorCode: error.code
    };
  }

  return {
    status: 403,
    error:
      'This customer session does not match a valid support access mapping. Check the linked customer setup and try again.',
    errorCode: error.code
  };
}

function mapUserScopedClientError(error: UserScopedSupabaseClientError): ClassifiedCustomerRouteError {
  if (error.code === 'supabase_access_token_missing') {
    return {
      status: 401,
      error:
        'Your secure support session is missing from this request. Sign in again and try once more.',
      errorCode: error.code
    };
  }

  if (error.code === 'supabase_access_token_invalid') {
    return {
      status: 401,
      error:
        'Your secure support session has expired or is invalid. Sign in again and retry.',
      errorCode: error.code
    };
  }

  if (error.code === 'supabase_user_mismatch') {
    return {
      status: 403,
      error:
        'Your support session is out of sync. Sign in again so both secure sessions line up correctly.',
      errorCode: error.code
    };
  }

  return {
    status: 500,
    error:
      'This environment is missing part of the secure customer-session setup. Add the required Supabase configuration and try again.',
    errorCode: 'env_missing'
  };
}

export function classifyCustomerRouteError(
  error: unknown,
  options: {
    defaultMessage: string;
    schemaMessage: string;
  }
): ClassifiedCustomerRouteError {
  const details = error as { code?: string; message?: string };
  const message = details?.message ?? options.defaultMessage;
  const detail = resolveDetail(error);
  const lowerMessage = message.toLowerCase();

  if (error instanceof AuthError) {
    return {
      status: error.status,
      error: error.message,
      errorCode: error.code
    };
  }

  if (error instanceof HandoffReadinessError) {
    return {
      status: 400,
      error: error.message,
      errorCode: error.code
    };
  }

  if (error instanceof AppIdentityError) {
    return mapIdentityError(error);
  }

  if (error instanceof UserScopedSupabaseClientError) {
    return mapUserScopedClientError(error);
  }

  if (
    lowerMessage.includes('missing supabase_url') ||
    lowerMessage.includes('supabase_service_role_key') ||
    lowerMessage.includes('supabase_anon_key')
  ) {
    return {
      status: 500,
      error:
        'This environment is missing required Supabase settings. Add the customer-session configuration and restart the dev server.',
      errorCode: 'env_missing',
      detail
    };
  }

  if (
    details?.code === '42703' ||
    details?.code === '42P01' ||
    lowerMessage.includes('column') ||
    lowerMessage.includes('relation') ||
    lowerMessage.includes('case_type') ||
    lowerMessage.includes('issue_type')
  ) {
    return {
      status: 500,
      error: options.schemaMessage,
      errorCode: 'schema_mismatch',
      detail
    };
  }

  if (details?.code === '42501' || lowerMessage.includes('row-level security')) {
    return {
      status: 403,
      error: 'This customer account is not allowed to access the requested support data.',
      errorCode: 'forbidden',
      detail: message
    };
  }

  return {
    status: 500,
    error: options.defaultMessage,
    errorCode: 'workspace_unavailable',
    detail: message
  };
}

export function createCustomerRouteExecutionResolver(
  dependencies: CustomerRouteExecutionResolverDependencies = {}
) {
  async function resolveEffectiveCustomerId(
    userScopedContext: UserScopedSupabaseContext & {
      authContext: CustomerAuthContext;
      appIdentity: ResolvedCustomerAppIdentity;
    }
  ) {
    if (userScopedContext.appIdentity.appUser.isDemo) {
      return userScopedContext.authContext.customerId;
    }

    const { data, error } = await userScopedContext.supabase
      .from('customers')
      .select('external_customer_id')
      .eq('id', userScopedContext.appIdentity.customerStorageId)
      .maybeSingle<CustomerExternalIdRow>();

    if (error || !data?.external_customer_id) {
      throw new AppIdentityError(
        'The signed-in customer mapping could not resolve to a valid customer profile.',
        'identity_mapping_invalid'
      );
    }

    return data.external_customer_id;
  }

  async function resolveRequestCustomerRouteExecutionContext(
    request: Request,
    authContextOverride?: CustomerAuthContext
  ): Promise<CustomerRouteExecutionContext> {
    const authContext = requireCustomerAuthContext(authContextOverride ?? resolveRequestAuthContext(request));
    const resolveUserScopedContext =
      dependencies.resolveUserScopedContext ??
      (async (incomingRequest: Request, customerAuthContext: CustomerAuthContext) =>
        createUserScopedSupabaseContextResolver({
          resolveAuthContext: () => customerAuthContext
        }).resolveRequestUserScopedSupabaseContext(incomingRequest));

    const userScopedContext = await resolveUserScopedContext(request, authContext);

    if (userScopedContext.appIdentity.kind !== 'customer') {
      throw new AppIdentityError(
        'The resolved database identity is not a customer mapping.',
        'identity_mapping_invalid'
      );
    }

    const execution = createUserScopedSupportServiceExecutionContext(userScopedContext.supabase);
    const effectiveCustomerId = await resolveEffectiveCustomerId({
      ...userScopedContext,
      authContext,
      appIdentity: userScopedContext.appIdentity
    });
    const effectiveAuthContext: CustomerAuthContext = {
      ...authContext,
      customerId: effectiveCustomerId
    };

    return {
      ...execution,
      privilege: 'user-scoped',
      authContext,
      effectiveAuthContext,
      effectiveCustomerId,
      appIdentity: userScopedContext.appIdentity,
      userScopedContext: {
        ...userScopedContext,
        authContext,
        appIdentity: userScopedContext.appIdentity
      }
    };
  }

  return {
    resolveRequestCustomerRouteExecutionContext
  };
}
