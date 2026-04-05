import { AppIdentityError } from './appIdentity';
import { AuthError, requireAgentAuthContext, resolveRequestAuthContext } from './auth';
import {
  createUserScopedSupportServiceExecutionContext,
  type SupportServiceExecutionContext
} from './supportServiceSupabase';
import {
  createUserScopedSupabaseContextResolver,
  type UserScopedSupabaseContext,
  UserScopedSupabaseClientError
} from './userScopedSupabase';
import type { AgentAuthContext, ResolvedAgentAppIdentity, WorkspaceErrorCode } from './types';

export type AdminRouteExecutionContext = SupportServiceExecutionContext & {
  privilege: 'user-scoped';
  authContext: AgentAuthContext;
  appIdentity: ResolvedAgentAppIdentity;
  userScopedContext: UserScopedSupabaseContext & {
    authContext: AgentAuthContext;
    appIdentity: ResolvedAgentAppIdentity;
  };
};

type ResolveUserScopedContext = (
  request: Request,
  authContext: AgentAuthContext
) => Promise<UserScopedSupabaseContext>;

type AdminRouteExecutionResolverDependencies = {
  resolveUserScopedContext?: ResolveUserScopedContext;
};

type ClassifiedAdminRouteError = {
  status: number;
  error: string;
  errorCode: WorkspaceErrorCode;
  detail?: string;
};

function resolveDetail(error: unknown) {
  const details = error as { details?: string; hint?: string };
  return [details?.details, details?.hint].filter(Boolean).join(' ').trim() || undefined;
}

function mapIdentityError(error: AppIdentityError): ClassifiedAdminRouteError {
  if (error.code === 'identity_mapping_missing') {
    return {
      status: 500,
      error:
        'This signed-in agent account is not fully configured for admin access yet. Finish the agent identity mapping and try again.',
      errorCode: error.code
    };
  }

  if (error.code === 'identity_mapping_inactive') {
    return {
      status: 403,
      error:
        'This agent account is currently inactive for admin operations. Reactivate it and try again.',
      errorCode: error.code
    };
  }

  return {
    status: 403,
    error:
      'This signed-in account does not match a valid agent access mapping. Check the linked role and try again.',
    errorCode: error.code
  };
}

function mapUserScopedClientError(error: UserScopedSupabaseClientError): ClassifiedAdminRouteError {
  if (error.code === 'supabase_access_token_missing') {
    return {
      status: 401,
      error:
        'Your secure admin session is missing from this request. Sign in again and try once more.',
      errorCode: error.code
    };
  }

  if (error.code === 'supabase_access_token_invalid') {
    return {
      status: 401,
      error:
        'Your secure admin session has expired or is invalid. Sign in again and retry.',
      errorCode: error.code
    };
  }

  if (error.code === 'supabase_user_mismatch') {
    return {
      status: 403,
      error:
        'Your admin session is out of sync. Sign in again so both secure sessions line up correctly.',
      errorCode: error.code
    };
  }

  return {
    status: 500,
    error:
      'This environment is missing part of the secure admin-session setup. Add the required Supabase configuration and try again.',
    errorCode: 'env_missing'
  };
}

export function classifyAdminRouteExecutionError(
  error: unknown,
  options: {
    defaultMessage: string;
    schemaMessage: string;
  }
): ClassifiedAdminRouteError {
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
        'This environment is missing required Supabase settings. Add the admin-session configuration and restart the dev server.',
      errorCode: 'env_missing',
      detail
    };
  }

  if (
    details?.code === '42703' ||
    details?.code === '42P01' ||
    lowerMessage.includes('column') ||
    lowerMessage.includes('relation') ||
    lowerMessage.includes('priority') ||
    lowerMessage.includes('assigned_to') ||
    lowerMessage.includes('customer_update')
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
      error: 'This signed-in agent is not allowed to perform that admin action.',
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

export function createAdminRouteExecutionResolver(
  dependencies: AdminRouteExecutionResolverDependencies = {}
) {
  async function resolveRequestAdminRouteExecutionContext(
    request: Request,
    authContextOverride?: AgentAuthContext
  ): Promise<AdminRouteExecutionContext> {
    const authContext = requireAgentAuthContext(authContextOverride ?? resolveRequestAuthContext(request));
    const resolveUserScopedContext =
      dependencies.resolveUserScopedContext ??
      (async (incomingRequest: Request, agentAuthContext: AgentAuthContext) =>
        createUserScopedSupabaseContextResolver({
          resolveAuthContext: () => agentAuthContext
        }).resolveRequestUserScopedSupabaseContext(incomingRequest));

    const userScopedContext = await resolveUserScopedContext(request, authContext);

    if (userScopedContext.appIdentity.kind !== 'agent') {
      throw new AppIdentityError(
        'The resolved database identity is not an agent mapping.',
        'identity_mapping_invalid'
      );
    }

    const execution = createUserScopedSupportServiceExecutionContext(userScopedContext.supabase);

    return {
      ...execution,
      privilege: 'user-scoped',
      authContext,
      appIdentity: userScopedContext.appIdentity,
      userScopedContext: {
        ...userScopedContext,
        authContext,
        appIdentity: userScopedContext.appIdentity
      }
    };
  }

  return {
    resolveRequestAdminRouteExecutionContext
  };
}
