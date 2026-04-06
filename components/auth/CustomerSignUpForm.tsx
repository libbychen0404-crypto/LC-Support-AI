'use client';

import { useState } from 'react';
import { submitCustomerEntrySignUp } from './realAuthClient';

export function CustomerSignUpForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const result = await submitCustomerEntrySignUp(fetch, {
        name,
        email,
        password,
        phone
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      window.location.assign(result.payload.destination);
    } catch {
      setError('We could not create your account right now.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label className="auth-field">
          <span>Name</span>
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            required
          />
        </label>

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
            autoComplete="new-password"
            required
          />
        </label>

        <label className="auth-field">
          <span>Phone (optional)</span>
          <input
            name="phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
          />
        </label>
      </div>

      <div className="button-row">
        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? 'Creating Account...' : 'Create Account'}
        </button>
      </div>

      {error && <p className="error-hint">{error}</p>}
    </form>
  );
}
