'use client';

import { useState } from 'react';
import type { DemoEntryRole } from '@/lib/demoAuth';

type DemoSignInButtonProps = {
  role: DemoEntryRole;
  label: string;
  className: string;
};

export function DemoSignInButton({ role, label, className }: DemoSignInButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/demo-sign-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role })
      });

      if (response.redirected) {
        window.location.assign(response.url);
        return;
      }

      if (response.status === 403) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? 'This demo entry is currently unavailable.');
        return;
      }

      if (!response.ok) {
        window.location.assign(`/?demoError=demo_sign_in_failed&demoRole=${encodeURIComponent(role)}`);
        return;
      }

      window.location.reload();
    } catch {
      window.location.assign(`/?demoError=demo_sign_in_failed&demoRole=${encodeURIComponent(role)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="demo-sign-in-action">
      <button type="button" className={className} onClick={handleSubmit} disabled={isSubmitting}>
        {label}
      </button>
      {error && <p className="error-hint">{error}</p>}
    </div>
  );
}
