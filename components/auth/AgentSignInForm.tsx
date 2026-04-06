'use client';

import { useState } from 'react';
import { submitAgentEntrySignIn } from './realAuthClient';

export function AgentSignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const result = await submitAgentEntrySignIn(fetch, {
        email,
        password
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      window.location.assign('/admin');
    } catch {
      setError('Access denied');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label className="auth-field">
          <span>Email</span>
          <input
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label className="auth-field">
          <span>Password</span>
          <input
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
      </div>

      <div className="button-row">
        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? 'Signing In...' : 'Open Agent Workspace'}
        </button>
      </div>

      {error && <p className="error-hint">{error}</p>}
    </form>
  );
}
