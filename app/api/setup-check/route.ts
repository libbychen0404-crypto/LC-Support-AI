import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth';
import { requireProductionSetupAccess, isProductionRuntime } from '@/lib/security';
import { runSetupCheck } from '@/lib/setupCheck';

export async function GET(request: Request) {
  try {
    requireProductionSetupAccess(request);
    const result = await runSetupCheck();
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        {
          error:
            error.status === 401
              ? 'Sign in as a support agent before opening the setup diagnostics.'
              : 'Only support agents can open the setup diagnostics on this environment.',
          errorCode: error.code
        },
        { status: error.status }
      );
    }

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
        details: [isProductionRuntime() ? 'Setup check failed.' : error instanceof Error ? error.message : 'Setup check failed.'],
        advisories: []
      },
      { status: 500 }
    );
  }
}
