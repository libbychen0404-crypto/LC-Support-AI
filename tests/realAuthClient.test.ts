import { describe, expect, it, vi } from 'vitest';
import {
  submitAgentEntrySignIn,
  submitCustomerEntrySignIn,
  submitCustomerEntrySignUp,
  submitRealSignOut
} from '../components/auth/realAuthClient';

function createJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json'
    },
    ...init
  });
}

describe('real auth client helpers', () => {
  it('sign-up submits the expected JSON payload and returns the success destination', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse(
        {
          success: true,
          authenticated: true,
          role: 'customer',
          destination: '/chat',
          customerId: 'cust_opaque_001',
          agentLabel: null
        },
        { status: 201 }
      )
    );

    const result = await submitCustomerEntrySignUp(fetchMock, {
      name: 'Libby',
      email: 'libby@example.com',
      password: 'RealUserPass1',
      phone: '+61 400 000 000'
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/sign-up', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Libby',
        email: 'libby@example.com',
        password: 'RealUserPass1',
        phone: '+61 400 000 000'
      })
    });
    expect(result).toMatchObject({
      ok: true,
      payload: {
        destination: '/chat',
        role: 'customer'
      }
    });
  });

  it('customer sign-in returns a safe error when credentials fail', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse(
        {
          error: 'Invalid email or password.'
        },
        { status: 401 }
      )
    );

    const result = await submitCustomerEntrySignIn(fetchMock, {
      email: 'libby@example.com',
      password: 'wrong-password'
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: 'Invalid email or password.'
    });
  });

  it('customer sign-in returns the chat destination for a real customer', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse(
        {
          success: true,
          authenticated: true,
          role: 'customer',
          destination: '/chat',
          customerId: 'cust_opaque_001',
          agentLabel: null
        },
        { status: 200 }
      )
    );

    const result = await submitCustomerEntrySignIn(fetchMock, {
      email: 'customer@example.com',
      password: 'RealUserPass1'
    });

    expect(result).toMatchObject({
      ok: true,
      payload: {
        destination: '/chat',
        role: 'customer'
      }
    });
  });

  it('customer sign-in safely rejects an agent result and signs the user back out', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            success: true,
            authenticated: true,
            role: 'agent',
            destination: '/admin',
            customerId: null,
            agentLabel: 'Alex Chen'
          },
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            success: true,
            redirectTo: '/real'
          },
          { status: 200 }
        )
      );

    const result = await submitCustomerEntrySignIn(fetchMock, {
      email: 'agent@example.com',
      password: 'RealUserPass1'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/sign-out', {
      method: 'POST'
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: 'Use the agent sign-in page for support team access.'
    });
  });

  it('agent sign-in returns the admin destination for a real agent', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse(
        {
          success: true,
          authenticated: true,
          role: 'agent',
          destination: '/admin',
          customerId: null,
          agentLabel: 'Alex Chen'
        },
        { status: 200 }
      )
    );

    const result = await submitAgentEntrySignIn(fetchMock, {
      email: 'agent@example.com',
      password: 'RealUserPass1'
    });

    expect(result).toMatchObject({
      ok: true,
      payload: {
        destination: '/admin',
        role: 'agent'
      }
    });
  });

  it('agent sign-in safely rejects a non-agent result and signs the user back out', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            success: true,
            authenticated: true,
            role: 'customer',
            destination: '/chat',
            customerId: 'cust_opaque_001',
            agentLabel: null
          },
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            success: true
          },
          { status: 200 }
        )
      );

    const result = await submitAgentEntrySignIn(fetchMock, {
      email: 'customer@example.com',
      password: 'RealUserPass1'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/sign-out', {
      method: 'POST'
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: 'Access denied'
    });
  });

  it('sign-out returns the real-user landing destination when provided by the server', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse(
        {
          success: true,
          redirectTo: '/real'
        },
        { status: 200 }
      )
    );

    const result = await submitRealSignOut(fetchMock);

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/sign-out', {
      method: 'POST'
    });
    expect(result).toEqual({
      ok: true,
      redirectTo: '/real'
    });
  });
});
