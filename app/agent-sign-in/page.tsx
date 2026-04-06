import { redirect } from 'next/navigation';
import { AgentSignInForm } from '@/components/auth/AgentSignInForm';
import { resolveServerAuthContext } from '@/lib/auth';

export default async function AgentSignInPage() {
  const authContext = await resolveServerAuthContext();

  if (authContext.isAuthenticated) {
    redirect(authContext.role === 'agent' ? '/admin' : '/chat');
  }

  return (
    <main className="home-shell auth-entry-shell">
      <section className="auth-card panel">
        <div className="panel-heading">
          <p className="eyebrow">Support Team Access</p>
          <h2>Agent sign-in</h2>
          <p>Use your real support agent account to enter the protected admin workspace.</p>
        </div>
        <AgentSignInForm />
      </section>
    </main>
  );
}
