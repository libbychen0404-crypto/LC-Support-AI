import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAuthenticatedAuthContext, resolveRequestAuthContext } from './auth';
import { createAppIdentityResolver } from './appIdentity';
import { createUserScopedSupabaseClient, SUPABASE_USER_ACCESS_TOKEN_COOKIE_NAME } from './supabase';
import type { AuthContext, ResolvedAppIdentity, SupabaseClientPrivilege } from './types';

type SupabaseAccessTokenClaims = {
  sub?: string;
  role?: string;
  aud?: string | string[];
  exp?: number;
};

export type UserScopedSupabaseContext = {
  privilege: Extract<SupabaseClientPrivilege, 'user-scoped'>;
  authContext: Extract<AuthContext, { isAuthenticated: true }>;
  appIdentity: ResolvedAppIdentity;
  accessToken: string;
  supabase: SupabaseClient;
};

export class UserScopedSupabaseClientError extends Error {
  code:
    | 'supabase_access_token_missing'
    | 'supabase_access_token_invalid'
    | 'supabase_user_mismatch'
    | 'supabase_anon_key_missing';

  constructor(
    message: string,
    code:
      | 'supabase_access_token_missing'
      | 'supabase_access_token_invalid'
      | 'supabase_user_mismatch'
      | 'supabase_anon_key_missing'
  ) {
    super(message);
    this.name = 'UserScopedSupabaseClientError';
    this.code = code;
  }
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

export function decodeSupabaseAccessTokenClaims(accessToken: string): SupabaseAccessTokenClaims {
  const parts = accessToken.split('.');
  if (parts.length < 2 || !parts[1]) {
    throw new UserScopedSupabaseClientError(
      'The Supabase user access token is missing or malformed.',
      'supabase_access_token_invalid'
    );
  }

  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as SupabaseAccessTokenClaims;
  } catch {
    throw new UserScopedSupabaseClientError(
      'The Supabase user access token could not be decoded.',
      'supabase_access_token_invalid'
    );
  }
}

export function resolveSupabaseAccessTokenFromRequest(request: Request) {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }

  const cookieStore = parseCookieHeader(request.headers.get('cookie'));
  const cookieToken = cookieStore.get(SUPABASE_USER_ACCESS_TOKEN_COOKIE_NAME);

  if (!cookieToken) {
    throw new UserScopedSupabaseClientError(
      'No Supabase user access token was found on the current request.',
      'supabase_access_token_missing'
    );
  }

  return cookieToken;
}

type ResolveRequestUserScopedSupabaseContextDependencies = {
  resolveAuthContext?: (request: Request) => AuthContext;
  resolveAccessToken?: (request: Request) => string;
  resolveAppIdentity?: (authContext: AuthContext) => Promise<ResolvedAppIdentity>;
  createClient?: (accessToken: string) => SupabaseClient;
};

export function createUserScopedSupabaseContextResolver(
  dependencies: ResolveRequestUserScopedSupabaseContextDependencies = {}
) {
  const appIdentityResolver = createAppIdentityResolver();
  const resolveAuthContext = dependencies.resolveAuthContext ?? resolveRequestAuthContext;
  const resolveAccessToken = dependencies.resolveAccessToken ?? resolveSupabaseAccessTokenFromRequest;
  const resolveAppIdentity = dependencies.resolveAppIdentity ?? appIdentityResolver.resolveAppIdentity;
  const createClient = dependencies.createClient ?? createUserScopedSupabaseClient;

  async function resolveRequestUserScopedSupabaseContext(request: Request): Promise<UserScopedSupabaseContext> {
    const authContext = resolveAuthContext(request);
    const authenticated = requireAuthenticatedAuthContext(authContext);
    const appIdentity = await resolveAppIdentity(authenticated);
    const accessToken = resolveAccessToken(request);
    const claims = decodeSupabaseAccessTokenClaims(accessToken);

    if (!claims.sub) {
      throw new UserScopedSupabaseClientError(
        'The Supabase user access token does not contain a subject.',
        'supabase_access_token_invalid'
      );
    }

    if (claims.sub !== appIdentity.appUser.authUserId) {
      throw new UserScopedSupabaseClientError(
        'The Supabase user access token does not match the mapped auth user.',
        'supabase_user_mismatch'
      );
    }

    try {
      const supabase = createClient(accessToken);

      return {
        privilege: 'user-scoped',
        authContext: authenticated,
        appIdentity,
        accessToken,
        supabase
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('SUPABASE_ANON_KEY')) {
        throw new UserScopedSupabaseClientError(
          'SUPABASE_ANON_KEY is required before user-scoped Supabase clients can be created.',
          'supabase_anon_key_missing'
        );
      }

      throw error;
    }
  }

  return {
    resolveRequestUserScopedSupabaseContext
  };
}
