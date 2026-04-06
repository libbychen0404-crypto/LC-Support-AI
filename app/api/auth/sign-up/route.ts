import { NextResponse } from 'next/server';
import { createSupabaseAnonClient, getSupabaseServiceRoleClient } from '@/lib/supabase';
import {
  finalizeRealUserSession,
  generateOpaqueCustomerId,
  getRealAuthSignInCookieEntries,
  RealAuthError
} from '@/lib/realAuth';
import { checkRateLimit, createRateLimitExceededResponse, getClientIp } from '@/lib/rateLimit';
import { isValidEmail, isValidPhone } from '@/lib/validation';

type SignUpBody = {
  email?: string;
  password?: string;
  name?: string;
  phone?: string;
};

const MIN_PASSWORD_LENGTH = 8;

function getStringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function logRealSignUpDebug(stage: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  console.info('[real-sign-up debug]', stage, details);
}

function getSafeSignUpValidationError(body: SignUpBody) {
  const email = getStringValue(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const name = getStringValue(body.name);
  const phone = getStringValue(body.phone);

  if (!email || !isValidEmail(email)) {
    return 'Enter a valid email address to create an account.';
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (!name) {
    return 'Enter your name to create an account.';
  }

  if (phone && !isValidPhone(phone)) {
    return 'Enter a valid phone number before creating an account.';
  }

  return null;
}

async function rollbackPendingSignUp(input: {
  authUserId: string | null;
  customerStorageId: string | null;
}) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (input.customerStorageId) {
    await serviceRole.from('customers').delete().eq('id', input.customerStorageId);
  }

  if (input.authUserId) {
    await serviceRole.auth.admin.deleteUser(input.authUserId);
  }
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit('auth-sign-up', getClientIp(request));
  if (!rateLimit.allowed) {
    return createRateLimitExceededResponse(rateLimit);
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return NextResponse.json({ error: 'JSON body required' }, { status: 415 });
  }

  let body: SignUpBody;

  try {
    body = (await request.json()) as SignUpBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validationError = getSafeSignUpValidationError(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const email = getStringValue(body.email);
  const password = body.password as string;
  const name = getStringValue(body.name);
  const phone = getStringValue(body.phone);
  const externalCustomerId = generateOpaqueCustomerId();

  let authUserId: string | null = null;
  let customerStorageId: string | null = null;
  let provisioningComplete = false;

  try {
    logRealSignUpDebug('env-check', {
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
      hasSupabaseAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
      hasSupabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasAuthSessionSecret: Boolean(process.env.AUTH_SESSION_SECRET)
    });

    let serviceRole;
    try {
      serviceRole = getSupabaseServiceRoleClient();
      logRealSignUpDebug('service-role-client-init', { ok: true });
    } catch (error) {
      logRealSignUpDebug('service-role-client-init', {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new RealAuthError('Authentication is not available right now.', 'real_auth_unavailable', 500);
    }

    let anonClient;
    try {
      anonClient = createSupabaseAnonClient();
      logRealSignUpDebug('anon-client-init', { ok: true });
    } catch (error) {
      logRealSignUpDebug('anon-client-init', {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new RealAuthError('Authentication is not available right now.', 'real_auth_unavailable', 500);
    }

    const { data: createUserData, error: createUserError } = await serviceRole.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name
      }
    });

    logRealSignUpDebug('supabase-auth-create-user', {
      ok: !createUserError && Boolean(createUserData.user),
      hasUser: Boolean(createUserData.user),
      error: createUserError?.message ?? null
    });

    if (createUserError || !createUserData.user) {
      return NextResponse.json({ error: 'Unable to create account with the provided details.' }, { status: 400 });
    }

    authUserId = createUserData.user.id;

    const { data: customerRow, error: customerError } = await serviceRole
      .from('customers')
      .insert({
        external_customer_id: externalCustomerId,
        name,
        phone,
        email,
        last_seen_at: new Date().toISOString()
      })
      .select('id')
      .single<{ id: string }>();

    logRealSignUpDebug('customers-provision', {
      ok: !customerError && Boolean(customerRow?.id),
      hasCustomerStorageId: Boolean(customerRow?.id),
      error: customerError?.message ?? null
    });

    if (customerError || !customerRow?.id) {
      throw new RealAuthError('Authentication is not available right now.', 'real_auth_unavailable', 500);
    }

    customerStorageId = customerRow.id;

    const { error: appUserError } = await serviceRole.from('app_users').insert({
      auth_user_id: authUserId,
      role: 'customer',
      customer_id: customerStorageId,
      is_demo: false,
      is_active: true
    });

    logRealSignUpDebug('app-users-provision', {
      ok: !appUserError,
      error: appUserError?.message ?? null
    });

    if (appUserError) {
      throw new RealAuthError('Authentication is not available right now.', 'real_auth_unavailable', 500);
    }

    provisioningComplete = true;

    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email,
      password
    });

    logRealSignUpDebug('supabase-auth-sign-in-with-password', {
      ok: !signInError && Boolean(signInData.session) && Boolean(signInData.user),
      hasSession: Boolean(signInData.session),
      hasUser: Boolean(signInData.user),
      error: signInError?.message ?? null
    });

    if (signInError || !signInData.session || !signInData.user) {
      throw new RealAuthError('Authentication is not available right now.', 'real_auth_unavailable', 500);
    }

    logRealSignUpDebug('finalize-real-user-session-start', {
      authUserIdMatchesProvisionedUser: signInData.user.id === authUserId
    });

    const session = await finalizeRealUserSession({
      authUserId: signInData.user.id,
      supabaseAccessToken: signInData.session.access_token
    });

    logRealSignUpDebug('finalize-real-user-session-success', {
      role: session.role,
      destination: session.redirectTo,
      authenticated: session.sessionSummary.authenticated
    });

    const response = NextResponse.json(
      {
        success: true,
        ...session.sessionSummary,
        destination: session.redirectTo
      },
      { status: 201 }
    );

    for (const cookie of getRealAuthSignInCookieEntries(session)) {
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }

    return response;
  } catch (error) {
    console.error('real sign-up route error:', error);
    logRealSignUpDebug('caught-error', {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      realAuthCode: error instanceof RealAuthError ? error.code : null,
      provisioningComplete,
      hadAuthUserId: Boolean(authUserId),
      hadCustomerStorageId: Boolean(customerStorageId)
    });

    if (!provisioningComplete) {
      try {
        await rollbackPendingSignUp({
          authUserId,
          customerStorageId
        });
        logRealSignUpDebug('rollback-pending-sign-up', {
          ok: true,
          hadAuthUserId: Boolean(authUserId),
          hadCustomerStorageId: Boolean(customerStorageId)
        });
      } catch (rollbackError) {
        console.error('real sign-up rollback failed:', rollbackError);
        logRealSignUpDebug('rollback-pending-sign-up', {
          ok: false,
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
        });
      }
    }

    if (error instanceof RealAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Authentication is not available right now.' }, { status: 500 });
  }
}
