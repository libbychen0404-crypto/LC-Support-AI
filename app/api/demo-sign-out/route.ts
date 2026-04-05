import { NextResponse } from 'next/server';
import { getDemoSignOutCookieEntries } from '@/lib/demoAuth';

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/', request.url));

  for (const cookie of getDemoSignOutCookieEntries()) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }

  return response;
}
