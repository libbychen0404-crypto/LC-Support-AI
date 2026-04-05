import { NextResponse } from 'next/server';
import { runSetupCheck } from '@/lib/setupCheck';

export async function GET() {
  try {
    const result = await runSetupCheck();
    return NextResponse.json(result);
  } catch (error) {
    console.error('setup-check route error:', error);

    return NextResponse.json(
      {
        env: {
          supabaseUrl: Boolean(process.env.SUPABASE_URL),
          supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
          supabaseAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
          openAiKey: Boolean(process.env.OPENAI_API_KEY),
          authSessionSecret: Boolean(process.env.AUTH_SESSION_SECRET),
          demoCustomerEmail: Boolean(process.env.DEMO_CUSTOMER_EMAIL),
          demoCustomerPassword: Boolean(process.env.DEMO_CUSTOMER_PASSWORD),
          demoAgentEmail: Boolean(process.env.DEMO_AGENT_EMAIL),
          demoAgentPassword: Boolean(process.env.DEMO_AGENT_PASSWORD)
        },
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
        details: [error instanceof Error ? error.message : 'Setup check failed.']
      },
      { status: 500 }
    );
  }
}
