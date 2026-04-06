import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AuthContext } from '../lib/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveServerAuthContextMock = vi.hoisted(() => vi.fn<() => Promise<AuthContext>>());
const redirectMock = vi.hoisted(() =>
  vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  })
);

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children)
}));

vi.mock('@/lib/auth', () => ({
  resolveServerAuthContext: resolveServerAuthContextMock
}));

function anonymousAuth(): AuthContext {
  return {
    isAuthenticated: false,
    role: 'anonymous',
    sessionId: null,
    userId: null,
    customerId: null,
    agentId: null,
    agentName: null
  };
}

function customerAuth(): AuthContext {
  return {
    isAuthenticated: true,
    role: 'customer',
    sessionId: 'customer-session',
    userId: 'customer-user',
    customerId: 'cust_opaque_001',
    agentId: null,
    agentName: null
  };
}

function agentAuth(): AuthContext {
  return {
    isAuthenticated: true,
    role: 'agent',
    sessionId: 'agent-session',
    userId: 'agent-user',
    customerId: null,
    agentId: 'agent-1',
    agentName: 'Alex Chen'
  };
}

describe('/real landing page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the real-user entry actions for anonymous visitors', async () => {
    resolveServerAuthContextMock.mockResolvedValue(anonymousAuth());
    const { default: RealLandingPage } = await import('../app/real/page');

    const html = renderToStaticMarkup(await RealLandingPage());

    expect(html).toContain('Access the real support platform');
    expect(html).toContain('href="/sign-up"');
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain('href="/agent-sign-in"');
  });

  it('redirects authenticated customers to /chat', async () => {
    resolveServerAuthContextMock.mockResolvedValue(customerAuth());
    const { default: RealLandingPage } = await import('../app/real/page');

    await expect(RealLandingPage()).rejects.toThrow('REDIRECT:/chat');
  });

  it('redirects authenticated agents to /admin', async () => {
    resolveServerAuthContextMock.mockResolvedValue(agentAuth());
    const { default: RealLandingPage } = await import('../app/real/page');

    await expect(RealLandingPage()).rejects.toThrow('REDIRECT:/admin');
  });
});
