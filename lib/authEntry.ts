import { cookies } from 'next/headers';

export const AUTH_ENTRY_MODE_COOKIE_NAME = 'lc_support_auth_mode';

export type AuthEntryMode = 'demo' | 'real';

function getCookieSecurityOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  };
}

export function getAuthEntryModeSignInCookieEntry(mode: AuthEntryMode) {
  return {
    name: AUTH_ENTRY_MODE_COOKIE_NAME,
    value: mode,
    options: {
      ...getCookieSecurityOptions(),
      maxAge: 60 * 60 * 12
    }
  };
}

export function getAuthEntryModeSignOutCookieEntry() {
  return {
    name: AUTH_ENTRY_MODE_COOKIE_NAME,
    value: '',
    options: {
      ...getCookieSecurityOptions(),
      maxAge: 0
    }
  };
}

export function resolveAuthEntryModeFromRequest(request: Request): AuthEntryMode | null {
  const cookieHeader = request.headers.get('cookie');

  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();

    if (trimmed.startsWith(`${AUTH_ENTRY_MODE_COOKIE_NAME}=`)) {
      const value = decodeURIComponent(trimmed.slice(`${AUTH_ENTRY_MODE_COOKIE_NAME}=`.length));

      if (value === 'demo' || value === 'real') {
        return value;
      }
    }
  }

  return null;
}

export async function resolveServerAuthEntryMode(): Promise<AuthEntryMode | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(AUTH_ENTRY_MODE_COOKIE_NAME)?.value;

  if (value === 'demo' || value === 'real') {
    return value;
  }

  return null;
}
