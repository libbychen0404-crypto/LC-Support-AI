import Link from 'next/link';
import { redirect } from 'next/navigation';
import { resolveServerAuthContext } from '@/lib/auth';

export default async function RealLandingPage() {
  const authContext = await resolveServerAuthContext();

  if (authContext.isAuthenticated) {
    redirect(authContext.role === 'agent' ? '/admin' : '/chat');
  }

  return (
    <main className="home-shell auth-entry-shell">
      <section className="auth-card panel">
        <div className="panel-heading">
          <p className="eyebrow">Real User Access</p>
          <h2>Access the real support platform</h2>
          <p>
            Use these entry points for real customer and agent accounts. The public homepage remains the
            separate seeded demo experience.
          </p>
        </div>

        <div className="auth-actions">
          <Link href="/sign-up" className="primary-button">
            Create Customer Account
          </Link>
          <Link href="/sign-in" className="secondary-button">
            Customer Sign In
          </Link>
          <Link href="/agent-sign-in" className="secondary-button">
            Agent Sign In
          </Link>
        </div>
      </section>
    </main>
  );
}
