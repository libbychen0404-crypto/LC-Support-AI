import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CustomerLoader } from '../components/chat/CustomerLoader';

describe('CustomerLoader reset semantics copy', () => {
  it('uses start-a-new-case wording that matches the real preserved-history behavior', () => {
    const markup = renderToStaticMarkup(
      <CustomerLoader
        customerId="demo-customer-001"
        name="Libby"
        phone=""
        email=""
        onNameChange={vi.fn()}
        onPhoneChange={vi.fn()}
        onEmailChange={vi.fn()}
        onLoad={vi.fn()}
        onStartFreshCase={vi.fn()}
      />
    );

    expect(markup).toContain('Start a New Case');
    expect(markup).toContain('keeps prior case history available in the case list');
    expect(markup).not.toContain('Reset My Workspace');
  });
});
