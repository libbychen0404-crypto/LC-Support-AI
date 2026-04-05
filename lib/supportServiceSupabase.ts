import type { SupportStorageAdapter } from './storage';
import { createAuditLogger } from './auditLogger';
import { createSupabaseAuditStorageAdapter } from './auditStorageSupabase';
import { getSupabaseServiceRoleClient } from './supabase';
import { createSupabaseStorageAdapter, type SupportSupabaseClient } from './storageSupabase';
import { createSupportService } from './supportService';
import type { SupabaseClientPrivilege } from './types';

export type SupportServiceExecutionContext = {
  privilege: SupabaseClientPrivilege;
  storage: SupportStorageAdapter;
  service: ReturnType<typeof createSupportService>;
};

function createSupportServiceExecutionContext(
  client: SupportSupabaseClient,
  privilege: SupabaseClientPrivilege
): SupportServiceExecutionContext {
  const storage = createSupabaseStorageAdapter(client);
  const auditStorage = createSupabaseAuditStorageAdapter(client);
  const auditLogger = createAuditLogger(auditStorage);

  return {
    privilege,
    storage,
    service: createSupportService(storage, { auditLogger })
  };
}

export function createServiceRoleSupportServiceExecutionContext() {
  return createSupportServiceExecutionContext(getSupabaseServiceRoleClient(), 'service-role');
}

export function createUserScopedSupportServiceExecutionContext(client: SupportSupabaseClient) {
  return createSupportServiceExecutionContext(client, 'user-scoped');
}
