'use client';

export type RealAuthSuccessPayload = {
  success: true;
  authenticated: true;
  role: 'customer' | 'agent';
  destination: '/chat' | '/admin';
  customerId?: string | null;
  agentLabel?: string | null;
};

export type RealAuthFailurePayload = {
  error?: string;
};

export type RealSignOutResult = {
  ok: boolean;
  redirectTo: '/' | '/real';
};

export type RealAuthRequestResult =
  | {
      ok: true;
      payload: RealAuthSuccessPayload;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

async function parseSafeJson<T>(response: Response) {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  body: Record<string, string>
): Promise<RealAuthRequestResult> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (response.ok) {
    const payload = await parseSafeJson<RealAuthSuccessPayload>(response);

    if (
      payload &&
      payload.success &&
      (payload.destination === '/chat' || payload.destination === '/admin') &&
      (payload.role === 'customer' || payload.role === 'agent')
    ) {
      return {
        ok: true,
        payload
      };
    }

    return {
      ok: false,
      status: response.status,
      error: 'Unable to continue right now.'
    };
  }

  const payload = await parseSafeJson<RealAuthFailurePayload>(response);
  return {
    ok: false,
    status: response.status,
    error: payload?.error || 'Unable to continue right now.'
  };
}

export function submitRealSignUp(
  fetchImpl: typeof fetch,
  body: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }
) {
  return postJson(fetchImpl, '/api/auth/sign-up', {
    name: body.name,
    email: body.email,
    password: body.password,
    phone: body.phone ?? ''
  });
}

export function submitRealSignIn(
  fetchImpl: typeof fetch,
  body: {
    email: string;
    password: string;
  }
) {
  return postJson(fetchImpl, '/api/auth/sign-in', body);
}

export async function submitRealSignOut(fetchImpl: typeof fetch) {
  const response = await fetchImpl('/api/auth/sign-out', {
    method: 'POST'
  });

  const payload = await parseSafeJson<{ redirectTo?: string }>(response);

  return {
    ok: response.ok,
    redirectTo: payload?.redirectTo === '/real' ? '/real' : '/'
  } satisfies RealSignOutResult;
}

export function submitCustomerEntrySignUp(
  fetchImpl: typeof fetch,
  body: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }
) {
  return submitRealSignUp(fetchImpl, body);
}

export function submitCustomerEntrySignIn(
  fetchImpl: typeof fetch,
  body: {
    email: string;
    password: string;
  }
) {
  return submitCustomerRealSignIn(fetchImpl, body);
}

export async function submitCustomerRealSignIn(
  fetchImpl: typeof fetch,
  body: {
    email: string;
    password: string;
  }
): Promise<RealAuthRequestResult> {
  const result = await submitRealSignIn(fetchImpl, body);

  if (!result.ok) {
    return result;
  }

  if (result.payload.destination !== '/chat' || result.payload.role !== 'customer') {
    await submitRealSignOut(fetchImpl).catch(() => false);
    return {
      ok: false,
      status: 403,
      error: 'Use the agent sign-in page for support team access.'
    };
  }

  return result;
}

export async function submitAgentEntrySignIn(
  fetchImpl: typeof fetch,
  body: {
    email: string;
    password: string;
  }
): Promise<RealAuthRequestResult> {
  const result = await submitRealSignIn(fetchImpl, body);

  if (!result.ok) {
    return result;
  }

  if (result.payload.destination !== '/admin' || result.payload.role !== 'agent') {
    await submitRealSignOut(fetchImpl).catch(() => false);
    return {
      ok: false,
      status: 403,
      error: 'Access denied'
    };
  }

  return result;
}
