import { redirect } from 'next/navigation';
import { CustomerSignUpForm } from '@/components/auth/CustomerSignUpForm';
import { resolveServerAuthContext } from '@/lib/auth';

export default async function SignUpPage() {
  const authContext = await resolveServerAuthContext();

  if (authContext.isAuthenticated) {
    redirect(authContext.role === 'agent' ? '/admin' : '/chat');
  }

  return (
    <main className="home-shell auth-entry-shell">
      <section className="auth-card panel">
        <div className="panel-heading">
          <p className="eyebrow">Real User Access</p>
          <h2>Create your support account</h2>
          <p>Set up a real customer account to use the protected support workspace outside the seeded demo flow.</p>
        </div>
        <CustomerSignUpForm />
      </section>
    </main>
  );
}
