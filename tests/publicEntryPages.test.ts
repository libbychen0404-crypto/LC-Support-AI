import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import HomePage from '../app/page';
import InternalAgentLoginPage from '../app/internal-agent-login/page';

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

vi.mock('@/components/shared/DemoSignInButton', () => ({
  DemoSignInButton: ({
    label,
    className
  }: {
    label: string;
    className?: string;
  }) => React.createElement('button', { className, type: 'button' }, label)
}));

vi.mock('@/components/internal/InternalAgentLoginForm', () => ({
  InternalAgentLoginForm: () => React.createElement('div', null, 'InternalAgentLoginForm')
}));

describe('public entry pages', () => {
  it('keeps the public homepage customer-only', async () => {
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('Continue as Customer');
    expect(html).toContain('Start Customer Demo');
    expect(html).not.toContain('Continue as Agent');
    expect(html).not.toContain('Review Agent Workflow');
    expect(html).toContain('seeded customer account');
  });

  it('renders the private internal agent login page', async () => {
    const html = renderToStaticMarkup(React.createElement(InternalAgentLoginPage));

    expect(html).toContain('Internal Agent Demo Access');
    expect(html).toContain('Private agent demo login');
    expect(html).toContain('InternalAgentLoginForm');
  });
});
