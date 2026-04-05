import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomePage from '../app/page';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('home page demo entry', () => {
  it('renders clear demo entry actions for customer and agent roles', async () => {
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('Continue as Customer');
    expect(html).toContain('Continue as Agent');
    expect(html).toContain('/api/demo-sign-in');
  });

  it('renders a clean homepage error notice after demo sign-in fails', async () => {
    const html = renderToStaticMarkup(
      await HomePage({
        searchParams: Promise.resolve({
          demoError: 'demo_identity_missing',
          demoRole: 'customer'
        })
      })
    );

    expect(html).toContain('Demo access setup is incomplete');
    expect(html).toContain('customer demo account is missing its support-platform identity mapping');
    expect(html).toContain('demo_identity_missing');
  });

  it('hides the public agent demo entry on production deployments unless explicitly enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PUBLIC_AGENT_DEMO_ENTRY_ENABLED', '');

    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('Continue as Customer');
    expect(html).not.toContain('Continue as Agent');
    expect(html).not.toContain('Review Agent Workflow');
    expect(html).toContain('seeded customer account');
    expect(html).not.toContain('seeded customer or agent account');
    expect(html).not.toContain('href="/setup"');
  });
});
