import { getSupabaseServerClient } from './supabase';
import type { SetupCheckResult } from './types';

async function canSelect(table: string, columns: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from(table).select(columns).limit(1);
  return !error;
}

async function hasLegacyCaseTypeColumn() {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('cases').select('case_type').limit(1);
  return !error;
}

async function isRlsEnabled(table: 'app_users' | 'customers' | 'cases' | 'collected_fields') {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('pg_tables')
    .select('rowsecurity')
    .eq('schemaname', 'public')
    .eq('tablename', table)
    .maybeSingle<{ rowsecurity: boolean }>();

  if (error || !data) return false;
  return Boolean(data.rowsecurity);
}

async function countActiveMappings(role?: 'customer' | 'agent') {
  const supabase = getSupabaseServerClient();
  let query = supabase.from('app_users').select('auth_user_id', { count: 'exact', head: true }).eq('is_active', true);

  if (role) {
    query = query.eq('role', role);
  }

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

export async function runSetupCheck(): Promise<SetupCheckResult> {
  const env = {
    supabaseUrl: Boolean(process.env.SUPABASE_URL),
    supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    supabaseAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
    openAiKey: Boolean(process.env.OPENAI_API_KEY),
    authSessionSecret: Boolean(process.env.AUTH_SESSION_SECRET),
    demoCustomerEmail: Boolean(process.env.DEMO_CUSTOMER_EMAIL),
    demoCustomerPassword: Boolean(process.env.DEMO_CUSTOMER_PASSWORD),
    demoAgentEmail: Boolean(process.env.DEMO_AGENT_EMAIL),
    demoAgentPassword: Boolean(process.env.DEMO_AGENT_PASSWORD)
  };

  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    return {
      env,
      schema: {
        customers: false,
        cases: false,
        collectedFields: false,
        appUsers: false,
        auditLogs: false,
        rlsEnabled: false,
        legacyCaseType: false
      },
      identity: {
        ready: false,
        anyActiveMappings: false,
        customerMappings: false,
        agentMappings: false,
        userScopedClientReady: false,
        demoSignInEnvReady: false
      },
      ready: false,
      details: ['Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.']
    };
  }

  const [customers, cases, collectedFields, appUsers, auditLogs, appUsersRls, customersRls, casesRls, collectedFieldsRls, legacyCaseType] = await Promise.all([
    canSelect('customers', 'id, external_customer_id, name, phone, email, last_seen_at'),
    canSelect(
      'cases',
      'id, customer_id, issue_type, status, stage, escalation_state, handoff_status, assigned_human_agent, handoff_requested_at, handoff_contact_method, handoff_callback_window, handoff_urgency_reason, handoff_additional_details, priority, assigned_to, eta_or_expected_update_time, internal_note, resolution_note, case_note, customer_update, problem_statement, summary, next_action, confirmed, required_fields, pending_field, messages, timeline, created_at, updated_at, is_open'
    ),
    canSelect('collected_fields', 'case_id, field_key, field_value'),
    canSelect('app_users', 'auth_user_id, role, customer_id, agent_label, is_active'),
    canSelect(
      'audit_logs',
      'id, case_id, customer_id, actor_type, actor_id, action_type, action_subtype, previous_value, new_value, metadata, source, message_id, timeline_item_id, request_id, created_at'
    ),
    isRlsEnabled('app_users'),
    isRlsEnabled('customers'),
    isRlsEnabled('cases'),
    isRlsEnabled('collected_fields'),
    hasLegacyCaseTypeColumn()
  ]);

  const rlsEnabled = appUsersRls && customersRls && casesRls && collectedFieldsRls;

  const [activeMappings, activeCustomerMappings, activeAgentMappings] = appUsers
    ? await Promise.all([
        countActiveMappings(),
        countActiveMappings('customer'),
        countActiveMappings('agent')
      ])
    : [0, 0, 0];

  const details: string[] = [];

  if (!customers) details.push('The customers table is missing required support columns.');
  if (!cases) {
    details.push(
      'The cases table is missing required support columns. Run 0005_handoff_support_upgrade.sql to add the handoff and escalation columns expected by the current app.'
    );
  }
  if (!collectedFields) details.push('The collected_fields table is missing or incomplete.');
  if (!appUsers) details.push('The app_users table is missing. Run the identity foundation migration before enabling database-backed authorization.');
  if (!auditLogs) details.push('The audit_logs table is missing. Run 0008_audit_log_foundation.sql before relying on Milestone 3 audit persistence.');
  if (!rlsEnabled) details.push('Row Level Security is not fully enabled yet on the support tables.');
  if (legacyCaseType) {
    details.push(
      'Legacy case_type was detected. Run 0003_cleanup_support_schema.sql so the current app sees a single cases schema without legacy columns.'
    );
  }
  if (!env.supabaseAnonKey) {
    details.push('SUPABASE_ANON_KEY is missing. User-scoped Supabase clients and future RLS-backed route execution cannot be enabled yet.');
  }
  if (!env.openAiKey) details.push('OPENAI_API_KEY is missing. The app will fall back to deterministic support wording.');
  if (!env.authSessionSecret) details.push('AUTH_SESSION_SECRET is missing. Auth session verification cannot be enabled yet.');
  if (!env.demoCustomerEmail || !env.demoCustomerPassword) {
    details.push('Demo customer sign-in is not configured yet. Add DEMO_CUSTOMER_EMAIL and DEMO_CUSTOMER_PASSWORD to .env.local.');
  }
  if (!env.demoAgentEmail || !env.demoAgentPassword) {
    details.push('Demo agent sign-in is not configured yet. Add DEMO_AGENT_EMAIL and DEMO_AGENT_PASSWORD to .env.local.');
  }
  if (appUsers && activeMappings === 0) {
    details.push('The app_users table exists, but no active identity mappings were found yet.');
  }
  if (appUsers && activeCustomerMappings === 0) {
    details.push('No active customer app-user mappings were found. Demo customer accounts still need database identity links.');
  }
  if (appUsers && activeAgentMappings === 0) {
    details.push('No active agent app-user mappings were found. Admin accounts still need database identity links.');
  }

  const ready = customers && cases && collectedFields && !legacyCaseType;

  return {
    env,
    schema: {
      customers,
      cases,
      collectedFields,
      appUsers,
      auditLogs,
      rlsEnabled,
      legacyCaseType
    },
    identity: {
      ready: appUsers,
      anyActiveMappings: activeMappings > 0,
      customerMappings: activeCustomerMappings > 0,
      agentMappings: activeAgentMappings > 0,
      userScopedClientReady: Boolean(env.supabaseAnonKey && appUsers),
      demoSignInEnvReady: Boolean(
        env.authSessionSecret &&
          env.supabaseAnonKey &&
          env.demoCustomerEmail &&
          env.demoCustomerPassword &&
          env.demoAgentEmail &&
          env.demoAgentPassword
      )
    },
    ready,
    details
  };
}
