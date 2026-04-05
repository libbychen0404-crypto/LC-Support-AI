import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../lib/types';

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
  default: ({ children }: { children: unknown }) => children
}));

vi.mock('@/lib/auth', () => ({
  resolveServerAuthContext: resolveServerAuthContextMock
}));

vi.mock('@/components/chat/ChatWorkspace', () => ({
  ChatWorkspace: () => 'ChatWorkspace'
}));

vi.mock('@/components/admin/AdminWorkspace', () => ({
  AdminWorkspace: () => 'AdminWorkspace'
}));

vi.mock('@/components/handoff/HumanSupportWorkspace', () => ({
  HumanSupportWorkspace: ({ caseId }: { caseId: string }) => `HumanSupportWorkspace:${caseId}`
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
    sessionId: 'session-customer',
    userId: 'user-customer-1',
    customerId: 'demo-customer-001',
    agentId: null,
    agentName: null
  };
}

function agentAuth(): AuthContext {
  return {
    isAuthenticated: true,
    role: 'agent',
    sessionId: 'session-agent',
    userId: 'user-agent-1',
    customerId: null,
    agentId: 'agent-1',
    agentName: 'Alex Chen'
  };
}

describe('page protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects anonymous visitors away from /chat', async () => {
    resolveServerAuthContextMock.mockResolvedValue(anonymousAuth());
    const { default: ChatPage } = await import('../app/chat/page');

    await expect(ChatPage()).rejects.toThrow('REDIRECT:/');
  });

  it('allows signed-in customers into /chat', async () => {
    resolveServerAuthContextMock.mockResolvedValue(customerAuth());
    const { default: ChatPage } = await import('../app/chat/page');

    const result = await ChatPage();

    expect(result).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects signed-in agents from /chat to /admin', async () => {
    resolveServerAuthContextMock.mockResolvedValue(agentAuth());
    const { default: ChatPage } = await import('../app/chat/page');

    await expect(ChatPage()).rejects.toThrow('REDIRECT:/admin');
  });

  it('redirects anonymous visitors away from /admin', async () => {
    resolveServerAuthContextMock.mockResolvedValue(anonymousAuth());
    const { default: AdminPage } = await import('../app/admin/page');

    await expect(AdminPage()).rejects.toThrow('REDIRECT:/');
  });

  it('redirects signed-in customers from /admin to /chat', async () => {
    resolveServerAuthContextMock.mockResolvedValue(customerAuth());
    const { default: AdminPage } = await import('../app/admin/page');

    await expect(AdminPage()).rejects.toThrow('REDIRECT:/chat');
  });

  it('allows signed-in agents into /admin', async () => {
    resolveServerAuthContextMock.mockResolvedValue(agentAuth());
    const { default: AdminPage } = await import('../app/admin/page');

    const result = await AdminPage();

    expect(result).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects anonymous visitors away from /human-support', async () => {
    resolveServerAuthContextMock.mockResolvedValue(anonymousAuth());
    const { default: HumanSupportPage } = await import('../app/human-support/page');

    await expect(HumanSupportPage({ searchParams: Promise.resolve({ caseId: 'case-1' }) })).rejects.toThrow('REDIRECT:/');
  });

  it('redirects signed-in agents from /human-support to /admin', async () => {
    resolveServerAuthContextMock.mockResolvedValue(agentAuth());
    const { default: HumanSupportPage } = await import('../app/human-support/page');

    await expect(HumanSupportPage({ searchParams: Promise.resolve({ caseId: 'case-1' }) })).rejects.toThrow('REDIRECT:/admin');
  });

  it('redirects signed-in customers without a caseId from /human-support to /chat', async () => {
    resolveServerAuthContextMock.mockResolvedValue(customerAuth());
    const { default: HumanSupportPage } = await import('../app/human-support/page');

    await expect(HumanSupportPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/chat');
  });

  it('allows signed-in customers into /human-support when a caseId is provided', async () => {
    resolveServerAuthContextMock.mockResolvedValue(customerAuth());
    const { default: HumanSupportPage } = await import('../app/human-support/page');

    const result = await HumanSupportPage({ searchParams: Promise.resolve({ caseId: 'case-1' }) });

    expect(result).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
