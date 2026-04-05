import { NextResponse } from 'next/server';
import {
  createDemoSession,
  getDemoSignInCookieEntries,
  getDemoSignInErrorCode,
  isDemoEntryRole
} from '@/lib/demoAuth';

export async function POST(request: Request) {
  const formData = await request.formData();
  const rawRole = formData.get('role');
  const role = typeof rawRole === 'string' ? rawRole : '';

  if (!isDemoEntryRole(role)) {
    return NextResponse.redirect(new URL('/?demoError=demo_role_invalid', request.url));
  }

  if (process.env.PUBLIC_AGENT_DEMO_ENTRY_ENABLED !== 'true' && role === 'agent') {
    return NextResponse.json({ error: 'Agent demo disabled' }, { status: 403 });
  }

  try {
    const session = await createDemoSession(role);
    const response = NextResponse.redirect(new URL(session.redirectTo, request.url));

    for (const cookie of getDemoSignInCookieEntries(session)) {
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }

    return response;
  } catch (error) {
    const errorCode = getDemoSignInErrorCode(error);

    if (errorCode === 'demo_role_disabled') {
      return NextResponse.json({ error: 'Agent demo disabled' }, { status: 403 });
    }

    const nextUrl = new URL('/', request.url);
    nextUrl.searchParams.set('demoError', errorCode);
    nextUrl.searchParams.set('demoRole', role);
    return NextResponse.redirect(nextUrl);
  }
}
