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
  it('renders clear customer-only demo entry actions', async () => {
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('Continue as Customer');
    expect(html).toContain('Start Customer Demo');
    expect(html).not.toContain('Continue as Agent');
    expect(html).not.toContain('Review Agent Workflow');
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

  it('keeps the public homepage customer-only in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('Continue as Customer');
    expect(html).not.toContain('Continue as Agent');
    expect(html).not.toContain('Review Agent Workflow');
    expect(html).toContain('seeded customer account');
    expect(html).not.toContain('seeded customer or agent account');
    expect(html).not.toContain('href="/setup"');
  });
});
