import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
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
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

vi.mock('@/lib/auth', () => ({
  resolveServerAuthContext: resolveServerAuthContextMock
}));

vi.mock('@/components/auth/CustomerSignUpForm', () => ({
  CustomerSignUpForm: () => 'CustomerSignUpForm'
}));

vi.mock('@/components/auth/CustomerSignInForm', () => ({
  CustomerSignInForm: () => 'CustomerSignInForm'
}));

vi.mock('@/components/auth/AgentSignInForm', () => ({
  AgentSignInForm: () => 'AgentSignInForm'
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

describe('real auth pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the sign-up page for anonymous visitors', async () => {
    resolveServerAuthContextMock.mockResolvedValue(anonymousAuth());
    const { default: SignUpPage } = await import('../app/sign-up/page');

    const html = renderToStaticMarkup(await SignUpPage());

    expect(html).toContain('Create your support account');
    expect(html).toContain('CustomerSignUpForm');
  });

  it('renders the sign-in page for anonymous visitors', async () => {
    resolveServerAuthContextMock.mockResolvedValue(anonymousAuth());
    const { default: SignInPage } = await import('../app/sign-in/page');

    const html = renderToStaticMarkup(await SignInPage());

    expect(html).toContain('Sign in to your support account');
    expect(html).toContain('CustomerSignInForm');
  });

  it('renders the agent sign-in page for anonymous visitors', async () => {
    resolveServerAuthContextMock.mockResolvedValue(anonymousAuth());
    const { default: AgentSignInPage } = await import('../app/agent-sign-in/page');

    const html = renderToStaticMarkup(await AgentSignInPage());

    expect(html).toContain('Agent sign-in');
    expect(html).toContain('AgentSignInForm');
  });

  it('renders the /real landing page for anonymous visitors', async () => {
    resolveServerAuthContextMock.mockResolvedValue(anonymousAuth());
    const { default: RealLandingPage } = await import('../app/real/page');

    const html = renderToStaticMarkup(await RealLandingPage());

    expect(html).toContain('Access the real support platform');
    expect(html).toContain('href="/sign-up"');
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain('href="/agent-sign-in"');
  });

  it('redirects signed-in customers away from /sign-in to /chat', async () => {
    resolveServerAuthContextMock.mockResolvedValue(customerAuth());
    const { default: SignInPage } = await import('../app/sign-in/page');

    await expect(SignInPage()).rejects.toThrow('REDIRECT:/chat');
  });

  it('redirects signed-in agents away from /sign-up to /admin', async () => {
    resolveServerAuthContextMock.mockResolvedValue(agentAuth());
    const { default: SignUpPage } = await import('../app/sign-up/page');

    await expect(SignUpPage()).rejects.toThrow('REDIRECT:/admin');
  });

  it('redirects already-authenticated agents away from /agent-sign-in to /admin', async () => {
    resolveServerAuthContextMock.mockResolvedValue(agentAuth());
    const { default: AgentSignInPage } = await import('../app/agent-sign-in/page');

    await expect(AgentSignInPage()).rejects.toThrow('REDIRECT:/admin');
  });

  it('redirects signed-in customers away from /real to /chat', async () => {
    resolveServerAuthContextMock.mockResolvedValue(customerAuth());
    const { default: RealLandingPage } = await import('../app/real/page');

    await expect(RealLandingPage()).rejects.toThrow('REDIRECT:/chat');
  });

  it('redirects signed-in agents away from /real to /admin', async () => {
    resolveServerAuthContextMock.mockResolvedValue(agentAuth());
    const { default: RealLandingPage } = await import('../app/real/page');

    await expect(RealLandingPage()).rejects.toThrow('REDIRECT:/admin');
  });
});
