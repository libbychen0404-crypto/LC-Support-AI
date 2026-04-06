import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../lib/types';

const resolveServerAuthContextMock = vi.hoisted(() => vi.fn<() => Promise<AuthContext>>());
const resolveServerAuthEntryModeMock = vi.hoisted(
  () => vi.fn<() => Promise<'demo' | 'real' | null>>()
);
const redirectMock = vi.hoisted(() =>
  vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  })
);

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => React.createElement('a', { href, className }, children)
}));

vi.mock('@/lib/auth', () => ({
  resolveServerAuthContext: resolveServerAuthContextMock
}));

vi.mock('@/lib/authEntry', () => ({
  resolveServerAuthEntryMode: resolveServerAuthEntryModeMock
}));

vi.mock('@/components/shared/SignOutForm', () => ({
  SignOutForm: () => React.createElement('button', { type: 'button' }, 'Sign Out')
}));

vi.mock('@/components/chat/ChatWorkspace', () => ({
  ChatWorkspace: () => React.createElement('div', null, 'ChatWorkspace')
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

describe('real customer chat page flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveServerAuthEntryModeMock.mockResolvedValue(null);
  });

  it('sends anonymous real-mode visitors back to /real', async () => {
    resolveServerAuthContextMock.mockResolvedValue(anonymousAuth());
    resolveServerAuthEntryModeMock.mockResolvedValue('real');
    const { default: ChatPage } = await import('../app/chat/page');

    await expect(ChatPage()).rejects.toThrow('REDIRECT:/real');
  });

  it('keeps the customer home link inside the real-user entry flow', async () => {
    resolveServerAuthContextMock.mockResolvedValue(customerAuth());
    resolveServerAuthEntryModeMock.mockResolvedValue('real');
    const { default: ChatPage } = await import('../app/chat/page');

    const html = renderToStaticMarkup(await ChatPage());

    expect(html).toContain('href="/real"');
    expect(html).not.toContain('href="/"');
  });
});
