import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomePage from '../app/page';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children)
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('public demo homepage', () => {
  it('remains customer-only in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('Continue as Customer');
    expect(html).not.toContain('Continue as Agent');
    expect(html).not.toContain('Review Agent Workflow');
    expect(html).toContain('seeded customer account');
    expect(html).not.toContain('seeded customer or agent account');
  });
});
