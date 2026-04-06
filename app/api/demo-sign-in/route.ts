import { NextResponse } from 'next/server';
import {
  createDemoSession,
  getDemoSignInCookieEntries,
  getDemoSignInErrorCode,
  isDemoEntryRole
} from '@/lib/demoAuth';

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return NextResponse.json({ error: 'JSON body required' }, { status: 415 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const role =
    typeof body === 'object' && body !== null && 'role' in body && typeof body.role === 'string'
      ? body.role
      : '';
  const accessCode =
    typeof body === 'object' && body !== null && 'accessCode' in body && typeof body.accessCode === 'string'
      ? body.accessCode
      : '';
  const expectedAgentAccessCode = process.env.AGENT_DEMO_ACCESS_CODE ?? '';

  if (!isDemoEntryRole(role)) {
    return new Response(JSON.stringify({ error: 'Invalid role' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (role === 'agent' && (!accessCode || !expectedAgentAccessCode || accessCode !== expectedAgentAccessCode)) {
    return new Response(JSON.stringify({ error: 'Invalid access code' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const session = await createDemoSession(role, {
      skipPublicEntryCheck: role === 'agent'
    });
    const response = NextResponse.redirect(new URL(session.redirectTo, request.url));

    for (const cookie of getDemoSignInCookieEntries(session)) {
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }

    return response;
  } catch (error) {
    const errorCode = getDemoSignInErrorCode(error);

    if (role === 'agent' && errorCode === 'demo_role_disabled') {
      return new Response(JSON.stringify({ error: 'Invalid access code' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Unable to start demo session' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
