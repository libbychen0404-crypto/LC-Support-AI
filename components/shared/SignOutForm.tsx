'use client';

import { useState } from 'react';
import { submitRealSignOut } from '@/components/auth/realAuthClient';

export function SignOutForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignOut() {
    setIsSubmitting(true);

    try {
      const result = await submitRealSignOut(fetch);
      window.location.assign(result.redirectTo);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <button className="secondary-button" type="button" onClick={handleSignOut} disabled={isSubmitting}>
      {isSubmitting ? 'Signing Out...' : 'Sign Out'}
    </button>
  );
}
