import { redirect } from 'next/navigation';
import { CustomerSignInForm } from '@/components/auth/CustomerSignInForm';
import { resolveServerAuthContext } from '@/lib/auth';

export default async function SignInPage() {
  const authContext = await resolveServerAuthContext();

  if (authContext.isAuthenticated) {
    redirect(authContext.role === 'agent' ? '/admin' : '/chat');
  }

  return (
    <main className="home-shell auth-entry-shell">
      <section className="auth-card panel">
        <div className="panel-heading">
          <p className="eyebrow">Real User Access</p>
          <h2>Sign in to your support account</h2>
          <p>Use your real LC AI Support customer account to continue an existing case or start a new request.</p>
        </div>
        <CustomerSignInForm />
      </section>
    </main>
  );
}
