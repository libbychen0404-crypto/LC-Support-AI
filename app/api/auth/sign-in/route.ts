import { NextResponse } from 'next/server';
import { createSupabaseAnonClient } from '@/lib/supabase';
import { finalizeRealUserSession, getRealAuthSignInCookieEntries, RealAuthError } from '@/lib/realAuth';
import { checkRateLimit, createRateLimitExceededResponse, getClientIp } from '@/lib/rateLimit';
import { isValidEmail } from '@/lib/validation';

type SignInBody = {
  email?: string;
  password?: string;
};

function getStringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit('auth-sign-in', getClientIp(request));
  if (!rateLimit.allowed) {
    return createRateLimitExceededResponse(rateLimit);
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return NextResponse.json({ error: 'JSON body required' }, { status: 415 });
  }

  let body: SignInBody;

  try {
    body = (await request.json()) as SignInBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = getStringValue(body.email);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !isValidEmail(email) || !password) {
    return NextResponse.json({ error: 'Enter a valid email and password.' }, { status: 400 });
  }

  try {
    const anonClient = createSupabaseAnonClient();
    const { data, error } = await anonClient.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data.session || !data.user) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const session = await finalizeRealUserSession({
      authUserId: data.user.id,
      supabaseAccessToken: data.session.access_token
    });

    const response = NextResponse.json({
      success: true,
      ...session.sessionSummary,
      destination: session.redirectTo
    });

    for (const cookie of getRealAuthSignInCookieEntries(session)) {
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }

    return response;
  } catch (error) {
    console.error('real sign-in route error:', error);

    if (error instanceof RealAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Authentication is not available right now.' }, { status: 500 });
  }
}
