'use client';

import { useState } from 'react';

export function InternalAgentLoginForm() {
  const [accessCode, setAccessCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/demo-sign-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          role: 'agent',
          accessCode
        })
      });

      if (response.redirected) {
        window.location.assign(response.url);
        return;
      }

      if (!response.ok) {
        setError('Access denied');
        return;
      }

      window.location.reload();
    } catch {
      setError('Access denied');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="internal-agent-login-form">
      <label className="eyebrow" htmlFor="agent-demo-access-code">
        Internal Agent Demo Access
      </label>
      <input
        id="agent-demo-access-code"
        type="password"
        value={accessCode}
        onChange={(event) => setAccessCode(event.target.value)}
        placeholder="Enter access code"
        autoComplete="current-password"
      />
      <button type="submit" className="primary-button" disabled={isSubmitting}>
        Open Agent Demo
      </button>
      {error && <p className="error-hint">{error}</p>}
    </form>
  );
}
