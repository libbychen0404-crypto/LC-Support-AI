import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_USER_ACCESS_TOKEN_COOKIE_NAME = 'lc_support_supabase_access_token';

let cachedServiceRoleClient: SupabaseClient | null = null;

function getSupabaseUrl() {
  const url = process.env.SUPABASE_URL;

  if (!url) {
    throw new Error('Missing SUPABASE_URL environment variable.');
  }

  return url;
}

function getSupabaseServiceRoleKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable.');
  }

  return serviceRoleKey;
}

function getSupabaseAnonKey() {
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!anonKey) {
    throw new Error('Missing SUPABASE_ANON_KEY environment variable.');
  }

  return anonKey;
}

export function getSupabaseServiceRoleClient() {
  if (cachedServiceRoleClient) {
    return cachedServiceRoleClient;
  }

  cachedServiceRoleClient = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return cachedServiceRoleClient;
}

export function getSupabaseServerClient() {
  return getSupabaseServiceRoleClient();
}

export function createSupabaseAnonClient() {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

export function createUserScopedSupabaseClient(accessToken: string) {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}
