import { NextResponse } from 'next/server';
import { resolveAuthEntryModeFromRequest } from '@/lib/authEntry';
import { getRealAuthSignOutCookieEntries } from '@/lib/realAuth';

export async function POST(request: Request) {
  const authEntryMode = resolveAuthEntryModeFromRequest(request);
  const redirectTo = authEntryMode === 'real' ? '/real' : '/';
  const response = NextResponse.json({ success: true, redirectTo });

  for (const cookie of getRealAuthSignOutCookieEntries()) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }

  return response;
}
